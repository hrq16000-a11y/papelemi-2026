export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  longDescription?: string;
  price: string;
  /** Numeric price (BRL) used for Schema.org microdata. Optional for back-compat. */
  priceValue?: number;
  originalPrice?: string;
  image: string;
  images?: string[];
  link: string;
  badge?: string;
  rating: number;
  category: string;
  occasions: string[];
  keywords: string[];
  min_quantity?: number;
  production_days?: number | null;
  production_speed?: 'rapido' | 'normal' | 'longo' | null;
  personalization_enabled?: boolean | null;
  featured_weight?: number | null;
}


import { categories as papeCategories, products as papeProducts } from "@/data/catalog";

export const products: Product[] = papeProducts.map((product) => ({
  id: product.slug, slug: product.slug, name: product.name, description: product.description,
  price: Number(product.price).toFixed(2), priceValue: Number(product.price),
  originalPrice: product.promoPrice == null ? undefined : Number(product.promoPrice).toFixed(2),
  image: product.images[0] ?? "", images: product.images, link: "/produto/" + product.slug,
  badge: product.bestSeller ? "Destaque" : undefined, rating: 0, category: product.category,
  occasions: [], keywords: [], min_quantity: product.minQty, production_days: null,
  production_speed: null, personalization_enabled: product.personalizable, featured_weight: product.bestSeller ? 1 : 0,
}));
export const categories = papeCategories.map((category) => ({ id: category.slug, name: category.name, icon: "✦" }));
export const occasions: { id: string; name: string; icon: string }[] = [];
export const states = ["Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"];
export const getProductBySlug = (slug: string): Product | undefined => products.find((product) => product.slug === slug);