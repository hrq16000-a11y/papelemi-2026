import type { PersonalizationOption, Product } from "@/data/catalog";

type AiTextField = Extract<PersonalizationOption, { type: "text" }>;

export function aiField(product: Pick<Product, "personalization">): AiTextField | undefined {
  return product.personalization.find(
    (field): field is AiTextField => field.type === "text" && Boolean(field.ai),
  );
}
