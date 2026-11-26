import type { Product } from "@/data/catalog";

export const MAX_ORDER_QUANTITY = 999;
export const MAX_PERSONALIZATION_FIELDS = 20;
export const MAX_ORDER_OPTIONS = MAX_PERSONALIZATION_FIELDS + 3;
export const MAX_NOTES_LENGTH = 400;

export type CheckoutItemInput = {
  slug: string;
  qty: number;
  options: Record<string, string>;
};

export type OrderItemSnapshot = {
  slug: string;
  name: string;
  qty: number;
  unit_price: number;
  options: Record<string, string>;
};

export type CouponRecord = {
  code: string;
  percent: number;
  active: boolean;
};

export type CheckoutTotals = {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
};

export type OrderRequestIdentity = {
  customer: { name: string; email: string; phone: string };
  address: Record<string, string>;
  items: CheckoutItemInput[];
  couponCode?: string;
  customerNotes: string;
  acceptedPrivacy: true;
};

export type ExistingOrderForIdempotency = {
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  address: unknown;
  items: unknown;
  coupon_code: string | null;
  customer_notes: string | null;
  accepted_privacy: boolean;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizedOptions(options: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(options)
      .map(([key, value]) => [key.trim(), typeof value === "string" ? value.trim() : ""] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizedAddress(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, typeof item === "string" ? item.trim().toLowerCase() : String(item ?? "")] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizedItemsForComparison(value: unknown): Array<{ slug: string; qty: number; options: Record<string, string> }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const options = row.options && typeof row.options === "object" && !Array.isArray(row.options)
      ? normalizedOptions(row.options as Record<string, unknown>)
      : {};
    return {
      slug: typeof row.slug === "string" ? row.slug.trim() : "",
      qty: Number(row.qty),
      options,
    };
  });
}

function readConfiguredOption(
  values: Map<string, string>,
  consumed: Set<string>,
  keys: string[],
  label: string,
): string {
  const matches = keys.filter((key) => values.has(key));
  const distinctValues = new Set(matches.map((key) => values.get(key) ?? ""));
  if (distinctValues.size > 1) throw new Error(`Há valores conflitantes para ${label}.`);
  matches.forEach((key) => consumed.add(key));
  return matches.length ? values.get(matches[0]) ?? "" : "";
}

function validateProductOptions(product: Product, supplied: Record<string, string>): Record<string, string> {
  const entries = Object.entries(supplied);
  if (entries.length > MAX_ORDER_OPTIONS) {
    throw new Error(`Há opções demais para o produto ${product.name}.`);
  }

  const values = new Map<string, string>();
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    const value = rawValue.trim();
    if (!key || value.length === 0) continue;
    if (values.has(key) && values.get(key) !== value) {
      throw new Error(`A opção ${key} foi enviada mais de uma vez com valores diferentes.`);
    }
    values.set(key, value);
  }

  const consumed = new Set<string>();
  const canonical: Record<string, string> = {};
  const variations = [
    { label: "Cor", allowed: product.colors },
    { label: "Tamanho", allowed: product.sizes },
    { label: "Acabamento", allowed: product.finishes },
  ];

  for (const variation of variations) {
    const value = readConfiguredOption(values, consumed, [variation.label], variation.label);
    const allowed = variation.allowed.map((item) => item.trim()).filter(Boolean);
    if (allowed.length === 0) {
      if (value) throw new Error(`${variation.label} não é uma variação disponível para ${product.name}.`);
      continue;
    }
    if (!value) throw new Error(`Selecione uma opção de ${variation.label.toLowerCase()} para ${product.name}.`);
    if (!allowed.includes(value)) {
      throw new Error(`A opção de ${variation.label.toLowerCase()} não está disponível para ${product.name}.`);
    }
    canonical[variation.label] = value;
  }

  for (const field of product.personalization) {
    const value = readConfiguredOption(values, consumed, [field.key, field.label], field.label);
    if (!product.personalizable) {
      if (value) throw new Error(`${product.name} não aceita personalização.`);
      continue;
    }
    if (field.required && !value) throw new Error(`Preencha o campo obrigatório: ${field.label}.`);
    if (!value) continue;

    if (field.type === "text" && value.length > field.maxLength) {
      throw new Error(`${field.label} aceita no máximo ${field.maxLength} caracteres.`);
    }
    if (field.type === "choice" && !field.options.includes(value)) {
      throw new Error(`A opção selecionada em ${field.label} não é permitida.`);
    }
    if (field.type === "notes" && value.length > MAX_NOTES_LENGTH) {
      throw new Error(`${field.label} aceita no máximo ${MAX_NOTES_LENGTH} caracteres.`);
    }
    canonical[field.label] = value;
  }

  const unknown = [...values.keys()].filter((key) => !consumed.has(key));
  if (unknown.length) throw new Error(`Opção não permitida para ${product.name}: ${unknown[0]}.`);
  return canonical;
}

export function validateAndSnapshotItems(
  inputItems: readonly CheckoutItemInput[],
  products: readonly Product[],
): OrderItemSnapshot[] {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  return inputItems.map((item) => {
    const product = bySlug.get(item.slug);
    if (!product || !product.published) throw new Error(`Produto indisponível: ${item.slug}`);
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > MAX_ORDER_QUANTITY) {
      throw new Error(`Quantidade inválida para ${product.name}. O limite é ${MAX_ORDER_QUANTITY} unidades.`);
    }
    const minimum = Math.max(1, product.minQty ?? 1);
    if (item.qty < minimum) throw new Error(`Quantidade mínima para ${product.name}: ${minimum} unidades.`);

    const unitPrice = product.promoPrice ?? product.price;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error(`Preço indisponível para ${product.name}.`);
    }

    return {
      slug: product.slug,
      name: product.name,
      qty: item.qty,
      unit_price: roundMoney(unitPrice),
      options: validateProductOptions(product, item.options),
    };
  });
}

export function validateCouponRecord(code: string, coupon: CouponRecord | null): CouponRecord {
  const normalizedCode = code.trim().toUpperCase();
  if (!coupon || !coupon.active || coupon.code.trim().toUpperCase() !== normalizedCode) {
    throw new Error("Cupom inválido, inativo ou expirado.");
  }
  if (!Number.isInteger(coupon.percent) || coupon.percent < 1 || coupon.percent > 90) {
    throw new Error("O desconto deste cupom não está configurado corretamente.");
  }
  return { code: normalizedCode, percent: coupon.percent, active: true };
}

export function calculateCheckoutTotals(
  items: readonly OrderItemSnapshot[],
  coupon: Pick<CouponRecord, "percent"> | null,
  shipping = 0,
): CheckoutTotals {
  if (!Number.isFinite(shipping) || shipping < 0) throw new Error("Valor de frete inválido.");
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.unit_price * item.qty, 0));
  const discount = coupon ? roundMoney((subtotal * coupon.percent) / 100) : 0;
  return {
    subtotal,
    shipping: roundMoney(shipping),
    discount,
    total: roundMoney(subtotal - discount + shipping),
  };
}

export function hasPriceChanged(expectedTotal: number, currentTotal: number): boolean {
  return roundMoney(expectedTotal) !== roundMoney(currentTotal);
}

export function orderRequestMatches(
  existing: ExistingOrderForIdempotency,
  input: OrderRequestIdentity,
): boolean {
  const storedItems = normalizedItemsForComparison(existing.items);
  const requestedItems = normalizedItemsForComparison(input.items);
  const storedPhone = String(existing.customer_phone ?? "").replace(/\D/g, "");
  const requestedPhone = input.customer.phone.replace(/\D/g, "");

  return (
    existing.customer_name.trim().toLowerCase() === input.customer.name.trim().toLowerCase() &&
    existing.customer_email.trim().toLowerCase() === input.customer.email.trim().toLowerCase() &&
    storedPhone === requestedPhone &&
    stableStringify(normalizedAddress(existing.address)) === stableStringify(normalizedAddress(input.address)) &&
    (existing.coupon_code ?? "").trim().toUpperCase() === (input.couponCode ?? "").trim().toUpperCase() &&
    (existing.customer_notes ?? "").trim() === input.customerNotes.trim() &&
    existing.accepted_privacy === input.acceptedPrivacy &&
    storedItems.length === requestedItems.length &&
    storedItems.every((item, index) => {
      const requested = requestedItems[index];
      return Boolean(requested) &&
        item.slug === requested.slug &&
        item.qty === requested.qty &&
        stableStringify(item.options) === stableStringify(requested.options);
    })
  );
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

export async function persistOrderIdempotently<TRecord>(args: {
  findExisting: () => Promise<TRecord | null>;
  insert: () => Promise<TRecord>;
  matches: (record: TRecord) => boolean;
}): Promise<{ record: TRecord; created: boolean }> {
  const existing = await args.findExisting();
  if (existing) {
    if (!args.matches(existing)) {
      throw new Error("Esta tentativa já foi usada com outros dados. Para evitar uma encomenda duplicada, confira o protocolo anterior.");
    }
    return { record: existing, created: false };
  }

  try {
    return { record: await args.insert(), created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await args.findExisting();
    if (raced && args.matches(raced)) return { record: raced, created: false };
    throw new Error("Não foi possível confirmar a tentativa anterior. Recarregue o checkout antes de tentar novamente.");
  }
}
