export type MercadoPagoEventSource = {
  id: string | number;
  status: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string;
  date_last_updated?: string;
};

export function buildPaymentEventRecord(input: {
  payment: MercadoPagoEventSource;
  orderId?: string | null;
  result: string;
  errorMessage?: string | null;
  durationMs: number;
}) {
  const paymentId = String(input.payment.id);
  const status = String(input.payment.status);
  const eventTime = input.payment.date_last_updated ?? input.payment.date_approved ?? "latest";
  return {
    store_key: "papelemi",
    provider: "mercadopago",
    payment_id: paymentId,
    event_id: `${paymentId}:${status}:${eventTime}`,
    order_id: input.orderId ?? null,
    order_code: null,
    provider_status: status,
    applied_status: status === "approved" ? "approved" as const : null,
    result: input.result,
    error_message: input.errorMessage ?? null,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    raw: {
      external_reference: input.payment.external_reference ?? null,
      status,
      transaction_amount: input.payment.transaction_amount ?? null,
      currency_id: input.payment.currency_id ?? null,
      payment_method_id: input.payment.payment_method_id ?? null,
      payment_type_id: input.payment.payment_type_id ?? null,
      date_approved: input.payment.date_approved ?? null,
      date_last_updated: input.payment.date_last_updated ?? null,
    },
  };
}
