import { describe, expect, it } from "vitest";
import { buildPaymentEventRecord } from "@/lib/payment-events";

describe("payment event audit records", () => {
  it("creates a stable, idempotent event key for a provider payment state", () => {
    const input = {
      payment: { id: 987654, status: "approved", external_reference: "order-123", transaction_amount: 129.9, currency_id: "BRL", payment_method_id: "pix", date_approved: "2026-11-25T20:00:00Z", date_last_updated: "2026-11-25T20:00:02Z" },
      orderId: "order-123", result: "applied", durationMs: 12.7,
    };
    const first = buildPaymentEventRecord(input);
    const second = buildPaymentEventRecord(input);
    expect(first.event_id).toBe("987654:approved:2026-11-25T20:00:02Z");
    expect(first.event_id).toBe(second.event_id);
    expect(first.applied_status).toBe("approved");
    expect(first.duration_ms).toBe(13);
  });

  it("keeps provider payload minimized and never copies customer contact data", () => {
    const record = buildPaymentEventRecord({
      payment: { id: 42, status: "pending", external_reference: "order-42", transaction_amount: 50, currency_id: "BRL" },
      orderId: "order-42", result: "not_approved", durationMs: 4,
    });
    expect(record.raw).toEqual({
      external_reference: "order-42", status: "pending", transaction_amount: 50, currency_id: "BRL",
      payment_method_id: null, payment_type_id: null, date_approved: null, date_last_updated: null,
    });
    expect(JSON.stringify(record.raw)).not.toContain("@");
    expect(record.applied_status).toBeNull();
  });
});
