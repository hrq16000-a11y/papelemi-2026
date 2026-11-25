import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { applyShippingRules, manualShippingOption, packShippingCart, quoteCorreiosEstimate, roundShippingMoney, type ShippingOptionDraft } from "@/lib/shipping-quote";

type AdminClient = SupabaseClient<Database>;
type ProductShippingRow = Pick<Database["public"]["Tables"]["products"]["Row"], "slug" | "name" | "price" | "promo_price" | "weight_kg" | "requires_shipping">;
type ShippingOption = ShippingOptionDraft & { id: string };

export type ShippingQuoteResult = {
  options: ShippingOption[];
  selectedOption: ShippingOption | null;
  selectedOptionId: string | null;
  selectionChanged: boolean;
  shipping: number;
  destinationZip: string | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 2500;
const RATE_LIMIT_PER_MINUTE = 20;

function createOptionId(option: ShippingOptionDraft): string {
  return createHash("sha256").update(JSON.stringify({
    provider: option.provider,
    service: option.service_name,
    price: roundShippingMoney(option.price),
    eta: option.estimated_delivery_days,
    estimated: option.estimated,
    requiresConfirmation: option.requiresConfirmation,
    pickupAddress: option.pickupAddress ?? "",
  })).digest("hex").slice(0, 32);
}

function getClientIpHash(): string {
  let request: Request | undefined;
  try { request = getRequest(); } catch { /* server context may be unavailable in isolated tests */ }
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const rawIp = (forwarded || request?.headers.get("x-real-ip") || "unknown").slice(0, 64);
  return createHash("sha256").update(rawIp).digest("hex");
}

async function auditShippingEvent(
  admin: AdminClient,
  event: {
    event_type: string;
    destination_zip?: string;
    cart_snapshot?: Json;
    provider_name?: string | null;
    error_message?: string | null;
    http_status?: number | null;
    total_weight_kg?: number | null;
    melhor_envio_has_key?: boolean | null;
    estimated?: boolean | null;
  },
) {
  try { await admin.from("shipping_audit_logs").insert({ store_key: "papelemi", ...event }); }
  catch { /* audit is best-effort and must not block checkout */ }
}

async function readProviderCache(admin: AdminClient, cacheKey: string): Promise<ShippingOptionDraft[] | null> {
  try {
    const { data, error } = await admin.from("shipping_quote_cache")
      .select("options,created_at")
      .eq("store_key", "papelemi")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (error || !data || Date.now() - new Date(data.created_at).getTime() > CACHE_TTL_MS) return null;
    return Array.isArray(data.options) ? data.options as unknown as ShippingOptionDraft[] : null;
  } catch { return null; }
}

async function writeProviderCache(admin: AdminClient, cacheKey: string, options: ShippingOptionDraft[]) {
  try {
    await admin.from("shipping_quote_cache").upsert({
      store_key: "papelemi",
      cache_key: cacheKey,
      options: options as unknown as Json,
      created_at: new Date().toISOString(),
    }, { onConflict: "store_key,cache_key" });
  } catch { /* cache is best-effort */ }
}

function isAllowedProviderEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "melhorenvio.com.br" || url.hostname.endsWith(".melhorenvio.com.br"));
  } catch { return false; }
}

async function quoteMelhorEnvio(
  provider: Database["public"]["Tables"]["shipping_providers"]["Row"],
  settings: Database["public"]["Tables"]["shipping_settings"]["Row"],
  context: { originZip: string; destinationZip: string; totalWeight: number; subtotal: number },
): Promise<ShippingOptionDraft[]> {
  if (!provider.api_key || !provider.endpoint_url || !isAllowedProviderEndpoint(provider.endpoint_url)) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const payload = {
      from: { postal_code: context.originZip },
      to: { postal_code: context.destinationZip },
      products: [{
        id: "papelemi-cart",
        width: Number(settings.default_box_width_cm) || 16,
        height: Number(settings.default_box_height_cm) || 11,
        length: Number(settings.default_box_length_cm) || 20,
        weight: Math.max(0.1, context.totalWeight),
        insurance_value: context.subtotal,
        quantity: 1,
      }],
      options: { receipt: false, own_hand: false, insurance_value: context.subtotal },
    };
    const response = await fetch(provider.endpoint_url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.api_key}`,
        "User-Agent": "PapeLemi (contato@papelemi.com.br)",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = new Error("Melhor Envio indisponível.");
      Object.assign(error, { status: response.status });
      throw error;
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return [];
    return body.flatMap((raw): ShippingOptionDraft[] => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const price = Number(row["price"]);
      if (row["error"] || !Number.isFinite(price) || price <= 0) return [];
      const company = row["company"] && typeof row["company"] === "object" ? row["company"] as Record<string, unknown> : {};
      const range = row["delivery_range"] && typeof row["delivery_range"] === "object" ? row["delivery_range"] as Record<string, unknown> : {};
      const min = String(range["min"] ?? "?");
      const max = String(range["max"] ?? "?");
      return [{
        provider: String(company["name"] ?? provider.provider_name),
        service_name: String(row["name"] ?? "Entrega"),
        price: roundShippingMoney(price),
        estimated_delivery_days: `${min}–${max} dias úteis`,
        estimated: false,
        requiresConfirmation: false,
      }];
    });
  } finally { clearTimeout(timeout); }
}

export async function buildShippingQuote(input: {
  admin: AdminClient;
  destinationZip?: string;
  destinationState?: string;
  items: Array<{ slug: string; qty: number }>;
  products: ProductShippingRow[];
  subtotal: number;
  selectedOptionId?: string;
}): Promise<ShippingQuoteResult> {
  const destinationZip = input.destinationZip?.replace(/\D/g, "") ?? "";
  if (!/^\d{8}$/.test(destinationZip)) {
    return { options: [], selectedOption: null, selectedOptionId: null, selectionChanged: Boolean(input.selectedOptionId), shipping: 0, destinationZip: null };
  }

  const { data: attempts, error: limitError } = await input.admin.rpc("consume_shipping_quote_rate_limit", {
    _ip_hash: getClientIpHash(),
    _window_start: new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString(),
    _limit: RATE_LIMIT_PER_MINUTE,
  });
  if (limitError) throw new Error("Não foi possível validar a solicitação de frete. Tente novamente.");
  if ((attempts ?? 0) > RATE_LIMIT_PER_MINUTE) throw new Error("Muitas cotações em sequência. Aguarde um minuto e tente novamente.");

  const [settingsResult, providersResult, rulesResult] = await Promise.all([
    input.admin.from("shipping_settings").select("*").eq("store_key", "papelemi").eq("singleton", true).maybeSingle(),
    input.admin.from("shipping_providers").select("*").eq("store_key", "papelemi").eq("is_active", true),
    input.admin.from("shipping_rules").select("*").eq("store_key", "papelemi").eq("is_active", true).order("priority", { ascending: false }),
  ]);
  if (settingsResult.error) throw new Error("Não foi possível consultar as configurações de frete.");
  if (providersResult.error || rulesResult.error) throw new Error("Não foi possível consultar as regras de frete.");

  const settings = settingsResult.data;
  const providers = providersResult.data ?? [];
  const rules = rulesResult.data ?? [];
  const productsBySlug = new Map(input.products.map((product) => [product.slug, product]));
  const cartItems = input.items.flatMap((item) => {
    const product = productsBySlug.get(item.slug);
    if (!product) return [];
    return [{
      quantity: item.qty,
      weight_kg: product.weight_kg == null ? null : Number(product.weight_kg),
      unit_price: product.promo_price != null && Number(product.promo_price) > 0 ? Number(product.promo_price) : Number(product.price),
      requires_shipping: product.requires_shipping !== false,
    }];
  });

  let options: ShippingOptionDraft[] = [];
  let totalWeight = 0;
  let shippableSubtotal = 0;
  const originZip = String(settings?.origin_zip_code ?? "").replace(/\D/g, "");

  if (!settings || !settings.is_enabled || originZip.length !== 8) {
    options.push(manualShippingOption());
  } else {
    const packed = packShippingCart(cartItems, Number(settings.default_box_weight_kg) || 0.15);
    totalWeight = packed.totalWeight;
    shippableSubtotal = packed.subtotal;

    if (packed.shippable.length === 0) {
      options.push({ provider: "PapeLemi", service_name: "Produto sem necessidade de envio", price: 0, estimated_delivery_days: "Sem envio", estimated: false, requiresConfirmation: false });
    } else if (originZip === destinationZip) {
      options.push({ provider: "PapeLemi", service_name: "Entrega local (confirmação da equipe)", price: 0, estimated_delivery_days: "A combinar", estimated: false, requiresConfirmation: true });
    } else {
      const provider = providers.find((item) => item.provider_code === "melhor_envio");
      let providerOptions: ShippingOptionDraft[] = [];
      if (provider?.api_key && provider.endpoint_url) {
        const cachePayload = JSON.stringify({
          originZip, destinationZip, totalWeight, shippableSubtotal,
          box: [settings.default_box_width_cm, settings.default_box_height_cm, settings.default_box_length_cm],
        });
        const cacheKey = createHash("sha256").update(cachePayload).digest("hex");
        const cached = await readProviderCache(input.admin, cacheKey);
        if (cached?.length) providerOptions = cached;
        else {
          try {
            providerOptions = await quoteMelhorEnvio(provider, settings, { originZip, destinationZip, totalWeight, subtotal: shippableSubtotal });
            if (providerOptions.length) await writeProviderCache(input.admin, cacheKey, providerOptions);
          } catch (error) {
            const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: unknown }).status) : null;
            await auditShippingEvent(input.admin, {
              event_type: error instanceof Error && error.name === "AbortError" ? "provider_timeout" : "provider_error",
              destination_zip: destinationZip,
              provider_name: provider.provider_name,
              error_message: "O provedor não respondeu à cotação.",
              http_status: status,
              total_weight_kg: totalWeight,
              melhor_envio_has_key: true,
            });
          }
        }
      }

      if (providerOptions.length) options = providerOptions;
      else {
        options = quoteCorreiosEstimate({ totalWeight, destinationZip, originZip });
        await auditShippingEvent(input.admin, {
          event_type: "estimate_fallback",
          destination_zip: destinationZip,
          cart_snapshot: { items: input.items, subtotal: input.subtotal } as unknown as Json,
          provider_name: provider?.provider_name ?? null,
          error_message: provider?.api_key ? "Cotação real indisponível; estimativa aproximada exibida." : "Provedor sem credenciais; estimativa aproximada exibida.",
          total_weight_kg: totalWeight,
          melhor_envio_has_key: Boolean(provider?.api_key),
          estimated: true,
        });
      }
    }

    const markup = Number(settings.shipping_markup_percentage) || 0;
    const handlingFee = Number(settings.handling_fee) || 0;
    options = options.map((option) => ({
      ...option,
      price: option.price === 0 ? 0 : roundShippingMoney(option.price * (1 + markup / 100) + handlingFee),
    }));
    options = applyShippingRules(options, { subtotal: input.subtotal, state: input.destinationState, destinationZip }, rules);
    if (settings.free_shipping_enabled && input.subtotal >= Number(settings.free_shipping_threshold)) {
      options.sort((a, b) => a.price - b.price);
      if (options[0]) options[0] = { ...options[0], price: 0, service_name: `${options[0].service_name} · Frete grátis` };
    }
  }

  if (settings?.pickup_enabled) {
    options.push({
      provider: "PapeLemi",
      service_name: settings.pickup_label || "Retirada no ateliê",
      price: 0,
      estimated_delivery_days: "Retirada",
      estimated: false,
      requiresConfirmation: false,
      pickupAddress: settings.pickup_address || "",
      pickupInstructions: settings.pickup_instructions || "",
    });
  }

  if (!options.length) options = [manualShippingOption()];
  options.sort((a, b) => a.price - b.price);
  const withIds = options.map((option) => ({ ...option, id: createOptionId(option) }));
  const selectedOption = input.selectedOptionId ? withIds.find((option) => option.id === input.selectedOptionId) ?? null : null;
  return {
    options: withIds,
    selectedOption,
    selectedOptionId: selectedOption?.id ?? null,
    selectionChanged: Boolean(input.selectedOptionId && !selectedOption),
    shipping: selectedOption ? roundShippingMoney(selectedOption.price) : 0,
    destinationZip,
  };
}
