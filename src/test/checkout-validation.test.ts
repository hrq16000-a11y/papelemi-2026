import { describe, expect, it, vi } from "vitest";
import {
  calculateCheckoutTotals,
  orderMatchesIntent,
  persistOrderIdempotently,
  validateCheckoutLine,
  validateCouponRecord,
  type CheckoutIntent,
  type CheckoutProduct,
  type ExistingOrder,
} from "@/lib/checkout-validation";

const product: CheckoutProduct = {
  store_key: "papelemi",
  slug: "caderneta-teste",
  name: "Caderneta de teste",
  price: "59.90",
  promo_price: null,
  colors: [],
  sizes: [],
  finishes: [],
  stock: 0,
  published: true,
  personalizable: true,
  personalization: [
    { type: "text", key: "nome", label: "Nome", maxLength: 40, required: true },
    { type: "text", key: "frase", label: "Mensagem ou dedicatória", maxLength: 140 },
    { type: "notes", key: "observacoes", label: "Observações para a encomenda" },
  ],
  min_qty: null,
};

const line = {
  slug: product.slug,
  qty: 1,
  expectedUnitPrice: 59.9,
  options: { Cor: "", Tamanho: "", Acabamento: "", Nome: "Maria" },
};

const intent: CheckoutIntent = {
  customer: { name: "Maria Silva", email: "maria@example.com", phone: "(41) 99999-9999" },
  address: {
    cep: "80000-000",
    street: "Rua das Flores",
    number: "10",
    complement: "",
    district: "Centro",
    city: "Curitiba",
    state: "PR",
  },
  items: [line],
  customerNotes: "",
  acceptedPrivacy: true,
};

const existingOrder: ExistingOrder = {
  id: "b2c72a55-6ed5-48f2-8f72-cd8fd8b86f19",
  store_key: "papelemi",
  source: "storefront",
  customer_name: "Maria Silva",
  customer_email: "maria@example.com",
  customer_phone: "(41) 99999-9999",
  address: intent.address,
  items: [{ slug: product.slug, name: product.name, qty: 1, unit_price: 59.9, options: { Nome: "Maria" } }],
  coupon_code: null,
  customer_notes: "",
  accepted_privacy: true,
  total: 59.9,
  status: "pending",
};

describe("PapeLemi checkout validation", () => {
  it("accepts a non-personalized product using only its live price", () => {
    const simple: CheckoutProduct = {
      ...product,
      personalizable: false,
      personalization: [],
      stock: 5,
    };
    expect(validateCheckoutLine(simple, { ...line, options: {} })).toMatchObject({
      slug: simple.slug,
      qty: 1,
      unit_price: 59.9,
      options: {},
    });
  });

  it("requires configured mandatory fields and preserves the dedication per item", () => {
    expect(() => validateCheckoutLine(product, { ...line, options: {} })).toThrow("Preencha o campo obrigatório: Nome");
    expect(validateCheckoutLine(product, {
      ...line,
      options: { Nome: "Maria", "Mensagem ou dedicatória": "Com carinho" },
    }).options).toEqual({ Nome: "Maria", "Mensagem ou dedicatória": "Com carinho" });
  });

  it("rejects text longer than the product's configured limit", () => {
    expect(() => validateCheckoutLine(product, {
      ...line,
      options: { Nome: "M".repeat(41) },
    })).toThrow("no máximo 40 caracteres");
  });

  it("accepts configured multiple-choice values and rejects arbitrary values", () => {
    const withChoices: CheckoutProduct = {
      ...product,
      sizes: ["Pequeno", "Grande"],
      personalization: [
        { type: "choice", key: "papel", label: "Tipo de papel", options: ["Offset", "Couchê"], required: true },
      ],
    };
    expect(validateCheckoutLine(withChoices, {
      ...line,
      options: { Tamanho: "Grande", "Tipo de papel": "Offset" },
    }).options).toEqual({ Tamanho: "Grande", "Tipo de papel": "Offset" });
    expect(() => validateCheckoutLine(withChoices, {
      ...line,
      options: { Tamanho: "Gigante", "Tipo de papel": "Offset" },
    })).toThrow("Selecione uma opção válida de tamanho");
    expect(() => validateCheckoutLine(withChoices, {
      ...line,
      options: { Tamanho: "Grande", "Tipo de papel": "Inventado" },
    })).toThrow("Escolha uma opção válida em Tipo de papel");
  });

  it("rejects arbitrary variation and unknown personalization keys", () => {
    const colored = { ...product, colors: ["Rosa", "Azul"] };
    expect(() => validateCheckoutLine(colored, { ...line, options: { Cor: "Verde", Nome: "Maria" } })).toThrow("opção válida de cor");
    expect(() => validateCheckoutLine(product, { ...line, options: { Nome: "Maria", Preço: "0,01" } })).toThrow("não é permitida");
  });

  it("rejects quantities below the configured minimum", () => {
    expect(() => validateCheckoutLine({ ...product, min_qty: 3 }, { ...line, qty: 2 })).toThrow("pedido mínimo");
  });

  it("rejects quantities above the hard limit and available stock", () => {
    expect(() => validateCheckoutLine(product, { ...line, qty: 1000 })).toThrow("entre 1 e 999");
    expect(() => validateCheckoutLine({ ...product, stock: 4 }, { ...line, qty: 5 })).toThrow("somente 4 unidade(s)");
  });

  it("rejects unpublished and unavailable non-personalized products", () => {
    expect(() => validateCheckoutLine({ ...product, published: false }, line)).toThrow("Produto indisponível");
    expect(() => validateCheckoutLine({ ...product, personalizable: false, personalization: [], stock: 0 }, { ...line, options: {} })).toThrow("Produto indisponível");
  });

  it("uses the current database price and blocks a price change since cart review", () => {
    const discounted = { ...product, promo_price: "49.90" };
    expect(validateCheckoutLine(discounted, { ...line, expectedUnitPrice: 49.9, options: { Nome: "Maria" } }).unit_price).toBe(49.9);
    expect(() => validateCheckoutLine(product, { ...line, expectedUnitPrice: 39.9 })).toThrow("preço de Caderneta de teste foi atualizado");
  });

  it("rejects invalid, inactive, and expired-as-inactive coupons", () => {
    expect(() => validateCouponRecord(null, "PAPELEMI10")).toThrow("Cupom inválido");
    expect(() => validateCouponRecord({ code: "PAPELEMI10", percent: 10, active: false }, "PAPELEMI10")).toThrow("Cupom inválido");
    expect(() => validateCouponRecord({ code: "PAPELEMI10", percent: 95, active: true }, "PAPELEMI10")).toThrow("configurado incorretamente");
    expect(validateCouponRecord({ code: "PAPELEMI10", percent: 10, active: true }, "papelemi10")).toEqual({ code: "PAPELEMI10", percent: 10 });
  });

  it("recalculates subtotal, discount, and total using integer cents", () => {
    expect(calculateCheckoutTotals([
      { qty: 2, unit_price: 59.9 },
      { qty: 1, unit_price: 6.59 },
    ], 10)).toEqual({ subtotal: 126.39, shipping: 0, discount: 12.64, total: 113.75 });
  });

  it("recognizes an identical retry and does not insert a second order", async () => {
    const insert = vi.fn();
    const result = await persistOrderIdempotently({
      findExisting: async () => existingOrder,
      insert,
      matches: (order) => orderMatchesIntent(order, intent),
    });
    expect(result).toBe(existingOrder);
    expect(insert).not.toHaveBeenCalled();
  });

  it("recovers the persisted order after a connection timeout", async () => {
    let stored: ExistingOrder | null = null;
    const insert = vi.fn(async () => {
      stored = existingOrder;
      throw new Error("connection timed out after commit");
    });
    const result = await persistOrderIdempotently({
      findExisting: async () => stored,
      insert,
      matches: (order) => orderMatchesIntent(order, intent),
    });
    expect(result).toBe(existingOrder);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("recovers a concurrent duplicate insert by reading the winning order", async () => {
    let stored: ExistingOrder | null = null;
    const result = await persistOrderIdempotently({
      findExisting: async () => stored,
      insert: async () => {
        stored = existingOrder;
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      },
      matches: (order) => orderMatchesIntent(order, intent),
    });
    expect(result).toBe(existingOrder);
  });

  it("never reports success when persistence failed and no order can be recovered", async () => {
    await expect(persistOrderIdempotently({
      findExisting: async () => null,
      insert: async () => { throw new Error("database unavailable"); },
      matches: (order) => orderMatchesIntent(order, intent),
    })).rejects.toThrow("database unavailable");
  });

  it("rejects reusing an idempotency key with different customer or item data", () => {
    expect(orderMatchesIntent(existingOrder, intent)).toBe(true);
    expect(orderMatchesIntent(existingOrder, {
      ...intent,
      customer: { ...intent.customer, email: "outra@example.com" },
    })).toBe(false);
    expect(orderMatchesIntent(existingOrder, {
      ...intent,
      items: [{ ...line, qty: 2 }],
    })).toBe(false);
  });
});
