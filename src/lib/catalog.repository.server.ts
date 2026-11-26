import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  getCategory as getFallbackCategory,
  getProduct as getFallbackProduct,
  type Category,
  type Product,
} from "@/data/catalog";
import type { Database } from "@/integrations/supabase/types";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

const personalizationOptionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    key: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
    maxLength: z.number().int().min(1).max(400),
    ai: z.boolean().optional().default(false),
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

const personalizationSchema = z.array(personalizationOptionSchema).max(20);

export function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Banco de dados não configurado");

  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const categoryFromRow = (row: CategoryRow): Category => ({
  slug: row.slug,
  name: row.name,
  description: row.description,
  image: row.image,
});

export const productFromRow = (row: ProductRow): Product => ({
  slug: row.slug,
  name: row.name,
  category: row.category_slug,
  description: row.description,
  images: row.images,
  price: Number(row.price),
  ...(row.promo_price == null ? {} : { promoPrice: Number(row.promo_price) }),
  colors: row.colors,
  sizes: row.sizes,
  finishes: row.finishes,
  productionDays: row.production_days,
  stock: row.stock,
  published: row.published,
  bestSeller: row.best_seller,
  personalizable: row.personalizable,
  personalization: personalizationSchema.parse(row.personalization ?? []) as Product["personalization"],
  ...(row.min_qty == null ? {} : { minQty: row.min_qty }),
});

export async function getCatalogFromDatabase() {
  const sb = publicClient();
  const [categoryResult, productResult] = await Promise.all([
    sb.from("categories").select("*").filter("store_key", "eq", "papelemi").order("sort"),
    sb.from("products").select("*").filter("store_key", "eq", "papelemi").order("name"),
  ]);
  const { data: categoryRows, error: categoryError } = categoryResult;
  const { data: productRows, error: productError } = productResult;

  if (categoryError || productError) {
    throw new Error(categoryError?.message ?? productError?.message ?? "Falha ao carregar catálogo");
  }

  return {
    categories: (categoryRows ?? []).map(categoryFromRow),
    products: (productRows ?? []).map(productFromRow),
  };
}

export async function getPublishedProductFromDatabase(slug: string): Promise<Product | null> {
  const { data, error } = await publicClient()
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .filter("store_key", "eq", "papelemi")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? productFromRow(data) : null;
}

export async function getPublishedCategoryFromDatabase(slug: string): Promise<Category | null> {
  const { data, error } = await publicClient()
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .filter("store_key", "eq", "papelemi")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? categoryFromRow(data) : null;
}

// Keep the storefront usable during a temporary database outage, but never revive a
// product/category that the live database successfully reports as unpublished or missing.
export async function getPublishedProductWithFallback(slug: string): Promise<Product | null> {
  try {
    return await getPublishedProductFromDatabase(slug);
  } catch (error) {
    console.error(
      "PapeLemi product lookup failed; using local fallback:",
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
      "PapeLemi category lookup failed; using local fallback:",
      error instanceof Error ? error.message : "unknown catalog error",
    );
    return getFallbackCategory(slug) ?? null;
  }
}
