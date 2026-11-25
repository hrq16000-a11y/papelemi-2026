import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { getProduct } from "@/data/catalog";

const ItemInput = z.object({
  slug: z.string().trim().min(1).max(120),
  qty: z.number().int().min(1).max(100),
  options: z.record(z.string(), z.string().max(1000)).default({}),
});

const Input = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(180),
    phone: z.string().trim().min(10).max(30),
    cep: z.string().trim().regex(/^[0-9-]{8,9}$/),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().length(2),
    address: z.string().trim().min(2).max(180),
    number: z.string().trim().min(1).max(30),
    complement: z.string().trim().max(120).default(""),
    notes: z.string().trim().max(1000).default(""),
    acceptedPrivacy: z.literal(true),
  }),
  items: z.array(ItemInput).min(1).max(30),
  website: z.string().max(200).default(""),
  startedAt: z.number().int().positive(),
});

type Result = { success: true; orderNumber: string } | { success: false; error: string };

export const submitOrderRequest = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => Input.parse(value))
  .handler(async ({ data }): Promise<Result> => {
    const now = Date.now();
    const orderNumber =
      "PL-" +
      new Date(now).toISOString().slice(0, 10).replaceAll("-", "") +
      "-" +
      crypto.randomUUID().slice(0, 6).toUpperCase();

    // Honeypot: return a harmless success to automated submissions without storing them.
    if (data.website.trim()) return { success: true, orderNumber };
    if (data.startedAt > now + 1000 || now - data.startedAt < 1500) {
      return { success: false, error: "Aguarde um instante e tente novamente." };
    }

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) {
      console.error("PapeLemi order request: server-side Supabase credentials are not configured.");
      return { success: false, error: "O atendimento está temporariamente indisponível. Tente novamente em instantes." };
    }

    const prepared: {
      slug: string;
      name: string;
      qty: number;
      unitPrice: number;
      lineTotal: number;
      personalization: Record<string, string>;
    }[] = [];
    let subtotal = 0;

    for (const item of data.items) {
      const product = getProduct(item.slug);
      if (!product || !product.published) {
        return { success: false, error: "Um dos produtos do carrinho não está mais disponível. Atualize sua seleção." };
      }

      const personalization: Record<string, string> = {};
      for (const field of product.personalization) {
        const value = (item.options[field.label] ?? item.options[field.key] ?? "").trim();
        if (field.type === "text" && value.length > field.maxLength) {
          return { success: false, error: "Revise o tamanho dos textos de personalização." };
        }
        if (field.type === "notes" && value.length > 400) {
          return { success: false, error: "As observações de um produto devem ter até 400 caracteres." };
        }
        if (field.type === "choice" && value && !field.options.includes(value)) {
          return { success: false, error: "Uma das opções de personalização não é válida." };
        }
        if (value) personalization[field.label] = value;
      }

      const variants = [
        { key: "Cor", options: product.colors },
        { key: "Tamanho", options: product.sizes },
        { key: "Acabamento", options: product.finishes },
      ];
      for (const variant of variants) {
        const value = (item.options[variant.key] ?? "").trim();
        if (value && !variant.options.includes(value)) {
          return { success: false, error: "Uma das opções do produto não é válida." };
        }
        if (value) personalization[variant.key] = value;
      }

      const unitPrice = product.promoPrice ?? product.price;
      const lineTotal = Number((unitPrice * item.qty).toFixed(2));
      subtotal = Number((subtotal + lineTotal).toFixed(2));
      prepared.push({
        slug: product.slug,
        name: product.name,
        qty: item.qty,
        unitPrice,
        lineTotal,
        personalization,
      });
    }

    if (prepared.reduce((sum, item) => sum + item.qty, 0) > 200) {
      return { success: false, error: "A quantidade total ultrapassa o limite de uma solicitação. Entre em contato para um orçamento especial." };
    }

    let ipHash: string | null = null;
    try {
      const ip = getRequestIP({ xForwardedFor: true });
      if (ip) ipHash = createHmac("sha256", secret).update(ip).digest("hex");
    } catch {
      // The order can still be recorded if the hosting platform does not expose a client IP.
    }
    const userAgent = (getRequestHeader("user-agent") ?? "").slice(0, 500) || null;

    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      if (ipHash) {
        const since = new Date(now - 15 * 60 * 1000).toISOString();
        const { count, error: limitError } = await supabase
          .from("store_order_requests")
          .select("id", { count: "exact", head: true })
          .eq("store_key", "papelemi")
          .eq("ip_hash", ipHash)
          .gte("created_at", since);
        if (limitError) throw limitError;
        if ((count ?? 0) >= 5) {
          return { success: false, error: "Recebemos várias solicitações deste acesso. Aguarde alguns minutos antes de tentar novamente." };
        }
      }

      const customer = data.customer;
      const phone = customer.phone.replace(/\D/g, "");
      const postalCode = customer.cep.replace(/\D/g, "");
      if (phone.length < 10 || phone.length > 13 || postalCode.length !== 8) {
        return { success: false, error: "Confira o telefone com DDD e o CEP informado." };
      }

      const { data: order, error: orderError } = await supabase
        .from("store_order_requests")
        .insert({
          store_key: "papelemi",
          order_number: orderNumber,
          customer_name: customer.name,
          customer_email: customer.email.toLowerCase(),
          customer_phone: phone,
          postal_code: postalCode,
          city: customer.city,
          state: customer.state.toUpperCase(),
          street: customer.address,
          address_number: customer.number,
          complement: customer.complement,
          notes: customer.notes,
          accepted_privacy: true,
          status: "received",
          currency: "BRL",
          subtotal_reference: subtotal,
          ip_hash: ipHash,
          user_agent: userAgent,
          source: "storefront",
        })
        .select("id, order_number")
        .single();

      if (orderError || !order) throw orderError ?? new Error("Order request was not created.");

      const { error: itemsError } = await supabase.from("store_order_request_items").insert(
        prepared.map((item) => ({
          store_key: "papelemi",
          order_request_id: order.id,
          product_slug: item.slug,
          product_name: item.name,
          unit_price_reference: item.unitPrice,
          quantity: item.qty,
          line_total_reference: item.lineTotal,
          personalization: item.personalization,
        })),
      );

      if (itemsError) {
        await supabase.from("store_order_requests").delete().eq("id", order.id);
        throw itemsError;
      }

      return { success: true, orderNumber: order.order_number };
    } catch (error) {
      console.error("PapeLemi order request failed:", error);
      return { success: false, error: "Não foi possível registrar sua solicitação agora. Tente novamente em instantes." };
    }
  });
