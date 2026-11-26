import { z } from "zod";

export const CART_STORAGE_KEY = "papelemi-cart";

export const cartItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(80),
  qty: z.number().int().min(1).max(999),
  options: z.record(z.string().max(60), z.string().max(500)).refine((options) => Object.keys(options).length <= 23, "Número de opções inválido."),
});

export type StoredCartItem = z.infer<typeof cartItemSchema>;

export function parseCartItems(raw: string | null): StoredCartItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 50).flatMap((item) => {
      const result = cartItemSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}
