import { z } from "zod";

export const imageReferenceSchema = z.string().trim().min(1).max(400).refine((value) => {
  if (value.startsWith("/")) {
    try {
      const decoded = decodeURIComponent(value);
      return decoded.startsWith("/images/")
        && !decoded.startsWith("//")
        && !decoded.includes("\\")
        && !decoded.split("/").some((part) => part === "." || part === "..");
    } catch {
      return false;
    }
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use uma imagem HTTPS ou um caminho local seguro em /images/.");

const personalizationOptionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
    maxLength: z.number().int().min(1).max(400),
    ai: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("choice"),
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
    options: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
  }),
  z.object({
    type: z.literal("notes"),
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
  }),
]);

export const personalizationSchema = z.array(personalizationOptionSchema).max(20).superRefine((fields, context) => {
  const keys = new Set<string>();
  const labels = new Set<string>();
  const reserved = new Set(["Cor", "Tamanho", "Acabamento"]);

  fields.forEach((field, index) => {
    if (keys.has(field.key) || reserved.has(field.key)) {
      context.addIssue({ code: "custom", path: [index, "key"], message: "A chave do campo precisa ser única e não pode repetir uma variação." });
    }
    if (labels.has(field.label) || reserved.has(field.label)) {
      context.addIssue({ code: "custom", path: [index, "label"], message: "O rótulo precisa ser único e não pode repetir uma variação." });
    }
    keys.add(field.key);
    labels.add(field.label);

    if (field.type === "choice" && new Set(field.options).size !== field.options.length) {
      context.addIssue({ code: "custom", path: [index, "options"], message: "As opções de escolha não podem se repetir." });
    }
  });
});

export const productAdminSchema = z.object({
  originalSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Use letras minúsculas, números e hífens"),
  categorySlug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(600).default(""),
  images: z.array(imageReferenceSchema).max(6).default([]),
  price: z.number().min(0.5).max(99999),
  promoPrice: z.number().min(0.5).max(99999).nullable().default(null),
  colors: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  sizes: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  finishes: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  productionDays: z.string().trim().max(60).default(""),
  stock: z.number().int().min(0).max(99999).default(0),
  published: z.boolean().default(true),
  bestSeller: z.boolean().default(false),
  personalizable: z.boolean().default(false),
  personalization: personalizationSchema.default([]),
  minQty: z.number().int().min(1).max(999).nullable().default(null),
  weightKg: z.number().min(0).max(100).nullable().default(null),
  lengthCm: z.number().positive().max(300).nullable().default(null),
  widthCm: z.number().positive().max(300).nullable().default(null),
  heightCm: z.number().positive().max(300).nullable().default(null),
  requiresShipping: z.boolean().default(true),
}).superRefine((product, context) => {
  if (product.promoPrice !== null && product.promoPrice >= product.price) {
    context.addIssue({ code: "custom", path: ["promoPrice"], message: "O preço promocional precisa ser menor que o preço normal." });
  }
});

export const categoryAdminSchema = z.object({
  originalSlug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Use letras minúsculas, números e hífens"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  image: imageReferenceSchema.or(z.literal("")).default(""),
  sort: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});
