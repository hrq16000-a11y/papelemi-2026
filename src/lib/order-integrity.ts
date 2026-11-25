import type { Product } from "@/data/catalog";

export type OrderLineInput = {
  slug: string;
  qty: number;
  options: Record<string, string>;
};

export type PreparedOrderItem = {
  slug: string;
  name: string;
  qty: number;
  unit_price: number;
  options: Record<string, string>;
};

const VARIATIONS = [
  { label: "Cor", field: "colors" },
  { label: "Tamanho", field: "sizes" },
  { label: "Acabamento", field: "finishes" },
] as const;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeProductOptions(product: Product, submitted: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  const acceptedKeys = new Set<string>(VARIATIONS.map((variation) => variation.label));

  for (const variation of VARIATIONS) {
    const values = product[variation.field];
    let value = (submitted[variation.label] ?? "").trim();
    if (values.length === 1 && !value) value = values[0] ?? "";
    if (values.length > 0 && !value) throw new Error(`Selecione ${variation.label.toLowerCase()} para ${product.name}.`);
    if (value && !values.includes(value)) throw new Error(`A opção de ${variation.label.toLowerCase()} não está disponível para ${product.name}.`);
    if (values.length === 0 && value) throw new Error(`${product.name} não oferece a opção ${variation.label.toLowerCase()}.`);
    if (value) normalized[variation.label] = value;
  }

  if (!product.personalizable) {
    const hasPersonalization = product.personalization.some((field) => {
      acceptedKeys.add(field.key);
      acceptedKeys.add(field.label);
      return Boolean((submitted[field.key] || submitted[field.label] || "").trim());
    });
    if (hasPersonalization) throw new Error(`${product.name} não aceita personalização.`);
  } else {
    const seenKeys = new Set<string>();
    const seenLabels = new Set<string>();
    for (const field of product.personalization) {
      if (seenKeys.has(field.key) || seenLabels.has(field.label) || acceptedKeys.has(field.key) || acceptedKeys.has(field.label)) {
        throw new Error(`Configuração de personalização inválida para ${product.name}.`);
      }
      seenKeys.add(field.key);
      seenLabels.add(field.label);
      acceptedKeys.add(field.key);
      acceptedKeys.add(field.label);
      const byKey = (submitted[field.key] ?? "").trim();
      const byLabel = (submitted[field.label] ?? "").trim();
      if (byKey && byLabel && byKey !== byLabel) throw new Error(`Há valores conflitantes no campo ${field.label}.`);
      const value = byKey || byLabel;
      if (!value) continue;
      if (field.type === "text" && value.length > field.maxLength) throw new Error(`${field.label} aceita até ${field.maxLength} caracteres.`);
      if (field.type === "choice" && !field.options.includes(value)) throw new Error(`Escolha uma opção válida para ${field.label}.`);
      if (field.type === "notes" && value.length > 400) throw new Error(`${field.label} aceita até 400 caracteres.`);
      normalized[field.label] = value;
    }
  }

  for (const [key, value] of Object.entries(submitted)) {
    if (!acceptedKeys.has(key) && value.trim()) throw new Error(`O campo de personalização "${key}" não pertence a ${product.name}.`);
  }
  return normalized;
}

export function prepareOrderItems(products: Product[], submitted: OrderLineInput[]): PreparedOrderItem[] {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  return submitted.map((item) => {
    const product = bySlug.get(item.slug);
    if (!product || !product.published) throw new Error(`Produto indisponível: ${item.slug}`);
    const minimum = product.minQty ?? 1;
    if (item.qty < minimum) throw new Error(`${product.name}: a quantidade mínima é de ${minimum} unidade(s). Ajuste o carrinho.`);
    if (!Number.isFinite(product.price) || product.price <= 0) throw new Error(`Preço inválido cadastrado para ${product.name}. Fale com a PapeLemi.`);
    if (product.promoPrice !== undefined && (!Number.isFinite(product.promoPrice) || product.promoPrice <= 0 || product.promoPrice >= product.price)) {
      throw new Error(`Preço promocional inválido cadastrado para ${product.name}. Fale com a PapeLemi.`);
    }
    return {
      slug: product.slug,
      name: product.name,
      qty: item.qty,
      unit_price: product.promoPrice ?? product.price,
      options: normalizeProductOptions(product, item.options),
    };
  });
}

export function calculateOrderTotals(items: PreparedOrderItem[], couponPercent: number | null) {
  if (couponPercent !== null && (!Number.isInteger(couponPercent) || couponPercent < 1 || couponPercent > 90)) {
    throw new Error("Percentual de cupom inválido.");
  }
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.unit_price * item.qty, 0));
  const discount = couponPercent === null ? 0 : roundMoney((subtotal * couponPercent) / 100);
  const shipping = 0;
  return { subtotal, discount, shipping, total: roundMoney(subtotal - discount + shipping) };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function moneyEqual(left: unknown, right: unknown): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && roundMoney(a) === roundMoney(b);
}

export type OrderRequestSnapshot = {
  store_key: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address: unknown;
  items: unknown;
  subtotal: unknown;
  shipping: unknown;
  discount: unknown;
  coupon_code: string | null;
  total: unknown;
  customer_notes: string;
  accepted_privacy: boolean;
  source: string;
};

export function isSameOrderRequest(existing: OrderRequestSnapshot, expected: OrderRequestSnapshot): boolean {
  return existing.store_key === "papelemi"
    && existing.store_key === expected.store_key
    && existing.customer_name === expected.customer_name
    && existing.customer_email === expected.customer_email
    && existing.customer_phone === expected.customer_phone
    && stableJson(existing.address) === stableJson(expected.address)
    && stableJson(existing.items) === stableJson(expected.items)
    && moneyEqual(existing.subtotal, expected.subtotal)
    && moneyEqual(existing.shipping, expected.shipping)
    && moneyEqual(existing.discount, expected.discount)
    && existing.coupon_code === expected.coupon_code
    && moneyEqual(existing.total, expected.total)
    && existing.customer_notes === expected.customer_notes
    && existing.accepted_privacy === expected.accepted_privacy
    && existing.source === expected.source;
}
