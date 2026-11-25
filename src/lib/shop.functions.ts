import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { confirmOrderByReference, mpConfigured, mpRequest } from "@/lib/mp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { calculateOrderTotals, isSameOrderRequest, prepareOrderItems, roundMoney, type OrderLineInput } from "@/lib/order-integrity";
import { buildCustomerSummaries, type CustomerOrderRow } from "@/lib/customer-summary";

const PUBLISHED_ORIGIN = "https://www.papelemi.com.br";

// Cliente público (somente leitura) para dados abertos da loja.
function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Banco de dados não configurado");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { getCatalogFromDatabase } = await import("@/lib/catalog.repository.server");
  return getCatalogFromDatabase();
});

export const getCatalogProduct = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { getPublishedProductWithFallback } = await import("@/lib/catalog.repository.server");
    return getPublishedProductWithFallback(data.slug);
  });

export const getCatalogCategory = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().trim().min(1).max(80) }))
  .handler(async ({ data }) => {
    const { getPublishedCategoryWithFallback } = await import("@/lib/catalog.repository.server");
    return getPublishedCategoryWithFallback(data.slug);
  });

export const getCuratedPhrases = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb.from("curated_phrases").select("id,phrase,occasion").eq("active", true).order("created_at", { ascending: false }).limit(12);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const validateCoupon = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string().trim().min(2).max(40) }))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb.from("coupons").select("code,percent").eq("code", data.code.toUpperCase()).eq("active", true).maybeSingle();
    if (error) throw new Error("Não foi possível consultar o cupom.");
    return row ? { code: row.code, percent: row.percent } : null;
  });

const orderLineInput = z.object({
  slug: z.string().trim().min(1).max(80),
  qty: z.number().int().min(1).max(999),
  options: z.record(z.string().max(60), z.string().max(500)).refine((options) => Object.keys(options).length <= 23, "Número de opções inválido."),
});

const quoteInput = z.object({
  items: z.array(orderLineInput).min(1).max(50),
  couponCode: z.string().trim().toUpperCase().min(2).max(40).optional(),
});

const orderInput = quoteInput.extend({
  requestId: z.string().uuid(),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120).toLowerCase(),
    phone: z.string().trim().min(10).max(20).refine((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length === 10 || digits.length === 11;
    }, "Telefone inválido. Informe DDD e número."),
  }),
  address: z.object({
    cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
    street: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(80).default(""),
    district: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "UF inválida"),
  }),
  origin: z.string().url().max(200).optional(),
  customerNotes: z.string().trim().max(1000).default(""),
  acceptedPrivacy: z.literal(true),
  quoteToken: z.string().regex(/^[a-f0-9]{64}$/),
});

type QuoteInput = z.infer<typeof quoteInput>;

async function buildOrderQuote(input: QuoteInput) {
  const { productFromRow } = await import("@/lib/catalog.repository.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as SupabaseClient;
  const slugs = [...new Set(input.items.map((item) => item.slug))];
  const { data: rows, error } = await admin
    .from("products")
    .select("*")
    .in("slug", slugs)
    .eq("published", true);

  if (error) throw new Error("Não foi possível consultar os produtos. Tente novamente.");
  const products = (rows ?? []).map((row) => productFromRow(row));
  const items = prepareOrderItems(products, input.items as OrderLineInput[]);

  let couponCode: string | null = null;
  let couponPercent: number | null = null;
  if (input.couponCode) {
    const { data: coupon, error: couponError } = await admin
      .from("coupons")
      .select("code,percent")
      .eq("code", input.couponCode)
      .eq("active", true)
      .maybeSingle();

    if (couponError) throw new Error("Não foi possível revalidar o cupom. Tente novamente.");
    if (!coupon) throw new Error("Cupom inválido ou inativo. Remova o cupom e tente novamente.");
    couponCode = coupon.code;
    couponPercent = Number(coupon.percent);
  }

  return {
    items,
    couponCode,
    ...calculateOrderTotals(items, couponPercent),
  };
}

async function createQuoteToken(quote: Awaited<ReturnType<typeof buildOrderQuote>>) {
  const { createHash } = await import("node:crypto");
  const payload = JSON.stringify({
    items: quote.items,
    couponCode: quote.couponCode,
    subtotal: quote.subtotal,
    discount: quote.discount,
    shipping: quote.shipping,
    total: quote.total,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export const getOrderQuote = createServerFn({ method: "POST" })
  .validator(quoteInput)
  .handler(async ({ data }) => {
    const quote = await buildOrderQuote(data);
    const quoteToken = await createQuoteToken(quote);
    return {
      items: quote.items.map((item) => ({
        ...item,
        line_total: roundMoney(item.unit_price * item.qty),
      })),
      couponCode: quote.couponCode,
      quoteToken,
      subtotal: quote.subtotal,
      discount: quote.discount,
      shipping: quote.shipping,
      total: quote.total,
    };
  });

function safeOrigin(origin?: string) {
  try {
    const parsed = new URL(origin ?? "");
    if (parsed.protocol === "https:" && ["papelemi.com.br", "www.papelemi.com.br"].includes(parsed.hostname)) return parsed.origin;
  } catch { /* ignora */ }
  return PUBLISHED_ORIGIN;
}

export const createOrder = createServerFn({ method: "POST" })
  .validator(orderInput)
  .handler(async ({ data: input }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const quote = await buildOrderQuote(input);
    if (await createQuoteToken(quote) !== input.quoteToken) {
      throw new Error("PRICE_CHANGED: Os valores ou condições mudaram. O resumo foi atualizado; confira antes de enviar novamente.");
    }
    const orderValues = {
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
      address: {
        cep: input.address.cep.replace(/\D/g, ""),
        street: input.address.street,
        number: input.address.number,
        complement: input.address.complement,
        district: input.address.district,
        city: input.address.city,
        state: input.address.state,
      },
      items: quote.items,
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      discount: quote.discount,
      coupon_code: quote.couponCode,
      total: quote.total,
      store_key: "papelemi",
      customer_notes: input.customerNotes,
      accepted_privacy: input.acceptedPrivacy,
      privacy_consent_at: new Date().toISOString(),
      source: "storefront",
    };

    // The existing orders.id primary key is the idempotency key; no schema change is needed.
    const { data: inserted, error: insertError } = await admin
      .from("orders")
      .upsert(
        { id: input.requestId, ...orderValues },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (insertError) throw new Error("Não foi possível registrar a encomenda. Tente novamente.");

    let orderId = inserted?.id as string | undefined;
    if (!orderId) {
      const { data: existing, error: lookupError } = await admin
        .from("orders")
        .select("*")
        .eq("id", input.requestId)
        .eq("store_key", "papelemi")
        .maybeSingle();

      if (lookupError) throw new Error("Não foi possível confirmar a solicitação anterior.");
      if (!existing || !isSameOrderRequest(existing, orderValues)) {
        throw new Error("ORDER_REQUEST_CONFLICT: Esta tentativa já foi usada com outros dados. Gere uma nova tentativa e envie novamente.");
      }
      orderId = existing.id as string;
    }

    let initPoint: string | null = null;
    const paymentReady = mpConfigured();
    if (paymentReady) {
      const origin = safeOrigin(input.origin);
      const pref = (await mpRequest("checkout/preferences", {
        method: "POST",
        idempotencyKey: `pref-${orderId}-1`,
        body: {
          items: [{ title: `Pedido PapeLemi ${orderId.slice(0, 8)}`, quantity: 1, unit_price: quote.total, currency_id: "BRL" }],
          external_reference: orderId,
          back_urls: {
            success: `${origin}/pedido/${orderId}`,
            pending: `${origin}/pedido/${orderId}`,
            failure: `${origin}/pedido/${orderId}`,
          },
          auto_return: "approved",
          notification_url: `${PUBLISHED_ORIGIN}/api/public/mercadopago-webhook`,
        },
      })) as { init_point?: string };
      initPoint = pref.init_point ?? null;
    }
    return { orderId, initPoint, total: quote.total, paymentReady };
  });

export const getOrderStatus = createServerFn({ method: "GET" })
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const readOrder = () => admin
      .from("orders")
      .select("status,total")
      .eq("id", data.orderId)
      .eq("store_key", "papelemi")
      .maybeSingle();

    const { data: initial, error: initialError } = await readOrder();
    if (initialError || !initial) throw new Error("Pedido não encontrado");

    if (mpConfigured() && initial.status === "pending") {
      try { await confirmOrderByReference(data.orderId); } catch { /* segue com o status atual */ }
    }

    const { data: order, error } = await readOrder();
    if (error || !order) throw new Error("Pedido não encontrado");
    return { status: !mpConfigured() && order.status === "pending" ? "received" : order.status, total: Number(order.total) };
  });

// ===== Administração (exige papel de admin) =====

type AdminCtx = { supabase: ReturnType<typeof publicClient>; userId: string };
async function requireAdmin(context: AdminCtx) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Acesso restrito ao administrador da loja");
}

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { isAdmin: Boolean(data) };
  });

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    // A tabela orders aceita acesso somente pelo servidor (service_role).
    // A autorização do usuário é validada antes de usar o cliente privilegiado.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const { data, error } = await admin
      .from("orders")
      .select("*")
      .eq("store_key", "papelemi")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const pageSize = 1000;
    const maxOrders = 20000;
    const rows: CustomerOrderRow[] = [];
    let truncated = false;

    for (let offset = 0; offset < maxOrders; offset += pageSize) {
      const { data, error } = await admin
        .from("orders")
        .select("customer_name,customer_email,customer_phone,status,created_at")
        .eq("store_key", "papelemi")
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) throw new Error(error.message);
      const page = (data ?? []).map((row) => ({
        customer_name: String(row.customer_name ?? ""),
        customer_email: String(row.customer_email ?? ""),
        customer_phone: String(row.customer_phone ?? ""),
        status: String(row.status ?? ""),
        created_at: String(row.created_at ?? ""),
      }));
      rows.push(...page);
      if (page.length < pageSize) break;
      if (offset + page.length >= maxOrders) truncated = true;
    }

    return {
      customers: buildCustomerSummaries(rows),
      scannedOrders: rows.length,
      truncated,
    };
  });

export const setOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid(), status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    // Atualizações usam service_role somente após validar o papel do usuário.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const { error } = await admin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("store_key", "papelemi");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const productInput = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Use letras minúsculas, números e hífens"),
  categorySlug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).default(""),
  images: z.array(z.string().url().max(400)).max(6).default([]),
  price: z.number().min(0.5).max(99999),
  promoPrice: z.number().min(0.5).max(99999).nullable().default(null),
  colors: z.array(z.string().trim().max(40)).max(12).default([]),
  sizes: z.array(z.string().trim().max(40)).max(12).default([]),
  finishes: z.array(z.string().trim().max(60)).max(12).default([]),
  productionDays: z.string().trim().max(60).default(""),
  stock: z.number().int().min(0).max(99999).default(0),
  published: z.boolean().default(true),
  bestSeller: z.boolean().default(false),
  personalizable: z.boolean().default(false),
  minQty: z.number().int().min(1).max(999).nullable().default(null),
});

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { productFromRow } = await import("@/lib/catalog.repository.server");
    const { data, error } = await context.supabase.from("products").select("*").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...productFromRow(r), minQty: r.min_qty ?? null }));
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(productInput)
  .handler(async ({ context, data: p }) => {
    await requireAdmin(context);
    const { data: existing } = await context.supabase.from("products").select("personalization").eq("slug", p.slug).maybeSingle();
    const { error } = await context.supabase.from("products").upsert({
      slug: p.slug,
      category_slug: p.categorySlug,
      name: p.name,
      description: p.description,
      images: p.images,
      price: p.price,
      promo_price: p.promoPrice,
      colors: p.colors,
      sizes: p.sizes,
      finishes: p.finishes,
      production_days: p.productionDays,
      stock: p.stock,
      published: p.published,
      best_seller: p.bestSeller,
      personalizable: p.personalizable,
      min_qty: p.minQty,
      personalization: existing?.personalization ?? [],
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ slug: z.string().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("products").delete().eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const categoryInput = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Use letras minúsculas, números e hífens"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  image: z.string().trim().url().max(400).or(z.literal("")).default(""),
  sort: z.number().int().min(0).max(999).default(0),
});

export const listAdminCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.from("categories").select("*").order("sort");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(categoryInput)
  .handler(async ({ context, data: c }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("categories").upsert({ slug: c.slug, name: c.name, description: c.description, image: c.image, sort: c.sort });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ slug: z.string().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("categories").delete().eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdminPhrases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.from("curated_phrases").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const savePhrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    id: z.string().uuid().optional(),
    phrase: z.string().trim().min(3).max(220),
    occasion: z.string().trim().max(60).default(""),
    active: z.boolean().default(true),
  }))
  .handler(async ({ context, data: p }) => {
    await requireAdmin(context);
    const row = { phrase: p.phrase, occasion: p.occasion, active: p.active };
    const { error } = p.id
      ? await context.supabase.from("curated_phrases").update(row).eq("id", p.id)
      : await context.supabase.from("curated_phrases").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePhrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("curated_phrases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdminCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.from("coupons").select("*").order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9]+$/, "Use letras maiúsculas e números"),
    percent: z.number().int().min(1).max(90),
    active: z.boolean().default(true),
  }))
  .handler(async ({ context, data: c }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("coupons").upsert({ code: c.code, percent: c.percent, active: c.active });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ code: z.string().min(2).max(40) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("coupons").delete().eq("code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
