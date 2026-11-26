import { engineAdmin } from "@/lib/engine.server";

const MP_API_BASE = "https://api.mercadopago.com";

type MpPayment = {
  id: number;
  status: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id?: string | null;
};

export function mpConfigured() {
  return Boolean(process.env["MP_ACCESS_TOKEN"]);
}

export async function mpRequest<T>(path: string, options: { method?: string; body?: string; idempotencyKey?: string } = {}) {
  const token = process.env["MP_ACCESS_TOKEN"];
  if (!token) throw new Error("Mercado Pago não configurado");
  const headers = new Headers({
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  });
  if (options.idempotencyKey) headers.set("X-Idempotency-Key", options.idempotencyKey);
  const response = await fetch(MP_API_BASE + path, {
    method: options.method ?? "GET",
    headers,
    ...(options.body ? { body: options.body } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Mercado Pago request failed", response.status, payload);
    throw new Error("Não foi possível consultar o pagamento");
  }
  return payload as T;
}

async function recordPaymentEvent(
  admin: ReturnType<typeof engineAdmin>,
  payment: MpPayment,
  orderCode: string | null,
  result: string,
  appliedStatus: string | null,
  errorMessage: string | null = null,
) {
  const { error } = await admin.from("payment_events").insert({
    provider: "mercadopago",
    payment_id: String(payment.id),
    event_id: String(payment.id),
    order_code: orderCode,
    provider_status: payment.status,
    applied_status: appliedStatus,
    result,
    error_message: errorMessage,
    raw: {
      id: payment.id,
      status: payment.status,
      external_reference: payment.external_reference,
      transaction_amount: payment.transaction_amount,
      currency_id: payment.currency_id ?? null,
    },
  });
  if (error && error.code !== "23505") {
    console.error("Could not persist Mercado Pago event", { code: error.code, message: error.message.slice(0, 160) });
  }
}

async function confirmApprovedPayment(payment: MpPayment) {
  const admin = engineAdmin();
  const orderId = payment.external_reference?.trim();
  if (!orderId) {
    await recordPaymentEvent(admin, payment, null, "unknown_order", null, "Pagamento sem external_reference.");
    return { status: "unknown" };
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,order_code,total,status,payment_status,payment_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    await recordPaymentEvent(admin, payment, null, "unknown_order", null, "Pedido não encontrado no motor PapeLemi.");
    return { status: "unknown" };
  }

  const paymentId = String(payment.id);
  const paymentAmount = Number(payment.transaction_amount);
  const orderTotal = Number(order.total);
  if (!Number.isFinite(paymentAmount) || Math.abs(paymentAmount - orderTotal) > 0.01) {
    await recordPaymentEvent(admin, payment, order.order_code, "amount_mismatch", order.payment_status, "Valor pago diverge do total do pedido.");
    return { status: order.payment_status === "approved" ? "approved" : order.status };
  }

  if (order.payment_status === "approved") {
    const samePayment = order.payment_id === paymentId;
    await recordPaymentEvent(
      admin,
      payment,
      order.order_code,
      samePayment ? "already_applied" : "duplicate_payment_conflict",
      "approved",
      samePayment ? null : "O pedido já possui outro pagamento aprovado.",
    );
    return { status: samePayment ? "approved" : order.status };
  }

  if (order.status === "cancelled" || order.payment_status !== "pending") {
    await recordPaymentEvent(admin, payment, order.order_code, "ignored_status", order.payment_status, "Pedido não está aguardando pagamento.");
    return { status: order.status };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("orders")
    .update({
      status: order.status === "pending" ? "confirmed" : order.status,
      payment_status: "approved",
      payment_id: paymentId,
      payment_method: "mercadopago",
      paid_at: now,
      updated_at: now,
    })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select("id");

  if (updateError) {
    await recordPaymentEvent(admin, payment, order.order_code, "update_error", order.payment_status, updateError.message.slice(0, 300));
    throw new Error("Não foi possível confirmar o pagamento no motor PapeLemi.");
  }

  const { data: latest, error: latestError } = await admin
    .from("orders")
    .select("status,payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (latestError || !latest) {
    await recordPaymentEvent(admin, payment, order.order_code, "update_error", null, "Não foi possível reler o pedido após a confirmação.");
    throw new Error("Não foi possível verificar a confirmação do pagamento.");
  }

  const applied = latest.payment_status === "approved";
  await recordPaymentEvent(
    admin,
    payment,
    order.order_code,
    applied ? (updated?.length ? "applied" : "already_applied") : "update_error",
    latest.payment_status,
    applied ? null : "A confirmação não foi aplicada ao pedido.",
  );

  return { status: applied ? "approved" : latest.status };
}

export async function confirmOrderByReference(orderId: string) {
  const search = await mpRequest<{ results?: MpPayment[] }>(
    "/v1/payments/search?external_reference=" + encodeURIComponent(orderId) + "&sort=date_created&criteria=desc&limit=10",
  );
  const approved = (search.results ?? []).find((payment) => payment.status === "approved");
  if (!approved) return { status: search.results?.[0]?.status ?? "pending" };
  return confirmApprovedPayment(approved);
}

export async function confirmPaymentById(paymentId: string) {
  const payment = await mpRequest<MpPayment>("/v1/payments/" + encodeURIComponent(paymentId));
  if (payment.status !== "approved") return { status: payment.status };
  return confirmApprovedPayment(payment);
}
