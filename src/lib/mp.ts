// Mercado Pago via conector Lovable — somente código de servidor pode importar este módulo.
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

type MpPayment = {
  id: number;
  status: string;
  external_reference?: string;
  transaction_amount?: number;
};

// Confirmação única: só marca pago quando aprovado e o valor bate com o pedido;
// a atualização é protegida (status pending) para rodar várias vezes sem duplicar efeitos.
async function confirmApprovedPayment(orderId: string, payment: MpPayment) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,total,status")
    .eq("id", orderId)
    .single();
  if (!order) return { status: "unknown" as const };
  if (Math.abs(Number(payment.transaction_amount) - Number(order.total)) > 0.01) {
    console.error(`Pagamento ${payment.id} com valor divergente para o pedido ${orderId}`);
    return { status: order.status };
  }
  const { data: updated } = await supabaseAdmin
    .from("orders")
    .update({ status: "paid", mp_payment_id: String(payment.id) })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");
  return { status: updated?.length ? ("paid" as const) : order.status };
}

// Caminho da notificação (webhook): recebe o id do pagamento.
export async function confirmPaymentById(paymentId: string) {
  const payment = (await mpRequest(`v1/payments/${paymentId}`)) as MpPayment;
  const orderId = payment.external_reference;
  if (!orderId) return { status: "ignored" as const };
  if (payment.status !== "approved") return { status: payment.status };
  return confirmApprovedPayment(orderId, payment);
}

// Caminho do retorno da compra: busca pelo pedido (external_reference).
export async function confirmOrderByReference(orderId: string) {
  const res = (await mpRequest(
    `v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc`,
  )) as { results?: MpPayment[] };
  const approved = (res.results ?? []).find((p) => p.status === "approved");
  if (!approved) return { status: "pending" as const };
  return confirmApprovedPayment(orderId, approved);
}
