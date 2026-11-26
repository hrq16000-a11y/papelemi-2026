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

export const MAX_ORDER_QUANTITY = 999;
export type CouponRecord = { code: string; percent: number; active: boolean };

// O schema atual não possui expires_at: cupons expirados devem ser desativados (active=false).
export function validateCouponRecord(requestedCode: string, coupon: CouponRecord | null) {
  const normalizedCode = requestedCode.trim().toUpperCase();
  if (!coupon || !coupon.active || coupon.code.toUpperCase() !== normalizedCode) {
    throw new Error("Cupom inválido, inativo ou expirado.");
  }
  if (!Number.isInteger(coupon.percent) || coupon.percent < 1 || coupon.percent > 90) {
    throw new Error("Percentual de cupom inválido.");
  }
  return { code: coupon.code, percent: coupon.percent };
}

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
      if (!value) {
        if (field.required) throw new Error(`${field.label} é obrigatório.`);
        continue;
      }
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
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > MAX_ORDER_QUANTITY) {
      throw new Error(`${product.name}: quantidade inválida. Use de 1 a ${MAX_ORDER_QUANTITY} unidades.`);
    }
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


export type OrderSubmissionInput = {
  customer: { name: string; email: string; phone: string };
  address: { cep: string; street: string; number: string; complement: string; district: string; city: string; state: string };
  items: OrderLineInput[];
  couponCode?: string;
  customerNotes: string;
  acceptedPrivacy: true;
};

function nonEmptyOptions(options: Record<string, string> | null | undefined) {
  return Object.fromEntries(
    Object.entries(options ?? {})
      .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
      .map(([key, value]) => [key, value.trim()]),
  );
}

export function isSameOrderSubmission(existing: OrderRequestSnapshot, input: OrderSubmissionInput): boolean {
  if (!Array.isArray(existing.items)) return false;
  const storedItems = existing.items as Array<{ slug?: unknown; qty?: unknown; options?: Record<string, string> }>;
  if (storedItems.some((item) => typeof item.slug !== "string" || typeof item.qty !== "number")) return false;
  const storedCart = storedItems.map((item) => ({
    slug: item.slug,
    qty: item.qty,
    options: nonEmptyOptions(item.options),
  }));
  const submittedCart = input.items.map((item) => ({
    slug: item.slug,
    qty: item.qty,
    options: nonEmptyOptions(item.options),
  }));
  const existingAddress = existing.address as Record<string, unknown>;
  const normalizedExistingAddress = {
    cep: String(existingAddress.cep ?? "").replace(/\D/g, ""),
    street: String(existingAddress.street ?? ""),
    number: String(existingAddress.number ?? ""),
    complement: String(existingAddress.complement ?? ""),
    district: String(existingAddress.district ?? ""),
    city: String(existingAddress.city ?? ""),
    state: String(existingAddress.state ?? "").toUpperCase(),
  };
  const normalizedInputAddress = {
    cep: input.address.cep.replace(/\D/g, ""),
    street: input.address.street,
    number: input.address.number,
    complement: input.address.complement,
    district: input.address.district,
    city: input.address.city,
    state: input.address.state.toUpperCase(),
  };
  return existing.store_key === "papelemi"
    && existing.customer_name === input.customer.name
    && existing.customer_email.toLowerCase() === input.customer.email.toLowerCase()
    && existing.customer_phone === input.customer.phone
    && stableJson(normalizedExistingAddress) === stableJson(normalizedInputAddress)
    && stableJson(storedCart) === stableJson(submittedCart)
    && existing.coupon_code === (input.couponCode ?? null)
    && existing.customer_notes === input.customerNotes
    && existing.accepted_privacy === input.acceptedPrivacy
    && existing.source === "storefront";
}

export async function persistOrderIdempotently<T extends OrderRequestSnapshot & { id: string }>(options: {
  findExisting: () => Promise<T | null>;
  insert: () => Promise<T | null>;
  matches: (record: T) => boolean;
}): Promise<{ record: T; created: boolean }> {
  const conflict = () => new Error(
    "ORDER_REQUEST_CONFLICT: Esta tentativa já foi usada com outros dados. Gere uma nova tentativa e envie novamente.",
  );
  const existing = await options.findExisting();
  if (existing) {
    if (!options.matches(existing)) throw conflict();
    return { record: existing, created: false };
  }
  const inserted = await options.insert();
  if (inserted) {
    if (!options.matches(inserted)) throw conflict();
    return { record: inserted, created: true };
  }
  const raced = await options.findExisting();
  if (!raced || !options.matches(raced)) throw conflict();
  return { record: raced, created: false };
}
