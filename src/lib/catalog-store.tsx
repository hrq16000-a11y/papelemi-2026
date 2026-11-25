import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { categories as staticCategories, products as staticProducts, type Category, type Product } from "@/data/catalog";
import { getCatalog } from "@/lib/shop.functions";

type CatalogData = { products: Product[]; categories: Category[] };
const fallback: CatalogData = { products: staticProducts, categories: staticCategories };
const CatalogCtx = createContext<CatalogData>(fallback);

// Carrega o catálogo do banco (gerenciado no /admin); se falhar, mantém o catálogo local.
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CatalogData>(fallback);
  useEffect(() => {
    getCatalog()
      .then((d) => setData(d))
      .catch(() => { /* mantém catálogo local */ });
  }, []);
  return <CatalogCtx.Provider value={data}>{children}</CatalogCtx.Provider>;
}

export function useCatalog() {
  const { products, categories } = useContext(CatalogCtx);
  const publishedProducts = products.filter((p) => p.published);
  return {
    products,
    categories,
    publishedProducts,
    getProduct: (slug: string) => publishedProducts.find((p) => p.slug === slug),
    getCategory: (slug: string) => categories.find((c) => c.slug === slug),
  };
}
