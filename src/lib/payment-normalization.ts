import { z } from "zod";

const mpPaymentSchema = z.object({
  id: z.number().int().positive(),
  status: z.string().trim().min(1).max(40),
  status_detail: z.string().trim().max(100).nullish().transform((value) => value ?? undefined),
  external_reference: z.string().trim().max(100).nullish().transform((value) => value ?? undefined),
  transaction_amount: z.number().nonnegative().nullish().transform((value) => value ?? undefined),
  currency_id: z.string().trim().max(10).nullish().transform((value) => value ?? undefined),
  payment_method_id: z.string().trim().max(50).nullish().transform((value) => value ?? undefined),
  payment_type_id: z.string().trim().max(50).nullish().transform((value) => value ?? undefined),
  date_approved: z.string().trim().max(50).nullish().transform((value) => value ?? undefined),
});

export type MpPayment = z.infer<typeof mpPaymentSchema>;
export type NormalizedPaymentStatus = "pending" | "approved" | "refunded" | "cancelled";

export function parseMpPayment(value: unknown): MpPayment {
  const parsed = mpPaymentSchema.safeParse(value);
  if (!parsed.success) throw new Error("Resposta de pagamento do Mercado Pago inválida.");
  return parsed.data;
}

export function normalizeMpPaymentStatus(status: string): NormalizedPaymentStatus {
  if (status === "approved") return "approved";
  if (status === "refunded" || status === "charged_back") return "refunded";
  if (status === "cancelled" || status === "rejected") return "cancelled";
  return "pending";
}

export function paymentAmountMatches(orderTotal: number, payment: MpPayment): boolean {
  return Number.isFinite(orderTotal)
    && Number.isFinite(payment.transaction_amount)
    && payment.transaction_amount !== undefined
    && Math.abs(payment.transaction_amount - orderTotal) <= 0.01
    && payment.currency_id === "BRL";
}

export function buildPaymentEventRecord(input: {
  payment: MpPayment;
  orderId: string | null;
  orderCode: string | null;
  appliedStatus: NormalizedPaymentStatus;
  result: string;
  errorMessage?: string | null;
}) {
  const { payment } = input;
  return {
    store_key: "papelemi",
    provider: "mercadopago",
    payment_id: String(payment.id),
    event_id: ["mp", payment.id, payment.status, payment.status_detail ?? "none"].join(":"),
    order_id: input.orderId,
    order_code: input.orderCode,
    provider_status: payment.status,
    status_detail: payment.status_detail ?? null,
    applied_status: input.appliedStatus,
    result: input.result,
    error_message: input.errorMessage ?? null,
    raw: {
      status: payment.status,
      status_detail: payment.status_detail ?? null,
      transaction_amount: payment.transaction_amount ?? null,
      currency_id: payment.currency_id ?? null,
      payment_method_id: payment.payment_method_id ?? null,
      payment_type_id: payment.payment_type_id ?? null,
      date_approved: payment.date_approved ?? null,
      external_reference: payment.external_reference ?? null,
    },
  };
}
