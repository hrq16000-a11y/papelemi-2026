import { personalizationSchema } from "@/lib/catalog-validation";
import {
  getCategory as getFallbackCategory,
  getProduct as getFallbackProduct,
  type Category,
  type Product,
} from "@/data/catalog";
import { engineAdmin } from "@/lib/engine.server";
import type { Database as EngineDatabase } from "@/emp-orio/integrations/supabase/types";
import type { CatalogLifecycleDatabase } from "@/lib/catalog-lifecycle.types";

type EngineProductBase = EngineDatabase["papelemi_engine"]["Tables"]["products"]["Row"];
type LegacyProductRow = CatalogLifecycleDatabase["public"]["Tables"]["products"]["Row"];

// Compatibility mapper for the existing PapeLemi catalog-lifecycle endpoints.
// New storefront and copied Emporio admin reads use productFromEngineRow.
export const productFromRow = (row: LegacyProductRow): Product => {
  const personalizationResult = personalizationSchema.safeParse(row.personalization ?? []);

  if (!personalizationResult.success) {
    console.error("PapeLemi legacy personalization needs adaptation:", row.slug, personalizationResult.error.issues);
  }

  const promoPrice = row.promo_price == null ? null : Number(row.promo_price);

  return {
    slug: row.slug,
    name: row.name,
    category: row.category_slug,
    description: row.description ?? "",
    images: row.images ?? [],
    price: Number(row.price),
    ...(promoPrice !== null && promoPrice < Number(row.price) ? { promoPrice } : {}),
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    finishes: row.finishes ?? [],
    productionDays: row.production_days ?? "",
    stock: Number(row.stock ?? 0),
    published: Boolean(row.published),
    bestSeller: Boolean(row.best_seller),
    personalizable: Boolean(row.personalizable),
    personalization: personalizationResult.success ? personalizationResult.data : [],
    ...(row.min_qty != null && row.min_qty > 1 ? { minQty: row.min_qty } : {}),
    ...(row.weight_kg == null ? {} : { weightKg: Number(row.weight_kg) }),
    ...(row.length_cm == null ? {} : { lengthCm: Number(row.length_cm) }),
    ...(row.width_cm == null ? {} : { widthCm: Number(row.width_cm) }),
    ...(row.height_cm == null ? {} : { heightCm: Number(row.height_cm) }),
    requiresShipping: row.requires_shipping,
  };
};

type EngineCategoryRow = EngineDatabase["papelemi_engine"]["Tables"]["categories"]["Row"];

export type PapeLemiEngineProductRow = EngineProductBase & {
  colors?: string[] | null;
  sizes?: string[] | null;
  finishes?: string[] | null;
  stock?: number | null;
};

export const categoryFromEngineRow = (row: EngineCategoryRow): Category => ({
  slug: row.slug,
  name: row.name,
  description: row.description ?? "",
  image: row.image_url ?? row.image_ref ?? "",
});

export const productFromEngineRow = (row: PapeLemiEngineProductRow, categorySlug: string): Product => {
  const currentPrice = Number(row.price);
  const originalPrice = row.original_price == null ? null : Number(row.original_price);
  const hasPromo = originalPrice !== null && originalPrice > currentPrice;
  const personalizationResult = personalizationSchema.safeParse(row.personalization_options ?? []);

  if (!personalizationResult.success) {
    console.error("PapeLemi personalization options need adaptation:", row.slug, personalizationResult.error.issues);
  }

  return {
    slug: row.slug,
    name: row.name,
    category: categorySlug,
    description: row.description ?? row.long_description ?? "",
    images: row.images ?? row.image_refs ?? [],
    price: hasPromo ? originalPrice : currentPrice,
    ...(hasPromo ? { promoPrice: currentPrice } : {}),
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    finishes: row.finishes ?? [],
    productionDays: row.production_days == null ? "" : String(row.production_days) + " dias úteis",
    stock: Number(row.stock ?? 0),
    published: Boolean(row.is_active),
    bestSeller: Number(row.featured_weight ?? 0) > 0,
    personalizable: Boolean(row.personalization_enabled),
    personalization: personalizationResult.success ? personalizationResult.data : [],
    ...(row.min_quantity != null && row.min_quantity > 1 ? { minQty: row.min_quantity } : {}),
    ...((row.weight_kg ?? row.weight) == null ? {} : { weightKg: Number(row.weight_kg ?? row.weight) }),
    ...(row.length_cm == null ? {} : { lengthCm: Number(row.length_cm) }),
    ...(row.width_cm == null ? {} : { widthCm: Number(row.width_cm) }),
    ...(row.height_cm == null ? {} : { heightCm: Number(row.height_cm) }),
    requiresShipping: row.requires_shipping,
  };
};

export async function getCatalogFromDatabase() {
  const engine = engineAdmin();
  const [{ data: categoryRows, error: categoryError }, { data: productRows, error: productError }] = await Promise.all([
    engine.from("categories").select("*").eq("is_draft", false).eq("is_indexed", true).order("position").order("name"),
    engine.from("products").select("*").eq("is_active", true).order("name"),
  ]);

  if (categoryError || productError) {
    throw new Error(categoryError?.message ?? productError?.message ?? "Falha ao carregar catálogo");
  }

  const categories = (categoryRows ?? []).map(categoryFromEngineRow);
  const categorySlugById = new Map((categoryRows ?? []).map((category) => [category.id, category.slug]));
  const products = ((productRows ?? []) as unknown as PapeLemiEngineProductRow[])
    .flatMap((row) => {
      const categorySlug = row.category_id ? categorySlugById.get(row.category_id) : undefined;
      return categorySlug ? [productFromEngineRow(row, categorySlug)] : [];
    });

  return { categories, products };
}

export async function getPublishedProductFromDatabase(slug: string): Promise<Product | null> {
  const engine = engineAdmin();
  const { data: row, error } = await engine
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row?.category_id) return null;

  const { data: category, error: categoryError } = await engine
    .from("categories")
    .select("*")
    .eq("id", row.category_id)
    .eq("is_draft", false)
    .eq("is_indexed", true)
    .maybeSingle();

  if (categoryError) throw new Error(categoryError.message);
  return category ? productFromEngineRow(row as unknown as PapeLemiEngineProductRow, category.slug) : null;
}

export async function getPublishedCategoryFromDatabase(slug: string): Promise<Category | null> {
  const { data, error } = await engineAdmin()
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .eq("is_draft", false)
    .eq("is_indexed", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? categoryFromEngineRow(data) : null;
}

// A successful database response is authoritative. Local fallback is used only
// during a temporary engine/API outage, never when a product was unpublished.
export async function getPublishedProductWithFallback(slug: string): Promise<Product | null> {
  try {
    return await getPublishedProductFromDatabase(slug);
  } catch (error) {
    console.error(
      "PapeLemi engine product lookup failed; using local fallback:",
      error instanceof Error ? error.message : "unknown catalog error",
    );
    return getFallbackProduct(slug) ?? null;
  }
}

export async function getPublishedCategoryWithFallback(slug: string): Promise<Category | null> {
  try {
    return await getPublishedCategoryFromDatabase(slug);
  } catch (error) {
    console.error(
      "PapeLemi engine category lookup failed; using local fallback:",
      error instanceof Error ? error.message : "unknown catalog error",
    );
    return getFallbackCategory(slug) ?? null;
  }
}
