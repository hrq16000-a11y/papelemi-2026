import { z } from "zod";

const personalizationFieldSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
    maxLength: z.number().int().min(1).max(400),
    ai: z.boolean().optional(),
    required: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("choice"),
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
    options: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
    required: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("notes"),
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
    required: z.boolean().optional(),
  }),
]);

const personalizationSchema = z.array(personalizationFieldSchema).max(20);
const submittedOptionsSchema = z.record(
  z.string().trim().min(1).max(60),
  z.string().max(500),
).superRefine((value, ctx) => {
  if (Object.keys(value).length > 30) {
    ctx.addIssue({ code: "custom", message: "Opções demais para este produto." });
  }
});

export type CheckoutProduct = {
  store_key: string;
  slug: string;
  name: string;
  price: number | string;
  promo_price: number | string | null;
  colors: string[];
  sizes: string[];
  finishes: string[];
  stock: number | null;
  published: boolean;
  personalizable: boolean;
  personalization: unknown;
  min_qty: number | null;
};

export type CheckoutLineInput = {
  slug: string;
  qty: number;
  options: Record<string, string>;
  expectedUnitPrice: number;
};

export type ValidatedOrderItem = {
  slug: string;
  name: string;
  qty: number;
  unit_price: number;
  options: Record<string, string>;
};

function priceInCents(value: number | string, label: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999) {
    throw new Error(`Preço inválido para ${label}.`);
  }
  return Math.round(amount * 100);
}

function parsePersonalization(value: unknown) {
  const fields = personalizationSchema.parse(value ?? []);
  const keys = new Set<string>();
  const labels = new Set<string>();

  for (const field of fields) {
    if (keys.has(field.key) || labels.has(field.label)) {
      throw new Error("A configuração de personalização deste produto contém campos repetidos.");
    }
    keys.add(field.key);
    labels.add(field.label);
  }

  return fields;
}

function normalizedOptions(options: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(options)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value.length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function validateCheckoutLine(
  product: CheckoutProduct,
  input: CheckoutLineInput,
): ValidatedOrderItem {
  if (product.store_key !== "papelemi" || !product.published) {
    throw new Error(`Produto indisponível: ${input.slug}`);
  }

  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 999) {
    throw new Error("A quantidade deve estar entre 1 e 999 unidades.");
  }

  const minimum = Math.max(1, product.min_qty ?? 1);
  if (input.qty < minimum) {
    throw new Error(`O pedido mínimo de ${product.name} é de ${minimum} unidade(s).`);
  }

  const stock = product.stock ?? 0;
  if (stock > 0 && input.qty > stock) {
    throw new Error(`Há somente ${stock} unidade(s) disponíveis de ${product.name}.`);
  }
  if (stock <= 0 && !product.personalizable) {
    throw new Error(`Produto indisponível no momento: ${product.name}.`);
  }

  const basePrice = priceInCents(product.price, product.name);
  const promoPrice = product.promo_price == null
    ? null
    : priceInCents(product.promo_price, product.name);
  if (promoPrice !== null && promoPrice > basePrice) {
    throw new Error(`O preço promocional de ${product.name} está inconsistente.`);
  }
  const unitPriceCents = promoPrice !== null && promoPrice < basePrice
    ? promoPrice
    : basePrice;
  const expectedPriceCents = priceInCents(input.expectedUnitPrice, product.name);
  if (expectedPriceCents !== unitPriceCents) {
    throw new Error(`O preço de ${product.name} foi atualizado. Revise o carrinho antes de continuar.`);
  }

  const options = submittedOptionsSchema.parse(input.options ?? {});
  const fields = parsePersonalization(product.personalization);
  if (!product.personalizable && fields.length > 0) {
    throw new Error(`A configuração de personalização de ${product.name} está inconsistente.`);
  }

  const allowedKeys = new Set(["Cor", "Tamanho", "Acabamento"]);
  for (const field of fields) {
    allowedKeys.add(field.label);
    allowedKeys.add(field.key);
  }
  for (const key of Object.keys(options)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`A opção "${key}" não é permitida para ${product.name}.`);
    }
  }

  const normalized: Record<string, string> = {};
  const variations = [
    { label: "Cor", values: product.colors },
    { label: "Tamanho", values: product.sizes },
    { label: "Acabamento", values: product.finishes },
  ];

  for (const variation of variations) {
    const value = (options[variation.label] ?? "").trim();
    if (variation.values.length === 0) {
      if (value) {
        throw new Error(`${variation.label} não está disponível para ${product.name}.`);
      }
      continue;
    }
    if (!value || !variation.values.includes(value)) {
      throw new Error(`Selecione uma opção válida de ${variation.label.toLowerCase()} para ${product.name}.`);
    }
    normalized[variation.label] = value;
  }

  for (const field of fields) {
    const byLabel = options[field.label];
    const byKey = options[field.key];
    if (byLabel !== undefined && byKey !== undefined && byLabel.trim() !== byKey.trim()) {
      throw new Error(`O campo ${field.label} foi enviado com valores conflitantes.`);
    }
    const value = (byLabel ?? byKey ?? "").trim();
    if (!value) {
      if (field.required) throw new Error(`Preencha o campo obrigatório: ${field.label}.`);
      continue;
    }

    if (field.type === "text" && value.length > field.maxLength) {
      throw new Error(`${field.label} aceita no máximo ${field.maxLength} caracteres.`);
    }
    if (field.type === "choice" && !field.options.includes(value)) {
      throw new Error(`Escolha uma opção válida em ${field.label}.`);
    }
    if (field.type === "notes" && value.length > 400) {
      throw new Error(`${field.label} aceita no máximo 400 caracteres.`);
    }
    normalized[field.label] = value;
  }

  return {
    slug: product.slug,
    name: product.name,
    qty: input.qty,
    unit_price: unitPriceCents / 100,
    options: normalized,
  };
}

export function validateCouponRecord(
  coupon: { code: string; percent: number; active: boolean } | null,
  submittedCode: string,
) {
  if (!coupon || !coupon.active || coupon.code.toUpperCase() !== submittedCode.trim().toUpperCase()) {
    throw new Error("Cupom inválido ou inativo.");
  }
  if (!Number.isInteger(coupon.percent) || coupon.percent < 1 || coupon.percent > 90) {
    throw new Error("O desconto deste cupom está configurado incorretamente.");
  }
  return { code: coupon.code, percent: coupon.percent };
}

export function calculateCheckoutTotals(
  items: Pick<ValidatedOrderItem, "qty" | "unit_price">[],
  couponPercent = 0,
  shipping = 0,
) {
  if (!Number.isInteger(couponPercent) || couponPercent < 0 || couponPercent > 90) {
    throw new Error("Percentual de desconto inválido.");
  }
  const subtotalCents = items.reduce(
    (sum, item) => sum + Math.round(item.unit_price * 100) * item.qty,
    0,
  );
  const shippingCents = Math.round(shipping * 100);
  const discountCents = Math.round(subtotalCents * couponPercent / 100);
  return {
    subtotal: subtotalCents / 100,
    shipping: shippingCents / 100,
    discount: discountCents / 100,
    total: (subtotalCents - discountCents + shippingCents) / 100,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export type CheckoutIntent = {
  customer: { name: string; email: string; phone: string };
  address: Record<string, string>;
  items: CheckoutLineInput[];
  couponCode?: string;
  customerNotes: string;
  acceptedPrivacy: true;
};

export type ExistingOrder = {
  id: string;
  store_key: string;
  source: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address: unknown;
  items: unknown;
  coupon_code: string | null;
  customer_notes: string;
  accepted_privacy: boolean;
  total: number | string;
  status: string;
};

export function orderMatchesIntent(order: ExistingOrder, input: CheckoutIntent) {
  if (order.store_key !== "papelemi" || order.source !== "storefront") return false;
  if (order.customer_name !== input.customer.name.trim()) return false;
  if (order.customer_email.toLowerCase() !== input.customer.email.trim().toLowerCase()) return false;
  if (order.customer_phone !== input.customer.phone.trim()) return false;
  if (order.customer_notes !== input.customerNotes.trim()) return false;
  if (order.accepted_privacy !== true || input.acceptedPrivacy !== true) return false;
  if ((order.coupon_code ?? "").toUpperCase() !== (input.couponCode ?? "").trim().toUpperCase()) return false;
  if (canonicalJson(order.address) !== canonicalJson(input.address)) return false;

  if (!Array.isArray(order.items) || order.items.length !== input.items.length) return false;
  const storedItems = order.items.map((item) => {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (typeof record.slug !== "string" || typeof record.qty !== "number") return null;
    if (!record.options || typeof record.options !== "object" || Array.isArray(record.options)) return null;
    return {
      slug: record.slug,
      qty: record.qty,
      options: normalizedOptions(record.options as Record<string, string>),
    };
  });
  const requestedItems = input.items.map((item) => ({
    slug: item.slug,
    qty: item.qty,
    options: normalizedOptions(item.options),
  }));
  return canonicalJson(storedItems) === canonicalJson(requestedItems);
}

export async function persistOrderIdempotently<T>(args: {
  findExisting: () => Promise<T | null>;
  insert: () => Promise<{ data: T | null; error: { code?: string; message?: string } | null }>;
  matches: (existing: T) => boolean;
}) {
  const assertSameIntent = (existing: T) => {
    if (!args.matches(existing)) {
      throw new Error("Esta tentativa de encomenda já foi utilizada com outros dados. Revise o carrinho e tente novamente.");
    }
    return existing;
  };

  const existing = await args.findExisting();
  if (existing) return assertSameIntent(existing);

  let insertError: unknown;
  try {
    const result = await args.insert();
    if (result.data && !result.error) return result.data;
    insertError = result.error ?? new Error("Não foi possível persistir a encomenda.");
  } catch (error) {
    insertError = error;
  }

  const recovered = await args.findExisting();
  if (recovered) return assertSameIntent(recovered);
  if (insertError instanceof Error) throw insertError;
  throw new Error("Não foi possível confirmar a gravação da encomenda. Tente novamente com os mesmos dados.");
}
