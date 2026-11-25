import { createFileRoute, Link } from "@tanstack/react-router";
import { publishedProducts } from "@/data/catalog";
import { ProductGrid } from "@/components/store/ProductCard";

const groups = [
  { title: "Até R$ 60", items: () => publishedProducts.filter((p) => (p.promoPrice ?? p.price) <= 60) },
  { title: "Para quem acabou de chegar", items: () => publishedProducts.filter((p) => /beb/i.test(p.name)) },
  { title: "Os mais amados", items: () => publishedProducts.filter((p) => p.bestSeller) },
];

export const Route = createFileRoute("/presentes")({
  head: () => ({ meta: [
    { title: "Ideias de presentes — PapeLemi" }, { name: "description", content: "Presentes personalizados com afeto por faixa de preço e ocasião, com dedicatória criada pela nossa assistente." },
    { property: "og:title", content: "Ideias de presentes — PapeLemi" }, { property: "og:description", content: "Presentes personalizados com afeto." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-primary">Guia de presentes</p>
      <h1 className="mt-2 text-5xl md:text-6xl">Presentes que dizem algo</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">Escolha o presente e deixe a dedicatória com a gente. <Link to="/personalizados" className="text-primary underline">Criar dedicatória</Link></p>
      {groups.map((g) => { const items = g.items().slice(0, 4); return items.length ? <section key={g.title} className="mt-14"><h2 className="mb-6 text-3xl">{g.title}</h2><ProductGrid items={items} /></section> : null; })}
    </div>
  ),
});
