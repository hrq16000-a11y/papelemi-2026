import { describe, expect, it, vi } from "vitest";
import {
  categoryFromEngineRow,
  productFromEngineRow,
  type PapeLemiEngineProductRow,
} from "@/lib/catalog.repository.server";

type EngineCategoryRow = Parameters<typeof categoryFromEngineRow>[0];

const productRow = {
  id: "product-1",
  slug: "caderneta-teste",
  name: "Caderneta de teste",
  description: "Produto de teste",
  long_description: null,
  images: ["/images/teste.jpg"],
  image_refs: ["/images/teste.jpg"],
  price: 59.9,
  original_price: null,
  min_quantity: 1,
  production_days: 10,
  weight: 0.25,
  weight_kg: 0.25,
  category_id: "category-1",
  colors: ["Rosa"],
  sizes: [],
  finishes: [],
  stock: 0,
  is_active: true,
  featured_weight: 0,
  personalization_enabled: true,
  personalization_options: [
    { type: "text", key: "nome", label: "Nome", maxLength: 40 },
    { type: "text", key: "frase", label: "Dedicatória", maxLength: 140, ai: true },
    { type: "notes", key: "observacoes", label: "Observações" },
  ],
  requires_shipping: true,
  length_cm: 20,
  width_cm: 15,
  height_cm: 5,
} as unknown as PapeLemiEngineProductRow;

const categoryRow = {
  id: "category-1",
  slug: "cadernetas",
  name: "Cadernetas",
  description: "Para guardar cada fase.",
  image_url: "/images/papelemi/caderneta-ursinho-clean.jpg",
  image_ref: null,
} as EngineCategoryRow;

describe("PapeLemi engine catalog mapping", () => {
  it("maps engine product values and per-product personalization", () => {
    const product = productFromEngineRow(productRow, "cadernetas");

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
      productionDays: "10 dias úteis",
      weightKg: 0.25,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 5,
      requiresShipping: true,
    });
    expect(product.promoPrice).toBeUndefined();
    expect(product.minQty).toBeUndefined();
  });

  it("does not expose malformed personalization configuration", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const malformed = {
      ...productRow,
      personalization_options: [
        { type: "text", key: "frase", label: "Dedicatória", maxLength: 0 },
      ],
    } as unknown as PapeLemiEngineProductRow;

    expect(productFromEngineRow(malformed, "cadernetas").personalization).toEqual([]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("maps category metadata from the engine row", () => {
    expect(categoryFromEngineRow(categoryRow)).toEqual({
      slug: "cadernetas",
      name: "Cadernetas",
      description: "Para guardar cada fase.",
      image: "/images/papelemi/caderneta-ursinho-clean.jpg",
    });
  });
});
