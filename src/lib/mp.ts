// Mercado Pago via conector Lovable — somente código de servidor pode importar este módulo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaymentEventRecord, normalizeMpPaymentStatus, parseMpPayment, paymentAmountMatches, type MpPayment, type NormalizedPaymentStatus } from "@/lib/payment-normalization";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/mercadopago";

export function mpConfigured() {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["MERCADOPAGO_CONNECTION_KEY"]);
}

export async function mpRequest(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
) {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const MERCADOPAGO_CONNECTION_KEY = process.env["MERCADOPAGO_CONNECTION_KEY"];
  if (!LOVABLE_API_KEY || !MERCADOPAGO_CONNECTION_KEY) {
    throw new Error("Mercado Pago não está conectado");
  }
  const response = await fetch(`${GATEWAY_URL}/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": MERCADOPAGO_CONNECTION_KEY,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Mercado Pago ${path} falhou [${response.status}]: ${errorBody}`);
    throw new Error(`Mercado Pago ${path} falhou [${response.status}]: ${errorBody}`);
  }
  return response.json();
}

async function recordPaymentEvent(
  admin: SupabaseClient,
  payment: MpPayment,
  order: { id: string; order_code: string | null } | null,
  appliedStatus: NormalizedPaymentStatus,
  result: string,
  errorMessage?: string,
) {
  const { error } = await admin.from("payment_events").upsert(
    buildPaymentEventRecord({
      payment,
      orderId: order?.id ?? null,
      orderCode: order?.order_code ?? null,
      appliedStatus,
      result,
      ...(errorMessage === undefined ? {} : { errorMessage }),
    }),
    { onConflict: "store_key,provider,event_id", ignoreDuplicates: true },
  );
  if (error) throw new Error("Não foi possível registrar evento do pagamento: " + error.message);
}

type PaymentOrderRow = {
  id: string;
  order_code: string | null;
  total: number;
  status: string;
  payment_status: NormalizedPaymentStatus;
  payment_id: string | null;
  paid_at: string | null;
};

async function applyPaymentState(payment: MpPayment) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as SupabaseClient;
  const normalizedStatus = normalizeMpPaymentStatus(payment.status);
  const orderId = payment.external_reference;

  if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    await recordPaymentEvent(admin, payment, null, "pending", "missing_or_invalid_reference");
    return { status: "ignored" as const };
  }

  const { data, error } = await admin.from("orders")
    .select("id,order_code,total,status,payment_status,payment_id,paid_at")
    .eq("id", orderId)
    .eq("store_key", "papelemi")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    await recordPaymentEvent(admin, payment, null, normalizedStatus, "unmatched_order");
    return { status: "unknown" as const };
  }

  const order = data as PaymentOrderRow;
  if (normalizedStatus === "approved" && !paymentAmountMatches(Number(order.total), payment)) {
    await recordPaymentEvent(
      admin,
      payment,
      order,
      order.payment_status,
      "amount_mismatch",
      "Valor ou moeda do pagamento não corresponde ao total do pedido.",
    );
    console.error("Pagamento " + payment.id + " com valor/moeda divergente para o pedido " + orderId);
    return { status: order.status, paymentStatus: order.payment_status };
  }

  let appliedStatus = normalizedStatus;
  let result = "applied";
  const staleUpdate =
    (order.payment_status === "approved" && normalizedStatus !== "approved" && normalizedStatus !== "refunded")
    || (order.payment_status === "refunded" && normalizedStatus !== "refunded")
    || (order.payment_status === "cancelled" && normalizedStatus === "pending");

  if (staleUpdate) {
    appliedStatus = order.payment_status;
    result = "stale_status_ignored";
  } else {
    const patch: Record<string, unknown> = {
      payment_status: appliedStatus,
      payment_id: String(payment.id),
      payment_method: payment.payment_method_id ?? payment.payment_type_id ?? null,
      mp_payment_id: String(payment.id),
    };
    if (appliedStatus === "approved") {
      patch["paid_at"] = order.paid_at ?? payment.date_approved ?? new Date().toISOString();
      if (order.status === "pending" || order.status === "confirmed") patch["status"] = "paid";
    }
    const { error: updateError } = await admin.from("orders").update(patch)
      .eq("id", order.id).eq("store_key", "papelemi");
    if (updateError) throw new Error(updateError.message);
  }

  await recordPaymentEvent(admin, payment, order, appliedStatus, result);
  return { status: appliedStatus, result };
}

// Webhook: consulta o estado diretamente no Mercado Pago e registra o evento de forma idempotente.
export async function confirmPaymentById(paymentId: string) {
  const payment = parseMpPayment(await mpRequest("v1/payments/" + paymentId));
  return applyPaymentState(payment);
}

// Retorno da compra: prefere qualquer pagamento aprovado; caso não exista, registra o estado mais recente.
export async function confirmOrderByReference(orderId: string) {
  const response = await mpRequest(
    "v1/payments/search?external_reference=" + encodeURIComponent(orderId) + "&sort=date_created&criteria=desc",
  ) as { results?: unknown[] };
  const payments = (Array.isArray(response.results) ? response.results : []).map(parseMpPayment);
  const payment = payments.find((candidate) => candidate.status === "approved") ?? payments[0];
  if (!payment) return { status: "pending" as const };
  return applyPaymentState(payment);
}