import { describe, expect, it } from "vitest";
import { z } from "zod";

const orderStatusUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "paid", "confirmed", "processing", "shipped", "delivered", "cancelled"]),
  trackingCode: z.string().trim().min(4).max(120).optional(),
  trackingCarrier: z.string().trim().max(120).optional(),
  trackingUrl: z.string().trim().url().max(500).optional(),
  note: z.string().trim().max(1000).optional(),
});

describe("Empório order workflow adapted to PapeLemi", () => {
  it("accepts all supported lifecycle states from the original order workflow", () => {
    for (const status of ["pending", "paid", "confirmed", "processing", "shipped", "delivered", "cancelled"]) {
      expect(orderStatusUpdateSchema.safeParse({ id: "a0d4f4c8-9d20-4ef3-8d88-cd3f87a2b4de", status }).success).toBe(true);
    }
  });

  it("requires a valid tracking code and URL when supplied", () => {
    const base = { id: "a0d4f4c8-9d20-4ef3-8d88-cd3f87a2b4de", status: "shipped" };
    expect(orderStatusUpdateSchema.safeParse({ ...base, trackingCode: "BR1234" }).success).toBe(true);
    expect(orderStatusUpdateSchema.safeParse({ ...base, trackingCode: "x" }).success).toBe(false);
    expect(orderStatusUpdateSchema.safeParse({ ...base, trackingCode: "BR1234", trackingUrl: "not-a-url" }).success).toBe(false);
  });

  it("rejects unsupported status values", () => {
    expect(orderStatusUpdateSchema.safeParse({ id: "a0d4f4c8-9d20-4ef3-8d88-cd3f87a2b4de", status: "refunded" }).success).toBe(false);
  });
});
