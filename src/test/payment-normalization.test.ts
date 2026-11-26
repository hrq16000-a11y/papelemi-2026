import { describe, expect, it } from "vitest";
import {
  buildPaymentEventRecord,
  normalizeMpPaymentStatus,
  parseMpPayment,
  paymentAmountMatches,
} from "@/lib/payment-normalization";

const approved = parseMpPayment({
  id: 123456,
  status: "approved",
  status_detail: "accredited",
  external_reference: "00000000-0000-4000-8000-000000000001",
  transaction_amount: 149.9,
  currency_id: "BRL",
  payment_method_id: "pix",
  payment_type_id: "bank_transfer",
  date_approved: "2026-11-25T12:00:00.000-03:00",
  payer: { email: "private@example.com" },
  card: { last_four_digits: "1234" },
});

describe("Mercado Pago payment normalization", () => {
  it("maps provider states to the normalized payment enum", () => {
    expect(normalizeMpPaymentStatus("approved")).toBe("approved");
    expect(normalizeMpPaymentStatus("refunded")).toBe("refunded");
    expect(normalizeMpPaymentStatus("charged_back")).toBe("refunded");
    expect(normalizeMpPaymentStatus("cancelled")).toBe("cancelled");
    expect(normalizeMpPaymentStatus("rejected")).toBe("cancelled");
    expect(normalizeMpPaymentStatus("in_process")).toBe("pending");
  });

  it("requires a BRL amount within one cent before approval", () => {
    expect(paymentAmountMatches(149.9, approved)).toBe(true);
    expect(paymentAmountMatches(150, approved)).toBe(false);
    expect(paymentAmountMatches(149.9, { ...approved, currency_id: "USD" })).toBe(false);
    expect(paymentAmountMatches(149.9, { ...approved, transaction_amount: undefined })).toBe(false);
  });

  it("accepts nullable fields from non-approved provider responses", () => {
    const pending = parseMpPayment({
      id: 123457,
      status: "pending",
      status_detail: null,
      external_reference: null,
      transaction_amount: null,
      currency_id: null,
      date_approved: null,
    });
    expect(pending.date_approved).toBeUndefined();
    expect(pending.external_reference).toBeUndefined();
  });

  it("strips unneeded provider fields from the parsed payment object", () => {
    expect(approved).not.toHaveProperty("payer");
    expect(approved).not.toHaveProperty("card");
  });

  it("creates a stable, minimal, idempotent audit event", () => {
    const event = buildPaymentEventRecord({
      payment: approved,
      orderId: "00000000-0000-4000-8000-000000000001",
      orderCode: "PL-12345678",
      appliedStatus: "approved",
      result: "applied",
    });
    expect(event.event_id).toBe("mp:123456:approved:accredited");
    expect(event.store_key).toBe("papelemi");
    expect(event.raw).toMatchObject({
      status: "approved",
      transaction_amount: 149.9,
      currency_id: "BRL",
      payment_method_id: "pix",
    });
    expect(event.raw).not.toHaveProperty("payer");
    expect(event.raw).not.toHaveProperty("card");
  });
});
