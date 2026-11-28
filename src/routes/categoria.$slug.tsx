import { publicCanonical, publicSocialMeta } from "@/lib/social-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getCategory } from "@/data/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { ProductGrid } from "@/components/store/ProductCard";

export const Route = createFileRoute("/categoria/$slug")({
  loader: ({ params }) => getCategory(params.slug) ?? null,
  head: ({ loaderData }) => ({ links: loaderData ? [publicCanonical(`/categoria/${encodeURIComponent(loaderData.slug)}`)] : [], meta: loaderData ? [
    { title: `${loaderData.name} — PapeLemi` }, { name: "description", content: loaderData.description },
    { property: "og:title", content: `${loaderData.name} — PapeLemi` }, { property: "og:description", content: loaderData.description },
    ...publicSocialMeta(`/categoria/${encodeURIComponent(loaderData.slug)}`, `${loaderData.name} — PapeLemi`, loaderData.description, loaderData.image),
  ] : [{ title: "Categoria — PapeLemi" }, { name: "robots", content: "noindex" }] }),
  component: CategoryPage,
});

function CategoryPage() {
  const loaderCat = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { getCategory, publishedProducts } = useCatalog();
  const c = getCategory(slug) ?? loaderCat;
  if (!c) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-4xl">Categoria não encontrada</h1>
      <Link to="/loja" className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm text-primary-foreground">Ver toda a loja</Link>
    </div>
  );
  return (
    <div>
      <div className="relative h-64 md:h-80"><img src={c.image} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-foreground/60 to-transparent"><div className="mx-auto w-full max-w-7xl px-4 pb-8 text-background md:px-8"><h1 className="text-5xl md:text-6xl">{c.name}</h1><p className="mt-2">{c.description}</p></div></div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8"><ProductGrid items={publishedProducts.filter((p) => p.category === c.slug)} /></div>
    </div>
  );
}
