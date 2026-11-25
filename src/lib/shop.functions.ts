import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { confirmOrderByReference, mpConfigured, mpRequest } from "@/lib/mp";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { categoryAdminSchema, productAdminSchema } from "@/lib/catalog-validation";
import { calculateOrderTotals, isSameOrderRequest, prepareOrderItems, roundMoney, type OrderLineInput } from "@/lib/order-integrity";

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
  const { data, error } = await sb.from("curated_phrases").select("id,phrase,occasion").eq("store_key", "papelemi").eq("active", true).order("created_at", { ascending: false }).limit(12);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const validateCoupon = createServerFn({ method: "GET" })
  .validator(z.object({ code: z.string().trim().min(2).max(40) }))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb.from("coupons").select("code,percent").eq("store_key", "papelemi").eq("code", data.code.toUpperCase()).eq("active", true).maybeSingle();
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
  destinationZip: z.string().trim().regex(/^\d{5}-?\d{3}$/).optional(),
  destinationState: z.string().trim().regex(/^[A-Za-z]{2}$/).optional(),
  shippingOptionId: z.string().trim().min(8).max(64).optional(),
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
  destinationZip: z.string().trim().regex(/^\d{5}-?\d{3}$/),
  shippingOptionId: z.string().trim().min(8).max(64),
}).refine((input) => input.destinationZip.replace(/\D/g, "") === input.address.cep.replace(/\D/g, ""), {
  path: ["destinationZip"],
  message: "O CEP utilizado na cotação precisa ser o mesmo do endereço de entrega.",
});

type QuoteInput = z.infer<typeof quoteInput>;

async function buildOrderQuote(input: QuoteInput) {
  const { productFromRow } = await import("@/lib/catalog.repository.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
  const slugs = [...new Set(input.items.map((item) => item.slug))];
  const { data: rows, error } = await admin
    .from("products")
    .select("*")
    .in("slug", slugs)
    .eq("store_key", "papelemi")
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
      .eq("store_key", "papelemi")
      .eq("code", input.couponCode)
      .eq("active", true)
      .maybeSingle();

    if (couponError) throw new Error("Não foi possível revalidar o cupom. Tente novamente.");
    if (!coupon) throw new Error("Cupom inválido ou inativo. Remova o cupom e tente novamente.");
    couponCode = coupon.code;
    couponPercent = Number(coupon.percent);
  }

  const totals = calculateOrderTotals(items, couponPercent);
  const { buildShippingQuote } = await import("@/lib/shipping-quote.server");
  const shippingQuote = await buildShippingQuote({
    admin,
    ...(input.destinationZip ? { destinationZip: input.destinationZip } : {}),
    ...(input.destinationState ? { destinationState: input.destinationState } : {}),
    items: input.items,
    products: rows ?? [],
    subtotal: totals.subtotal,
    ...(input.shippingOptionId ? { selectedOptionId: input.shippingOptionId } : {}),
  });
  return {
    items,
    couponCode,
    subtotal: totals.subtotal,
    discount: totals.discount,
    shipping: shippingQuote.shipping,
    total: roundMoney(totals.subtotal - totals.discount + shippingQuote.shipping),
    shippingOptions: shippingQuote.options,
    selectedShippingOption: shippingQuote.selectedOption,
    selectedShippingOptionId: shippingQuote.selectedOptionId,
    shippingSelectionChanged: shippingQuote.selectionChanged,
    destinationZip: shippingQuote.destinationZip,
    destinationState: shippingQuote.destinationState,
  };
}

async function createQuoteToken(quote: Awaited<ReturnType<typeof buildOrderQuote>>) {
  const { createHash } = await import("node:crypto");
  const payload = JSON.stringify({
    items: quote.items,
    couponCode: quote.couponCode,
    destinationZip: quote.destinationZip,
    destinationState: quote.destinationState,
    selectedShippingOption: quote.selectedShippingOption,
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
      shippingOptions: quote.shippingOptions,
      selectedShippingOption: quote.selectedShippingOption,
      selectedShippingOptionId: quote.selectedShippingOptionId,
      shippingSelectionChanged: quote.shippingSelectionChanged,
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
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const quote = await buildOrderQuote(input);
    if (!quote.selectedShippingOption) {
      throw new Error("SHIPPING_CHANGED: Selecione novamente uma opção de frete antes de registrar a encomenda.");
    }
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
        shipping: quote.selectedShippingOption ? {
          option_id: quote.selectedShippingOption.id,
          provider: quote.selectedShippingOption.provider,
          service_name: quote.selectedShippingOption.service_name,
          estimated_delivery_days: quote.selectedShippingOption.estimated_delivery_days,
          estimated: quote.selectedShippingOption.estimated,
          requires_confirmation: quote.selectedShippingOption.requiresConfirmation,
          pickup_address: quote.selectedShippingOption.pickupAddress ?? "",
          pickup_instructions: quote.selectedShippingOption.pickupInstructions ?? "",
        } : null,
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

    // Persist normalized CRM and order lines while retaining the original JSONB order snapshot.
    const normalizedEmail = input.customer.email.trim().toLowerCase();
    const { data: customer, error: customerError } = await admin.from("customers").upsert({
      store_key: "papelemi",
      name: input.customer.name,
      email: input.customer.email,
      email_normalized: normalizedEmail,
      phone: input.customer.phone,
      whatsapp: input.customer.phone,
      city: input.address.city,
      state: input.address.state,
      source: "storefront",
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_key,email_normalized" }).select("id").single();
    if (customerError || !customer?.id) throw new Error("Não foi possível atualizar o cadastro do cliente.");

    const { error: customerLinkError } = await admin.from("orders")
      .update({ customer_id: customer.id }).eq("id", orderId).eq("store_key", "papelemi");
    if (customerLinkError) throw new Error("Não foi possível vincular o pedido ao cadastro do cliente.");

    const orderItemRows = quote.items.map((item, index) => ({
      store_key: "papelemi",
      order_id: orderId,
      line_number: index + 1,
      product_slug: item.slug,
      product_name: item.name,
      quantity: item.qty,
      unit_price: item.unit_price,
      line_total: roundMoney(item.unit_price * item.qty),
      personalization: item.options,
    }));
    const { error: orderItemsError } = await admin.from("order_items").upsert(orderItemRows, {
      onConflict: "store_key,order_id,line_number",
      ignoreDuplicates: true,
    });
    if (orderItemsError) throw new Error("Não foi possível registrar os itens do pedido.");

    let initPoint: string | null = null;
    const paymentReady = mpConfigured() && !quote.selectedShippingOption.requiresConfirmation;
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
    return { orderId, initPoint, total: quote.total, paymentReady, shippingRequiresConfirmation: quote.selectedShippingOption.requiresConfirmation };
  });

export const getOrderStatus = createServerFn({ method: "GET" })
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
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
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
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
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const pageSize = 1000;
    const maxRows = 20000;
    const customerRows: Record<string, unknown>[] = [];
    let customersTruncated = false;

    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const { data, error } = await admin.from("customers")
        .select("id,name,email,phone,whatsapp,city,state,source,status,tags,notes,created_at,updated_at")
        .eq("store_key", "papelemi")
        .order("updated_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Record<string, unknown>[];
      customerRows.push(...page);
      if (page.length < pageSize) break;
      if (offset + page.length >= maxRows) customersTruncated = true;
    }

    const orderStats = new Map<string, { count: number; firstOrderAt: string; lastOrderAt: string; lastOrderStatus: string }>();
    let scannedOrders = 0;
    let ordersTruncated = false;
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const { data, error } = await admin.from("orders")
        .select("customer_id,status,created_at")
        .eq("store_key", "papelemi")
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Record<string, unknown>[];
      scannedOrders += page.length;
      for (const row of page) {
        const customerId = String(row["customer_id"] ?? "");
        if (!customerId) continue;
        const createdAt = String(row["created_at"] ?? "");
        const status = String(row["status"] ?? "");
        const current = orderStats.get(customerId);
        if (!current) {
          orderStats.set(customerId, { count: 1, firstOrderAt: createdAt, lastOrderAt: createdAt, lastOrderStatus: status });
          continue;
        }
        current.count += 1;
        if (createdAt && (!current.firstOrderAt || createdAt < current.firstOrderAt)) current.firstOrderAt = createdAt;
        if (createdAt >= current.lastOrderAt) {
          current.lastOrderAt = createdAt;
          current.lastOrderStatus = status;
        }
      }
      if (page.length < pageSize) break;
      if (offset + page.length >= maxRows) ordersTruncated = true;
    }

    return {
      customers: customerRows.map((row) => {
        const id = String(row["id"] ?? "");
        const stats = orderStats.get(id);
        const createdAt = String(row["created_at"] ?? row["updated_at"] ?? "");
        return {
          id,
          email: String(row["email"] ?? ""),
          name: String(row["name"] ?? ""),
          phone: String(row["phone"] ?? ""),
          whatsapp: String(row["whatsapp"] ?? ""),
          ordersCount: stats?.count ?? 0,
          firstOrderAt: stats?.firstOrderAt ?? createdAt,
          lastOrderAt: stats?.lastOrderAt ?? createdAt,
          lastOrderStatus: stats?.lastOrderStatus ?? "no_orders",
          city: String(row["city"] ?? ""),
          state: String(row["state"] ?? ""),
          source: String(row["source"] ?? ""),
          status: String(row["status"] ?? "active"),
          tags: Array.isArray(row["tags"]) ? row["tags"].map((tag) => String(tag)) : [],
          notes: String(row["notes"] ?? ""),
        };
      }),
      scannedOrders,
      truncated: customersTruncated || ordersTruncated,
    };
  });

const customerInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().max(254).refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "E-mail inválido").default(""),
  phone: z.string().trim().max(40).default(""),
  whatsapp: z.string().trim().max(40).default(""),
  city: z.string().trim().max(100).default(""),
  state: z.string().trim().max(2).default(""),
  status: z.enum(["active", "inactive"]).default("active"),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  notes: z.string().trim().max(2000).default(""),
});

export const saveCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(customerInput)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const email = data.email || null;
    const values = {
      store_key: "papelemi",
      name: data.name,
      email,
      email_normalized: email ? email.toLowerCase() : null,
      phone: data.phone || null,
      whatsapp: data.whatsapp || null,
      city: data.city || null,
      state: data.state.toUpperCase() || null,
      status: data.status,
      tags: data.tags,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    };

    const result = data.id
      ? await admin.from("customers").update(values).eq("id", data.id).eq("store_key", "papelemi").select("id").maybeSingle()
      : await admin.from("customers").insert({ ...values, created_by: context.userId, source: "admin" }).select("id").single();

    if (result.error?.code === "23505") {
      throw new Error("Já existe um cliente da PapeLemi com esse e-mail.");
    }
    if (result.error) throw new Error(result.error.message);
    if (!result.data?.id) throw new Error("Cliente não encontrado ou fora da PapeLemi.");
    return { id: result.data.id };
  });

const orderDetailInput = z.object({ id: z.string().uuid() });

export const getOrderDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(orderDetailInput)
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { data: order, error: orderError } = await admin.from("orders")
      .select("*")
      .eq("id", data.id)
      .eq("store_key", "papelemi")
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("Pedido não encontrado nesta loja.");
    const { data: items, error: itemsError } = await admin.from("order_items")
      .select("id,line_number,product_name,product_slug,product_image,quantity,unit_price,line_total,personalization")
      .eq("order_id", data.id)
      .eq("store_key", "papelemi")
      .order("line_number", { ascending: true });
    if (itemsError) throw new Error(itemsError.message);
    return { order, items: items ?? [] };
  });

export const setOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid(), status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    // Atualizações usam service_role somente após validar o papel do usuário.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { error } = await admin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("store_key", "papelemi");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const productInput = productAdminSchema;

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { productFromRow } = await import("@/lib/catalog.repository.server");
    const { data, error } = await context.supabase.from("products").select("*").eq("store_key", "papelemi").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...productFromRow(r), minQty: r.min_qty ?? null }));
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(productInput)
  .handler(async ({ context, data: p }) => {
    await requireAdmin(context);
    const values = {
      store_key: "papelemi",
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
      personalization: p.personalization as Json,
      weight_kg: p.weightKg,
      length_cm: p.lengthCm,
      width_cm: p.widthCm,
      height_cm: p.heightCm,
      requires_shipping: p.requiresShipping,
    };

    if (p.originalSlug && p.originalSlug !== p.slug) {
      const { data, error } = await context.supabase.from("products").update(values)
        .eq("store_key", "papelemi").eq("slug", p.originalSlug).select("slug").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("O produto original não foi encontrado para renomeação.");
    } else {
      const { error } = await context.supabase.from("products").upsert(values, { onConflict: "store_key,slug" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ slug: z.string().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("products").delete().eq("store_key", "papelemi").eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const categoryInput = categoryAdminSchema;

export const listAdminCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.from("categories").select("*").eq("store_key", "papelemi").order("sort");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(categoryInput)
  .handler(async ({ context, data: c }) => {
    await requireAdmin(context);
    const values = { store_key: "papelemi", slug: c.slug, name: c.name, description: c.description, image: c.image, sort: c.sort };
    if (c.originalSlug && c.originalSlug !== c.slug) {
      const { data, error } = await context.supabase.from("categories").update(values)
        .eq("store_key", "papelemi").eq("slug", c.originalSlug).select("slug").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("A categoria original não foi encontrada para renomeação.");
    } else {
      const { error } = await context.supabase.from("categories").upsert(values, { onConflict: "store_key,slug" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ slug: z.string().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("categories").delete().eq("store_key", "papelemi").eq("slug", data.slug);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdminPhrases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.from("curated_phrases").select("*").eq("store_key", "papelemi").order("created_at", { ascending: false });
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
    const row = { store_key: "papelemi", phrase: p.phrase, occasion: p.occasion, active: p.active };
    const { error } = p.id
      ? await context.supabase.from("curated_phrases").update(row).eq("store_key", "papelemi").eq("id", p.id)
      : await context.supabase.from("curated_phrases").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePhrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("curated_phrases").delete().eq("store_key", "papelemi").eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdminCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase.from("coupons").select("*").eq("store_key", "papelemi").order("code");
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
    const { error } = await context.supabase.from("coupons").upsert({ store_key: "papelemi", code: c.code, percent: c.percent, active: c.active }, { onConflict: "store_key,code" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ code: z.string().min(2).max(40) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { error } = await context.supabase.from("coupons").delete().eq("store_key", "papelemi").eq("code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ===== Administração de fretes — sempre limitada ao tenant PapeLemi =====

export const listShippingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { data, error } = await admin.from("shipping_settings")
      .select("*").eq("store_key", "papelemi").eq("singleton", true).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const updateShippingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    id: z.string().uuid(),
    origin_zip_code: z.string().trim().regex(/^(?:[0-9]{8})?$/).optional(),
    is_enabled: z.boolean().optional(),
    default_box_weight_kg: z.number().positive().max(30).optional(),
    default_box_length_cm: z.number().positive().max(200).optional(),
    default_box_width_cm: z.number().positive().max(200).optional(),
    default_box_height_cm: z.number().positive().max(200).optional(),
    handling_fee: z.number().min(0).max(10000).optional(),
    shipping_markup_percentage: z.number().min(0).max(100).optional(),
    pickup_enabled: z.boolean().optional(),
    pickup_label: z.string().trim().min(1).max(80).optional(),
    pickup_address: z.string().trim().max(240).optional(),
    pickup_instructions: z.string().trim().max(500).optional(),
    free_shipping_enabled: z.boolean().optional(),
    free_shipping_threshold: z.number().min(0).max(100000).optional(),
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { id, ...values } = data;
    const patch = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    ) as Database["public"]["Tables"]["shipping_settings"]["Update"];
    patch.updated_at = new Date().toISOString();
    const { error } = await admin.from("shipping_settings")
      .update(patch)
      .eq("id", id).eq("store_key", "papelemi");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listShippingProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { data, error } = await admin.from("shipping_providers")
      .select("id,provider_name,provider_code,is_active,endpoint_url,api_key,api_secret")
      .eq("store_key", "papelemi").order("provider_name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((provider) => ({
      id: provider.id,
      provider_name: provider.provider_name,
      provider_code: provider.provider_code,
      is_active: provider.is_active,
      endpoint_url: provider.endpoint_url,
      has_api_key: Boolean(provider.api_key),
      has_api_secret: Boolean(provider.api_secret),
    }));
  });

export const updateShippingProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    id: z.string().uuid(),
    apiKey: z.string().trim().max(2000).optional(),
    apiSecret: z.string().trim().max(2000).optional(),
    endpointUrl: z.string().url().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { data: current, error: readError } = await admin.from("shipping_providers")
      .select("provider_code,api_key,endpoint_url").eq("id", data.id).eq("store_key", "papelemi").single();
    if (readError || !current) throw new Error("Provedor não encontrado.");

    const nextKey = data.apiKey?.trim() || current.api_key;
    const nextEndpoint = data.endpointUrl !== undefined ? data.endpointUrl : current.endpoint_url;
    if (data.isActive === true && current.provider_code === "melhor_envio" && (!nextKey || !nextEndpoint)) {
      throw new Error("Configure a API Key e o endpoint antes de ativar o Melhor Envio.");
    }

    const patch: Database["public"]["Tables"]["shipping_providers"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (data.apiKey?.trim()) patch.api_key = data.apiKey.trim();
    if (data.apiSecret?.trim()) patch.api_secret = data.apiSecret.trim();
    if (data.endpointUrl !== undefined) patch.endpoint_url = data.endpointUrl;
    if (data.isActive !== undefined) patch.is_active = data.isActive;

    const { error } = await admin.from("shipping_providers").update(patch)
      .eq("id", data.id).eq("store_key", "papelemi");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listShippingRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { data, error } = await admin.from("shipping_rules").select("*")
      .eq("store_key", "papelemi").order("priority", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveShippingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({
    id: z.string().uuid().optional(),
    rule_name: z.string().trim().min(2).max(100),
    condition_type: z.enum(["min_cart_value", "specific_state", "zip_code_range"]),
    condition_value: z.record(z.string(), z.unknown()),
    discount_type: z.enum(["free_shipping", "fixed_discount", "percentage_discount"]),
    discount_value: z.number().min(0).max(100000),
    is_active: z.boolean(),
    priority: z.number().int().min(-1000).max(1000),
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { id, ...values } = data;
    const row = {
      ...values,
      condition_value: values.condition_value as Json,
      store_key: "papelemi",
      updated_at: new Date().toISOString(),
    };
    const { error } = id
      ? await admin.from("shipping_rules").update(row).eq("id", id).eq("store_key", "papelemi")
      : await admin.from("shipping_rules").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteShippingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { error } = await admin.from("shipping_rules").delete()
      .eq("id", data.id).eq("store_key", "papelemi");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listShippingAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient<Database>;
    const { data, error } = await admin.from("shipping_audit_logs").select("*")
      .eq("store_key", "papelemi").order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
