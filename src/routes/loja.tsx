import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { categories, finalPrice, publishedProducts } from "@/data/catalog";
import { ProductGrid } from "@/components/store/ProductCard";

type S = { q?: string | undefined; cat?: string | undefined; sort?: "menor" | "maior" | undefined };
export const Route = createFileRoute("/loja")({
  validateSearch: (s: Record<string, unknown>): S => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    cat: typeof s["cat"] === "string" ? s["cat"] : undefined,
    sort: s["sort"] === "menor" || s["sort"] === "maior" ? s["sort"] : undefined,
  }),
  head: () => ({ meta: [
    { title: "Loja — PapeLemi" },
    { name: "description", content: "Catálogo completo da PapeLemi: agendas, cadernos, lembranças, kits e brindes corporativos personalizados." },
    { property: "og:title", content: "Loja — PapeLemi" },
    { property: "og:description", content: "Catálogo completo de papelaria afetiva e personalizados." },
  ] }),
  component: Shop,
});

function Shop() {
  const { q, cat, sort } = Route.useSearch();
  const navigate = useNavigate();
  let items = publishedProducts.filter((p) => (!cat || p.category === cat) && (!q || `${p.name} ${p.description}`.toLowerCase().includes(q.toLowerCase())));
  if (sort) items = [...items].sort((a, b) => (sort === "menor" ? 1 : -1) * (finalPrice(a) - finalPrice(b)));
  const chip = (active: boolean) => `whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"}`;
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <h1 className="text-5xl md:text-6xl">{q ? <>Busca: <em className="text-primary">{q}</em></> : "Loja"}</h1>
      <p className="mt-2 text-muted-foreground">{items.length} produtos · catálogo demonstrativo</p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          <Link to="/loja" search={{ q, sort }} className={chip(!cat)}>Todos</Link>
          {categories.map((c) => <Link key={c.slug} to="/loja" search={{ q, sort, cat: c.slug }} className={chip(cat === c.slug)}>{c.name}</Link>)}
        </div>
        <select aria-label="Ordenar" value={sort ?? "relevancia"} onChange={(e) => { const v = e.target.value; navigate({ to: "/loja", search: { q, cat, sort: v === "menor" || v === "maior" ? v : undefined } }); }} className="ml-auto rounded-full border border-border bg-card px-4 py-2 text-sm">
          <option value="relevancia">Relevância</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option>
        </select>
      </div>
      <div className="mt-10">{items.length ? <ProductGrid items={items} /> : <p className="py-20 text-center text-muted-foreground">Nenhum produto encontrado. <Link to="/loja" className="text-primary underline">Ver todos</Link></p>}</div>
    </div>
  );
}
