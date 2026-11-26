import { describe, expect, it } from "vitest";
import type { Product } from "@/data/catalog";
import {
  calculateCheckoutTotals,
  hasPriceChanged,
  orderRequestMatches,
  persistOrderIdempotently,
  validateAndSnapshotItems,
  validateCouponRecord,
  type ExistingOrderForIdempotency,
  type OrderRequestIdentity,
} from "@/lib/checkout-integrity";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    slug: "caderneta-saude-ursinho-clean",
    name: "Caderneta de Saúde · Ursinho Clean",
    category: "cadernetas",
    description: "Produto de teste",
    images: [],
    price: 59.9,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "5 a 7 dias úteis",
    stock: 0,
    published: true,
    personalizable: true,
    personalization: [],
    ...overrides,
  };
}

const request: OrderRequestIdentity = {
  customer: { name: "Maria Silva", email: "maria@example.com", phone: "(41) 99999-0000" },
  address: {
    cep: "80000-000",
    street: "Rua das Flores",
    number: "120",
    complement: "",
    district: "Centro",
    city: "Curitiba",
    state: "PR",
  },
  items: [{
    slug: "caderneta-saude-ursinho-clean",
    qty: 1,
    options: { "Mensagem ou dedicatória": "Com carinho", Cor: "" },
  }],
  customerNotes: "",
  acceptedPrivacy: true,
};

const existingOrder: ExistingOrderForIdempotency = {
  customer_name: "Maria Silva",
  customer_email: "maria@example.com",
  customer_phone: "(41) 99999-0000",
  address: request.address,
  items: [{
    slug: "caderneta-saude-ursinho-clean",
    name: "Caderneta de Saúde · Ursinho Clean",
    qty: 1,
    unit_price: 59.9,
    options: { "Mensagem ou dedicatória": "Com carinho" },
  }],
  coupon_code: null,
  customer_notes: "",
  accepted_privacy: true,
};

describe("checkout server validation", () => {
  it("accepts a product without personalization", () => {
    const product = makeProduct({ personalizable: false, personalization: [] });
    const [item] = validateAndSnapshotItems(
      [{ slug: product.slug, qty: 1, options: {} }],
      [product],
    );
    expect(item.options).toEqual({});
    expect(item.unit_price).toBe(59.9);
  });

  it("rejects missing required personalization fields", () => {
    const product = makeProduct({
      personalization: [{ type: "text", key: "nome", label: "Nome", maxLength: 40, required: true }],
    });
    expect(() => validateAndSnapshotItems(
      [{ slug: product.slug, qty: 1, options: {} }],
      [product],
    )).toThrow("Preencha o campo obrigatório: Nome");
  });

  it("preserves a dedication under the correct product", () => {
    const product = makeProduct({
      personalization: [{ type: "text", key: "frase", label: "Mensagem ou dedicatória", maxLength: 140, ai: true }],
    });
    const [item] = validateAndSnapshotItems(
      [{ slug: product.slug, qty: 1, options: { "Mensagem ou dedicatória": "Com carinho para você" } }],
      [product],
    );
    expect(item.options).toEqual({ "Mensagem ou dedicatória": "Com carinho para você" });
  });

  it("validates multiple configured fields and available variations", () => {
    const product = makeProduct({
      colors: ["Areia", "Lavanda"],
      sizes: ["A5"],
      personalization: [
        { type: "text", key: "nome", label: "Nome", maxLength: 40, required: true },
        { type: "choice", key: "papel", label: "Papel", options: ["Offset", "Couchê"], required: true },
        { type: "notes", key: "observacoes", label: "Observações", required: false },
      ],
    });
    const [item] = validateAndSnapshotItems(
      [{
        slug: product.slug,
        qty: 1,
        options: { Cor: "Areia", Tamanho: "A5", Nome: "Ana", Papel: "Offset", Observações: "Entregar até sexta" },
      }],
      [product],
    );
    expect(item.options).toEqual({
      Cor: "Areia",
      Tamanho: "A5",
      Nome: "Ana",
      Papel: "Offset",
      Observações: "Entregar até sexta",
    });
  });

  it("rejects a variation that is not configured for the product", () => {
    const product = makeProduct({ colors: ["Areia"] });
    expect(() => validateAndSnapshotItems(
      [{ slug: product.slug, qty: 1, options: { Cor: "Rosa" } }],
      [product],
    )).toThrow("não está disponível");
  });

  it("rejects arbitrary personalization keys", () => {
    const product = makeProduct({ personalizable: false, personalization: [] });
    expect(() => validateAndSnapshotItems(
      [{ slug: product.slug, qty: 1, options: { "Texto inventado": "valor" } }],
      [product],
    )).toThrow("Opção não permitida");
  });

  it("enforces field character limits", () => {
    const product = makeProduct({
      personalization: [{ type: "text", key: "nome", label: "Nome", maxLength: 4 }],
    });
    expect(() => validateAndSnapshotItems(
      [{ slug: product.slug, qty: 1, options: { Nome: "Mariana" } }],
      [product],
    )).toThrow("no máximo 4 caracteres");
  });

  it("enforces the configured minimum quantity", () => {
    const product = makeProduct({ minQty: 3 });
    expect(() => validateAndSnapshotItems(
      [{ slug: product.slug, qty: 2, options: {} }],
      [product],
    )).toThrow("Quantidade mínima");
  });

  it("rejects quantities above the server maximum", () => {
    const product = makeProduct();
    expect(() => validateAndSnapshotItems(
      [{ slug: product.slug, qty: 1000, options: {} }],
      [product],
    )).toThrow("limite é 999");
  });

  it("rejects unpublished or missing products", () => {
    const product = makeProduct({ published: false });
    expect(() => validateAndSnapshotItems(
      [{ slug: product.slug, qty: 1, options: {} }],
      [product],
    )).toThrow("Produto indisponível");
  });

  it("uses the current database price and detects a changed displayed total", () => {
    const product = makeProduct({ price: 59.9, promoPrice: 49.9 });
    const [item] = validateAndSnapshotItems(
      [{ slug: product.slug, qty: 2, options: {} }],
      [product],
    );
    const totals = calculateCheckoutTotals([item], null);
    expect(item.unit_price).toBe(49.9);
    expect(totals.total).toBe(99.8);
    expect(hasPriceChanged(119.8, totals.total)).toBe(true);
    expect(hasPriceChanged(99.8, totals.total)).toBe(false);
  });

  it("rejects an invalid coupon", () => {
    expect(() => validateCouponRecord("NAOEXISTE", null)).toThrow("Cupom inválido");
  });

  it("treats an inactive coupon as expired", () => {
    expect(() => validateCouponRecord("VENCIDO", {
      code: "VENCIDO",
      percent: 10,
      active: false,
    })).toThrow("inativo ou expirado");
  });

  it("recalculates an authorized coupon discount on the server", () => {
    const product = makeProduct({ price: 100 });
    const [item] = validateAndSnapshotItems(
      [{ slug: product.slug, qty: 2, options: {} }],
      [product],
    );
    const coupon = validateCouponRecord("PAPELEMI10", {
      code: "PAPELEMI10",
      percent: 10,
      active: true,
    });
    expect(calculateCheckoutTotals([item], coupon)).toEqual({
      subtotal: 200,
      shipping: 0,
      discount: 20,
      total: 180,
    });
  });
});

describe("checkout idempotency and recovery", () => {
  it("reuses the same order for a repeated submission", async () => {
    let insertCalls = 0;
    const result = await persistOrderIdempotently({
      findExisting: async () => existingOrder,
      insert: async () => {
        insertCalls += 1;
        return existingOrder;
      },
      matches: (record) => orderRequestMatches(record, request),
    });
    expect(result).toEqual({ record: existingOrder, created: false });
    expect(insertCalls).toBe(0);
  });

  it("recovers an order committed before a connection timeout", async () => {
    let stored: ExistingOrderForIdempotency | null = null;
    let firstAttempt = true;
    const persist = () => persistOrderIdempotently({
      findExisting: async () => stored,
      insert: async () => {
        stored = existingOrder;
        if (firstAttempt) {
          firstAttempt = false;
          throw new Error("network timeout after commit");
        }
        return existingOrder;
      },
      matches: (record) => orderRequestMatches(record, request),
    });

    await expect(persist()).rejects.toThrow("network timeout");
    const recovered = await persist();
    expect(recovered).toEqual({ record: existingOrder, created: false });
  });

  it("recovers a concurrent insert through the primary-key conflict", async () => {
    let lookups = 0;
    const result = await persistOrderIdempotently({
      findExisting: async () => {
        lookups += 1;
        return lookups === 1 ? null : existingOrder;
      },
      insert: async () => {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      },
      matches: (record) => orderRequestMatches(record, request),
    });
    expect(result).toEqual({ record: existingOrder, created: false });
  });

  it("does not reuse an idempotency key for different customer data", async () => {
    const changedRequest: OrderRequestIdentity = {
      ...request,
      customer: { ...request.customer, email: "other@example.com" },
    };
    await expect(persistOrderIdempotently({
      findExisting: async () => existingOrder,
      insert: async () => existingOrder,
      matches: (record) => orderRequestMatches(record, changedRequest),
    })).rejects.toThrow("outros dados");
  });
});
