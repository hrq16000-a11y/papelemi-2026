import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { categories as fallbackCategories, products as fallbackProducts } from "@/data/catalog";
import type { Database } from "@/integrations/supabase/types";

const SITE = "https://www.papelemi.com.br";

async function catalogSlugs() {
  let categories = fallbackCategories.map((item) => item.slug);
  let products = fallbackProducts.filter((item) => item.published).map((item) => item.slug);

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return { categories, products };

  try {
    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (headers.get("Authorization") === "Bearer " + key) headers.delete("Authorization");
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });
    const [categoryResult, productResult] = await Promise.all([
      supabase.from("categories").select("slug").order("sort"),
      supabase.from("products").select("slug").eq("published", true).order("name"),
    ]);
    if (!categoryResult.error && categoryResult.data?.length) categories = categoryResult.data.map((row) => row.slug);
    if (!productResult.error && productResult.data?.length) products = productResult.data.map((row) => row.slug);
  } catch {
    // A lista local garante sitemap válido se o banco estiver temporariamente indisponível.
  }
  return { categories, products };
}

const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export const Route = createFileRoute("/sitemap.xml" as never)({
  server: {
    handlers: {
      GET: async () => {
        const { categories, products } = await catalogSlugs();
        const fixed = [
          "/",
          "/loja",
          "/sobre",
          "/contato",
          "/kits",
          "/presentes",
          "/personalizados",
          "/politica-de-privacidade",
          "/termos-de-uso",
        ];
        const urls = [
          ...fixed,
          ...categories.map((slug) => "/categoria/" + encodeURIComponent(slug)),
          ...products.map((slug) => "/produto/" + encodeURIComponent(slug)),
        ];
        const entries = urls.map((path) => "  <url><loc>" + escapeXml(SITE + path) + "</loc></url>").join("\n");
        const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries + "\n</urlset>\n";
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
