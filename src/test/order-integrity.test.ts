import { describe, expect, it } from "vitest";
import type { Product } from "@/data/catalog";
import {
  calculateOrderTotals,
  isSameOrderRequest,
  isSameOrderSubmission,
  normalizeProductOptions,
  persistOrderIdempotently,
  prepareOrderItems,
  validateCouponRecord,
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
  it("accepts products without personalization and made-to-order stock at zero", () => {
    const plain = { ...product, personalizable: false, personalization: [], stock: 0 };
    expect(prepareOrderItems([plain], [{ slug: plain.slug, qty: 2, options: { Cor: "Rosa" } }])[0]?.qty).toBe(2);
  });

  it("rejects missing required personalization fields on the server", () => {
    const requiredProduct = {
      ...product,
      personalization: product.personalization.map((field) =>
        field.key === "nome" ? { ...field, required: true } : field,
      ),
    };
    expect(() => normalizeProductOptions(requiredProduct, { Cor: "Rosa" })).toThrow(/Nome é obrigatório/);
  });

  it("rejects quantities above the maximum and unpublished products", () => {
    expect(() => prepareOrderItems([product], [{ slug: product.slug, qty: 1000, options: { Cor: "Rosa" } }])).toThrow(/quantidade inválida/);
    expect(() => prepareOrderItems([{ ...product, published: false }], [{ slug: product.slug, qty: 2, options: { Cor: "Rosa" } }])).toThrow(/Produto indisponível/);
  });

  it("rejects invalid and inactive (expired) coupons", () => {
    expect(() => validateCouponRecord("PAPELEMI10", null)).toThrow(/inválido/);
    expect(() => validateCouponRecord("PAPELEMI10", { code: "PAPELEMI10", percent: 10, active: false })).toThrow(/inativo ou expirado/);
    expect(validateCouponRecord("PAPELEMI10", { code: "PAPELEMI10", percent: 10, active: true })).toEqual({ code: "PAPELEMI10", percent: 10 });
  });

  const snapshot: OrderRequestSnapshot = {
    store_key: "papelemi",
    customer_name: "Ana",
    customer_email: "ana@example.com",
    customer_phone: "41999999999",
    address: { cep: "80000000", street: "Rua A", number: "10", complement: "", district: "Centro", city: "Curitiba", state: "PR" },
    items: [{ slug: "caderneta", qty: 2, unit_price: 54.9, options: { Nome: "Lia" } }],
    subtotal: 109.8, shipping: 0, discount: 0, coupon_code: null, total: 109.8,
    customer_notes: "", accepted_privacy: true, source: "storefront",
  };
  const persistedRecord = { id: "11111111-1111-4111-8111-111111111111", ...snapshot };

  it("recovers the same persisted order after a connection timeout", async () => {
    let stored: typeof persistedRecord | null = null;
    await expect(persistOrderIdempotently({
      findExisting: async () => stored,
      insert: async () => {
        stored = persistedRecord;
        throw new Error("connection timeout after database commit");
      },
      matches: (existing) => isSameOrderRequest(existing, snapshot),
    })).rejects.toThrow(/connection timeout/);
    const recovered = await persistOrderIdempotently({
      findExisting: async () => stored,
      insert: async () => null,
      matches: (existing) => isSameOrderRequest(existing, snapshot),
    });
    expect(recovered.record.id).toBe(persistedRecord.id);
    expect(recovered.created).toBe(false);
  });

  it("returns one order for concurrent duplicate submissions", async () => {
    let stored: typeof persistedRecord | null = null;
    const submit = () => persistOrderIdempotently({
      findExisting: async () => stored,
      insert: async () => {
        if (stored) return null;
        stored = persistedRecord;
        return persistedRecord;
      },
      matches: (existing) => isSameOrderRequest(existing, snapshot),
    });
    const results = await Promise.all([submit(), submit()]);
    expect(results.map((result) => result.record.id)).toEqual([persistedRecord.id, persistedRecord.id]);
    expect(results.filter((result) => result.created)).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key with a different request snapshot", async () => {
    const changed = { ...persistedRecord, customer_email: "outra@example.com" };
    await expect(persistOrderIdempotently({
      findExisting: async () => changed,
      insert: async () => null,
      matches: (existing) => isSameOrderRequest(existing, snapshot),
    })).rejects.toThrow(/ORDER_REQUEST_CONFLICT/);
  });

  it("recovers an existing order when the live product price changes after timeout", () => {
    const existing: OrderRequestSnapshot = {
      ...snapshot,
      coupon_code: "PAPELEMI10",
      subtotal: 109.8,
      discount: 10.98,
      total: 98.82,
      items: [{ slug: "caderneta-teste", name: "Caderneta", qty: 2, unit_price: 54.9, options: { Nome: "Lia" } }],
    };
    const submission = {
      customer: { name: "Ana", email: "ana@example.com", phone: "41999999999" },
      address: { cep: "80000-000", street: "Rua A", number: "10", complement: "", district: "Centro", city: "Curitiba", state: "PR" },
      items: [{ slug: "caderneta-teste", qty: 2, options: { Cor: "", Nome: "Lia" } }],
      couponCode: "PAPELEMI10",
      customerNotes: "",
      acceptedPrivacy: true as const,
    };
    expect(isSameOrderSubmission(existing, submission)).toBe(true);
    expect(isSameOrderSubmission(existing, { ...submission, items: [{ ...submission.items[0]!, qty: 3 }] })).toBe(false);
  });

});
