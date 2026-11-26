import { z } from "zod";

export const orderStatusSchema = z.enum([
  "pending", "paid", "confirmed", "processing", "shipped", "delivered", "cancelled",
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

const secureTrackingUrl = z.string().trim().max(500).refine((value) => {
  if (value === "") return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Informe uma URL HTTPS válida para rastreamento.");

export const orderOperationsSchema = z.object({
  status: orderStatusSchema,
  shippingMethod: z.string().trim().min(1).max(80),
  shippingCompany: z.string().trim().max(120).default(""),
  shippingDays: z.string().trim().max(60).default(""),
  shippingPrice: z.number().min(0).max(99999),
  trackingCode: z.string().trim().max(100).default(""),
  trackingCarrier: z.string().trim().max(80).default(""),
  trackingUrl: secureTrackingUrl.default(""),
  notes: z.string().trim().max(2000).default(""),
});

export type OrderOperationsInput = z.infer<typeof orderOperationsSchema>;
