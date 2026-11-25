import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { confirmOrderByReference, mpConfigured, mpRequest } from "@/lib/mp";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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
    const { data: row } = await sb.from("coupons").select("code,percent").eq("code", data.code.toUpperCase()).eq("active", true).filter("store_key", "eq", "papelemi").maybeSingle();
    return row ? { code: row.code, percent: row.percent } : null;
  });

const orderInput = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    phone: z.string().trim().max(20).default(""),
  }),
  address: z.object({
    cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
    street: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(80).default(""),
    district: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().length(2),
  }),
  items: z.array(z.object({
    slug: z.string().trim().min(1).max(80),
    qty: z.number().int().min(1).max(999),
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
    const slugs = input.items.map((i) => i.slug);
    const { data: rows, error } = await supabaseAdmin.from("products").select("*").in("slug", slugs).filter("store_key", "eq", "papelemi");
    if (error) throw new Error(error.message);
    const bySlug = new Map((rows ?? []).map((r) => [r.slug, productFromRow(r)]));
    const items = input.items.map((i) => {
      const p = bySlug.get(i.slug);
      if (!p || !p.published) throw new Error(`Produto indisponível: ${i.slug}`);
      const qty = Math.max(i.qty, p.minQty ?? 1);
      return { slug: p.slug, name: p.name, qty, unit_price: p.promoPrice ?? p.price, options: i.options };
    });
    const subtotal = Math.round(items.reduce((s, i) => s + i.unit_price * i.qty, 0) * 100) / 100;
    // O frete é confirmado pela PapeLemi após revisar o CEP; não estimar um valor não validado.
    const shipping = 0;
    let discount = 0;
    let couponCode: string | null = null;
    if (input.couponCode) {
      const { data: c } = await supabaseAdmin.from("coupons").select("code,percent").eq("code", input.couponCode.toUpperCase()).eq("active", true).filter("store_key", "eq", "papelemi").maybeSingle();
      if (c) { couponCode = c.code; discount = Math.round(subtotal * c.percent) / 100; }
    }
    const total = Math.round((subtotal - discount + shipping) * 100) / 100;

    const orderPayload: Database["public"]["Tables"]["orders"]["Insert"] & {
      store_key: string;
      customer_notes: string;
      accepted_privacy: boolean;
      privacy_consent_at: string;
      source: string;
    } = {
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
      address: input.address,
      items,
      subtotal,
      shipping,
      discount,
      coupon_code: couponCode,
      total,
      store_key: "papelemi",
      customer_notes: input.customerNotes,
      accepted_privacy: input.acceptedPrivacy,
      privacy_consent_at: new Date().toISOString(),
      source: "storefront",
    };
    const { data: order, error: insErr } = await supabaseAdmin
      .from("orders")
      .insert(orderPayload as unknown as Database["public"]["Tables"]["orders"]["Insert"])
      .select("id")
      .single();
    if (insErr || !order) throw new Error(insErr?.message ?? "Não foi possível criar o pedido");

    let initPoint: string | null = null;
    if (mpConfigured()) {
      const origin = safeOrigin(input.origin);
      const pref = (await mpRequest("checkout/preferences", {
        method: "POST",
        idempotencyKey: `pref-${order.id}-1`,
        body: {
          items: [{ title: `Pedido PapeLemi ${order.id.slice(0, 8)}`, quantity: 1, unit_price: total, currency_id: "BRL" }],
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
    return { orderId: order.id, initPoint, total, paymentReady: mpConfigured() };
  });

export const getOrderStatus = createServerFn({ method: "GET" })
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data }) => {
    if (mpConfigured()) {
      try { await confirmOrderByReference(data.orderId); } catch { /* segue com o status atual */ }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin.from("orders").select("status,total").eq("id", data.orderId).single();
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
