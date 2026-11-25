import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCategory, publishedProducts } from "@/data/catalog";
import { ProductGrid } from "@/components/store/ProductCard";

export const Route = createFileRoute("/categoria/$slug")({
  loader: ({ params }) => { const c = getCategory(params.slug); if (!c) throw notFound(); return c; },
  head: ({ loaderData }) => ({ meta: loaderData ? [
    { title: `${loaderData.name} — PapeLemi` }, { name: "description", content: loaderData.description },
    { property: "og:title", content: `${loaderData.name} — PapeLemi` }, { property: "og:description", content: loaderData.description },
    { property: "og:image", content: loaderData.image }, { name: "twitter:image", content: loaderData.image },
  ] : [{ title: "Categoria — PapeLemi" }, { name: "robots", content: "noindex" }] }),
  component: CategoryPage,
});

function CategoryPage() {
  const c = Route.useLoaderData();
  return (
    <div>
      <div className="relative h-64 md:h-80"><img src={c.image} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-foreground/60 to-transparent"><div className="mx-auto w-full max-w-7xl px-4 pb-8 text-background md:px-8"><h1 className="text-5xl md:text-6xl">{c.name}</h1><p className="mt-2">{c.description}</p></div></div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8"><ProductGrid items={publishedProducts.filter((p) => p.category === c.slug)} /></div>
    </div>
  );
}
