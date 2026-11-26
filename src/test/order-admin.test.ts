import { describe, expect, it } from "vitest";
import { orderOperationsSchema, orderStatusSchema } from "@/lib/order-admin-validation";

const validOrder = {
  status: "shipped",
  shippingMethod: "Correios PAC",
  shippingCompany: "Correios",
  shippingDays: "3 a 5 dias úteis",
  shippingPrice: 18.9,
  trackingCode: "AB123456789BR",
  trackingCarrier: "Correios",
  trackingUrl: "https://rastreamento.correios.com.br/app/index.php?codigo=AB123456789BR",
  notes: "Pedido despachado.",
};

describe("order 360 administration validation", () => {
  it("accepts every lifecycle status supported by the database RPC", () => {
    for (const status of ["pending", "paid", "confirmed", "processing", "shipped", "delivered", "cancelled"]) {
      expect(orderStatusSchema.safeParse(status).success).toBe(true);
    }
  });
  it("validates shipping, tracking and administrative notes", () => {
    const parsed = orderOperationsSchema.parse(validOrder);
    expect(parsed.shippingPrice).toBe(18.9);
    expect(parsed.trackingCode).toBe("AB123456789BR");
  });
  it("rejects negative shipping values", () => {
    expect(orderOperationsSchema.safeParse({ ...validOrder, shippingPrice: -1 }).success).toBe(false);
  });
  it("rejects non-HTTPS tracking destinations", () => {
    expect(orderOperationsSchema.safeParse({ ...validOrder, trackingUrl: "http://example.com/track" }).success).toBe(false);
    expect(orderOperationsSchema.safeParse({ ...validOrder, trackingUrl: "" }).success).toBe(true);
  });
  it("rejects invalid lifecycle states", () => {
    expect(orderOperationsSchema.safeParse({ ...validOrder, status: "refunded" }).success).toBe(false);
  });
});
