import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { confirmOrderByReference, mpConfigured, mpRequest } from "@/lib/mp";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  calculateCheckoutTotals,
  orderMatchesIntent,
  persistOrderIdempotently,
  validateCheckoutLine,
  validateCouponRecord,
  type ExistingOrder,
} from "@/lib/checkout-validation";

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
    const { data: row, error } = await sb.from("coupons").select("code,percent").eq("code", data.code.toUpperCase()).eq("active", true).filter("store_key", "eq", "papelemi").maybeSingle();
    if (error) throw new Error("Não foi possível validar o cupom.");
    return row ? { code: row.code, percent: row.percent } : null;
  });

const orderInput = z.object({
  idempotencyKey: z.string().uuid(),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    phone: z.string().trim().min(8).max(20),
  }),
  address: z.object({
    cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
    street: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(80).default(""),
    district: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().regex(/^[A-Za-z]{2}$/, "UF inválida"),
  }),
  items: z.array(z.object({
    slug: z.string().trim().min(1).max(80),
    qty: z.number().int().min(1).max(999),
    expectedUnitPrice: z.number().min(0.01).max(99999),
    options: z.record(z.string().max(60), z.string().max(500)),
  })).min(1).max(50),
  couponCode: z.string().trim().max(40).optional(),
  origin: z.string().url().max(200).optional(),
  customerNotes: z.string().trim().max(1000).default(""),
  acceptedPrivacy: z.literal(true),
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
    const { productFromRow } = await import("@/lib/catalog.repository.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const findExisting = async (): Promise<ExistingOrder | null> => {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("id", input.idempotencyKey)
        .filter("store_key", "eq", "papelemi")
        .maybeSingle();
      if (error) throw new Error("Não foi possível verificar a tentativa anterior de encomenda.");
      return data as unknown as ExistingOrder | null;
    };

    const createPaymentLink = async (order: ExistingOrder) => {
      let initPoint: string | null = null;
      const paymentReady = mpConfigured();
      if (paymentReady && order.status === "pending") {
        const origin = safeOrigin(input.origin);
        const pref = (await mpRequest("checkout/preferences", {
          method: "POST",
          idempotencyKey: `pref-${order.id}-1`,
          body: {
            items: [{
              title: `Pedido PapeLemi ${order.id.slice(0, 8)}`,
              quantity: 1,
              unit_price: Number(order.total),
              currency_id: "BRL",
            }],
            external_reference: order.id,
            back_urls: {
              success: `${origin}/pedido/${order.id}`,
              pending: `${origin}/pedido/${order.id}`,
              failure: `${origin}/pedido/${order.id}`,
            },
            auto_return: "approved",
            notification_url: `${PUBLISHED_ORIGIN}/api/public/mercadopago-webhook`,
          },
        })) as { init_point?: string };
        initPoint = pref.init_point ?? null;
      }
      return {
        orderId: order.id,
        initPoint,
        total: Number(order.total),
        paymentReady,
      };
    };

    // A chave usa o UUID do pedido existente como chave idempotente, sem nova tabela.
    // Uma repetição com o mesmo conteúdo recupera o pedido; conteúdo diferente é rejeitado.
    const existing = await findExisting();
    if (existing) {
      if (!orderMatchesIntent(existing, input)) {
        throw new Error("Esta tentativa de encomenda já foi utilizada com outros dados. Revise o carrinho e tente novamente.");
      }
      return createPaymentLink(existing);
    }

    const slugs = [...new Set(input.items.map((item) => item.slug))];
    const { data: rows, error: productError } = await supabaseAdmin
      .from("products")
      .select("*")
      .in("slug", slugs)
      .filter("store_key", "eq", "papelemi");
    if (productError) throw new Error("Não foi possível confirmar os produtos. Tente novamente.");
    const bySlug = new Map((rows ?? []).map((row) => [row.slug, row]));

    const items = input.items.map((item) => {
      const row = bySlug.get(item.slug);
      if (!row) throw new Error(`Produto indisponível: ${item.slug}`);
      const product = productFromRow(row);
      return validateCheckoutLine({
        store_key: (row as unknown as { store_key?: string }).store_key ?? "",
        slug: product.slug,
        name: product.name,
        price: product.price,
        promo_price: row.promo_price,
        colors: product.colors,
        sizes: product.sizes,
        finishes: product.finishes,
        stock: product.stock ?? 0,
        published: product.published,
        personalizable: product.personalizable,
        personalization: product.personalization,
        min_qty: product.minQty ?? null,
      }, item);
    });

    let couponCode: string | null = null;
    let couponPercent = 0;
    const submittedCoupon = input.couponCode?.trim().toUpperCase();
    if (submittedCoupon) {
      const { data: coupon, error: couponError } = await supabaseAdmin
        .from("coupons")
        .select("code,percent,active")
        .eq("code", submittedCoupon)
        .eq("active", true)
        .filter("store_key", "eq", "papelemi")
        .maybeSingle();
      if (couponError) throw new Error("Não foi possível validar o cupom. Tente novamente.");
      const validCoupon = validateCouponRecord(coupon, submittedCoupon);
      couponCode = validCoupon.code;
      couponPercent = validCoupon.percent;
    }

    // Frete permanece zerado até confirmação manual; o navegador não envia valores monetários.
    const totals = calculateCheckoutTotals(items, couponPercent, 0);
    const orderPayload = {
      id: input.idempotencyKey,
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
      address: input.address,
      items,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      discount: totals.discount,
      coupon_code: couponCode,
      total: totals.total,
      store_key: "papelemi",
      customer_notes: input.customerNotes,
      accepted_privacy: input.acceptedPrivacy,
      privacy_consent_at: new Date().toISOString(),
      source: "storefront",
    };

    const order = await persistOrderIdempotently({
      findExisting,
      insert: async () => {
        const { data, error } = await supabaseAdmin
          .from("orders")
          .insert(orderPayload as unknown as Database["public"]["Tables"]["orders"]["Insert"])
          .select("*")
          .single();
        return { data: data as unknown as ExistingOrder | null, error };
      },
      matches: (stored) => orderMatchesIntent(stored, input),
    });

    // A encomenda já está persistida. Se o gateway falhar, a repetição recupera o mesmo ID.
    return createPaymentLink(order);
  });

export const getOrderStatus = createServerFn({ method: "GET" })
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data }) => {
    if (mpConfigured()) {
      try { await confirmOrderByReference(data.orderId); } catch { /* segue com o status atual */ }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin.from("orders").select("status,total").eq("id", data.orderId).filter("store_key", "eq", "papelemi").single();
    if (!order) throw new Error("Pedido não encontrado");
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
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .filter("store_key", "eq", "papelemi")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid(), status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled"]) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    // Atualizações usam service_role somente após validar o papel do usuário.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: data.status })
      .eq("id", data.id)
      .filter("store_key", "eq", "papelemi");
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
