import { describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { categoryFromRow, productFromRow } from "@/lib/catalog.repository.server";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

const productRow: ProductRow = {
  slug: "caderneta-teste",
  category_slug: "cadernetas",
  name: "Caderneta de teste",
  description: "Produto de teste",
  images: ["/images/teste.jpg"],
  price: 59.9,
  promo_price: null,
  colors: ["Rosa"],
  sizes: [],
  finishes: [],
  production_days: "10 dias úteis",
  stock: 0,
  published: true,
  best_seller: false,
  personalizable: true,
  personalization: [
    { type: "text", key: "nome", label: "Nome", maxLength: 40 },
    { type: "text", key: "frase", label: "Dedicatória", maxLength: 140, ai: true },
    { type: "notes", key: "observacoes", label: "Observações" },
  ],
  min_qty: null,
};

const categoryRow: CategoryRow = {
  slug: "cadernetas",
  name: "Cadernetas",
  description: "Para guardar cada fase.",
  image: "/images/papelemi/caderneta-ursinho-clean.jpg",
  sort: 1,
};

describe("Supabase catalog mapping", () => {
  it("maps live product values and per-product personalization without static catalog data", () => {
    const product = productFromRow(productRow);

    expect(product).toMatchObject({
      slug: "caderneta-teste",
      category: "cadernetas",
      price: 59.9,
      published: true,
      personalizable: true,
      personalization: [
        { type: "text", key: "nome", maxLength: 40 },
        { type: "text", key: "frase", maxLength: 140, ai: true },
        { type: "notes", key: "observacoes" },
      ],
    });
    expect(product.promoPrice).toBeUndefined();
    expect(product.minQty).toBeUndefined();
  });

  it("rejects malformed personalization configuration from the database", () => {
    const malformed = {
      ...productRow,
      personalization: [{ type: "text", key: "frase", label: "Dedicatória", maxLength: 0 }],
    } as unknown as ProductRow;

    expect(() => productFromRow(malformed)).toThrow();
  });

  it("maps category metadata directly from its database row", () => {
    expect(categoryFromRow(categoryRow)).toEqual({
      slug: "cadernetas",
      name: "Cadernetas",
      description: "Para guardar cada fase.",
      image: "/images/papelemi/caderneta-ursinho-clean.jpg",
    });
  });
});
