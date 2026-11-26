import { describe, expect, it } from "vitest";
import {
  categoryAdminSchema,
  imageReferenceSchema,
  productAdminSchema,
} from "@/lib/catalog-validation";

const baseProduct = {
  slug: "caderneta-teste",
  categorySlug: "cadernetas",
  name: "Caderneta de teste",
  price: 59.9,
};

describe("catalog administration validation", () => {
  it("accepts existing HTTPS assets and safe local image paths", () => {
    expect(imageReferenceSchema.safeParse("https://www.papelemi.com.br/images/papelemi/produto.jpg").success).toBe(true);
    expect(imageReferenceSchema.safeParse("/images/papelemi/produto.jpg").success).toBe(true);
    expect(categoryAdminSchema.safeParse({
      slug: "cadernetas",
      name: "Cadernetas",
      image: "/images/papelemi/categoria.jpg",
    }).success).toBe(true);
  });

  it("rejects insecure, protocol-relative and traversal image references", () => {
    for (const value of [
      "http://example.com/produto.jpg",
      "//example.com/produto.jpg",
      "/images/../private.jpg",
      "/images/%2e%2e/private.jpg",
      "javascript:alert(1)",
    ]) {
      expect(imageReferenceSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts a complete product with personalization and freight dimensions", () => {
    const result = productAdminSchema.parse({
      ...baseProduct,
      originalSlug: "caderneta-antiga",
      images: ["/images/papelemi/capa.jpg"],
      personalizable: true,
      personalization: [
        { type: "text", key: "nome", label: "Nome", maxLength: 40 },
        { type: "choice", key: "cor-interna", label: "Cor interna", options: ["Rosa", "Azul"] },
        { type: "notes", key: "observacoes", label: "Observações" },
      ],
      weightKg: 0.25,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 5,
      requiresShipping: true,
    });

    expect(result.originalSlug).toBe("caderneta-antiga");
    expect(result.personalization).toHaveLength(3);
    expect(result.weightKg).toBe(0.25);
    expect(result.requiresShipping).toBe(true);
  });

  it("rejects duplicated personalization keys and labels", () => {
    const result = productAdminSchema.safeParse({
      ...baseProduct,
      personalizable: true,
      personalization: [
        { type: "text", key: "nome", label: "Nome", maxLength: 40 },
        { type: "notes", key: "nome", label: "Observações" },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects promotional prices that are not below the regular price", () => {
    expect(productAdminSchema.safeParse({ ...baseProduct, promoPrice: 59.9 }).success).toBe(false);
    expect(productAdminSchema.safeParse({ ...baseProduct, promoPrice: 49.9 }).success).toBe(true);
  });

  it("defaults categories to active unless explicitly disabled", () => {
    const result = categoryAdminSchema.parse({ slug: "cadernetas", name: "Cadernetas" });
    expect(result.active).toBe(true);
    expect(categoryAdminSchema.parse({ slug: "cadernetas", name: "Cadernetas", active: false }).active).toBe(false);
  });

  it("accepts non-shipping products and nullable package dimensions", () => {
    const result = productAdminSchema.parse({
      ...baseProduct,
      requiresShipping: false,
      weightKg: null,
      lengthCm: null,
      widthCm: null,
      heightCm: null,
    });
    expect(result.requiresShipping).toBe(false);
    expect(result.lengthCm).toBeNull();
  });

  it("rejects zero or negative package dimensions", () => {
    expect(productAdminSchema.safeParse({ ...baseProduct, lengthCm: 0 }).success).toBe(false);
    expect(productAdminSchema.safeParse({ ...baseProduct, widthCm: -1 }).success).toBe(false);
  });
});
