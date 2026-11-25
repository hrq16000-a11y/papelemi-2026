import { describe, expect, it } from "vitest";
import type { Product } from "@/data/catalog";
import {
  calculateOrderTotals,
  isSameOrderRequest,
  normalizeProductOptions,
  prepareOrderItems,
  type OrderRequestSnapshot,
} from "@/lib/order-integrity";

const product: Product = {
  slug: "caderneta-teste",
  name: "Caderneta de teste",
  category: "cadernetas",
  description: "",
  images: [],
  price: 60,
  promoPrice: 54.9,
  colors: ["Rosa", "Azul"],
  sizes: [],
  finishes: [],
  productionDays: "10 dias úteis",
  stock: 0,
  published: true,
  personalizable: true,
  personalization: [
    { type: "text", key: "nome", label: "Nome", maxLength: 20 },
    { type: "text", key: "frase", label: "Mensagem ou dedicatória", maxLength: 40, ai: true },
    { type: "choice", key: "capa", label: "Capa", options: ["Floral", "Minimalista"] },
    { type: "notes", key: "observacoes", label: "Observações" },
  ],
  minQty: 2,
};

describe("order integrity", () => {
  it("preserves legacy cart labels and normalizes personalization", () => {
    expect(normalizeProductOptions(product, {
      Cor: "Rosa",
      Nome: " Lia ",
      "Mensagem ou dedicatória": "Que sua vida seja cheia de luz.",
      Capa: "Floral",
      Observações: "Embalagem para presente",
    })).toEqual({
      Cor: "Rosa",
      Nome: "Lia",
      "Mensagem ou dedicatória": "Que sua vida seja cheia de luz.",
      Capa: "Floral",
      Observações: "Embalagem para presente",
    });
  });

  it("accepts canonical option keys used by product forms", () => {
    expect(normalizeProductOptions(product, {
      Cor: "Azul", nome: "Lia", frase: "Com carinho", capa: "Minimalista",
    })).toEqual({
      Cor: "Azul", Nome: "Lia", "Mensagem ou dedicatória": "Com carinho", Capa: "Minimalista",
    });
  });

  it("rejects unknown, unsupported and overlong personalization values", () => {
    expect(() => normalizeProductOptions(product, { Cor: "Verde" })).toThrow(/cor/);
    expect(() => normalizeProductOptions(product, { Cor: "Rosa", nome: "Este nome é muito comprido para o limite" })).toThrow(/20 caracteres/);
    expect(() => normalizeProductOptions(product, { Cor: "Rosa", capa: "Madeira" })).toThrow(/opção válida/);
    expect(() => normalizeProductOptions(product, { Cor: "Rosa", CampoInventado: "valor" })).toThrow(/não pertence/);
  });

  it("rejects personalization for products that do not allow it", () => {
    const plain = { ...product, personalizable: false };
    expect(() => normalizeProductOptions(plain, { Cor: "Rosa", frase: "Mensagem" })).toThrow(/não aceita personalização/);
  });

  it("enforces minimum quantity without silently increasing the customer's order", () => {
    expect(() => prepareOrderItems([product], [{ slug: product.slug, qty: 1, options: { Cor: "Rosa" } }])).toThrow(/quantidade mínima é de 2/);
  });

  it("uses the current promotional price and preserves normalized options", () => {
    expect(prepareOrderItems([product], [{ slug: product.slug, qty: 2, options: { Cor: "Rosa", frase: "Com carinho" } }])).toEqual([{
      slug: product.slug,
      name: product.name,
      qty: 2,
      unit_price: 54.9,
      options: { Cor: "Rosa", "Mensagem ou dedicatória": "Com carinho" },
    }]);
  });

  it("calculates rounded totals using the active coupon percentage", () => {
    const items = prepareOrderItems([product], [{ slug: product.slug, qty: 2, options: { Cor: "Rosa" } }]);
    expect(calculateOrderTotals(items, 10)).toEqual({ subtotal: 109.8, discount: 10.98, shipping: 0, total: 98.82 });
  });

  it("reuses an existing order only when the complete request snapshot matches", () => {
    const expected: OrderRequestSnapshot = {
      store_key: "papelemi",
      customer_name: "Ana",
      customer_email: "ana@example.com",
      customer_phone: "(41) 99999-9999",
      address: { city: "Curitiba", state: "PR", cep: "80000000" },
      items: [{ slug: "caderneta", qty: 1, options: { Nome: "Lia", "Mensagem ou dedicatória": "Com carinho" } }],
      subtotal: 60, shipping: 0, discount: 0, coupon_code: null, total: 60,
      customer_notes: "", accepted_privacy: true, source: "storefront",
    };
    const existing = {
      ...expected,
      address: { cep: "80000000", state: "PR", city: "Curitiba" },
      items: [{ slug: "caderneta", qty: 1, options: { "Mensagem ou dedicatória": "Com carinho", Nome: "Lia" } }],
      subtotal: "60.00",
      total: "60.00",
    };
    expect(isSameOrderRequest(existing, expected)).toBe(true);
    expect(isSameOrderRequest({ ...existing, customer_phone: "(41) 98888-8888" }, expected)).toBe(false);
    expect(isSameOrderRequest({ ...existing, total: "59.00" }, expected)).toBe(false);
  });
});
