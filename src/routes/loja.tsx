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
    { title: "Todos os produtos — PapeLemi" },
    { name: "description", content: "Cadernetas, planners, blocos, mimos e brindes personalizados da PapeLemi." },
    { property: "og:title", content: "Todos os produtos — PapeLemi" },
    { property: "og:description", content: "Papelaria personalizada com afeto." },
  ] }),
  component: Shop,
});

function Shop() {
  const { q, cat, sort } = Route.useSearch();
  const navigate = useNavigate();
  let items = publishedProducts.filter((p) => (!cat || p.category === cat) && (!q || (p.name + " " + p.description).toLowerCase().includes(q.toLowerCase())));
  if (sort) items = [...items].sort((a, b) => (sort === "menor" ? 1 : -1) * (finalPrice(a) - finalPrice(b)));
  const chip = (active: boolean) => "whitespace-nowrap border-b px-3 py-2 text-xs transition-colors " + (active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground");
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8">
      <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Papelaria personalizada com afeto</p>
      <h1 className="mt-2 text-4xl md:text-5xl">{q ? <>Busca: <em className="text-primary">{q}</em></> : "Todos os produtos"}</h1>
      <p className="mt-2 text-xs text-muted-foreground">{items.length} produtos · preços e prazos de referência</p>
      <div className="mt-7 flex flex-wrap items-center gap-3 border-b border-border">
        <div className="-mx-2 flex flex-1 gap-1 overflow-x-auto px-2">
          <Link to="/loja" search={{ q, sort }} className={chip(!cat)}>Todos</Link>
          {categories.map((c) => <Link key={c.slug} to="/loja" search={{ q, sort, cat: c.slug }} className={chip(cat === c.slug)}>{c.name}</Link>)}
        </div>
        <select aria-label="Ordenar" value={sort ?? "relevancia"} onChange={(e) => { const v = e.target.value; navigate({ to: "/loja", search: { q, cat, sort: v === "menor" || v === "maior" ? v : undefined } }); }} className="mb-2 rounded-none border border-border bg-background px-3 py-2 text-xs">
          <option value="relevancia">Relevância</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option>
        </select>
      </div>
      <div className="mt-8">{items.length ? <ProductGrid items={items} /> : <p className="py-20 text-center text-muted-foreground">Nenhum produto encontrado. <Link to="/loja" className="text-primary underline">Ver todos</Link></p>}</div>
      <p className="mt-10 text-[10px] leading-5 text-muted-foreground">A PapeLemi confirma disponibilidade, personalização, prazo, frete e pagamento antes da produção.</p>
    </div>
  );
}
