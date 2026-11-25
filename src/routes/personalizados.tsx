import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { publishedProducts } from "@/data/catalog";
import { ProductGrid } from "@/components/store/ProductCard";

export const Route = createFileRoute("/personalizados")({
  head: () => ({ meta: [
    { title: "Personalizados — PapeLemi" }, { name: "description", content: "Produtos personalizados com nome, frase, cores e estampas, com assistente de dedicatórias." },
    { property: "og:title", content: "Personalizados — PapeLemi" }, { property: "og:description", content: "Personalize com nome, frase e muito afeto." },
  ] }),
  component: () => (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-primary">Feito sob medida</p>
      <h1 className="mt-2 max-w-3xl text-5xl md:text-6xl">Personalizados que contam a sua história</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">Escolha o produto e defina nome, frase, cores, estampa e acabamento. Sem inspiração? <span className="inline-flex items-center gap-1 text-primary"><Sparkles className="size-4" />nossa assistente sugere dedicatórias</span> no tom que você quiser.</p>
      <div className="mt-12"><ProductGrid items={publishedProducts.filter((p) => p.personalizable)} /></div>
    </div>
  ),
});
