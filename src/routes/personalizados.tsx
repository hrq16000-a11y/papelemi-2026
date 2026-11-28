import { publicSocialMeta } from "@/lib/social-preview";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCatalog } from "@/lib/catalog-store";
import { useCart } from "@/lib/cart";
import { ProductGrid } from "@/components/store/ProductCard";
import { aiField, PhraseGenerator } from "@/components/store/PhraseGenerator";

export const Route = createFileRoute("/personalizados")({
  head: () => ({ meta: [
    { title: "Personalizados e gerador de dedicatórias — PapeLemi" }, { name: "description", content: "Crie frases e dedicatórias com afeto em 7 etapas e aplique no seu produto personalizado PapeLemi." },
    { property: "og:title", content: "Personalizados — PapeLemi" }, { property: "og:description", content: "Gerador de dedicatórias com IA para produtos personalizados." },
      ...publicSocialMeta("Personalizados — PapeLemi", "Gerador de dedicatórias com IA para produtos personalizados."),
  ] }),
  component: Personalizados,
});

function Personalizados() {
  const navigate = useNavigate();
  const { add } = useCart();
  const { publishedProducts } = useCatalog();
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-primary">Feito sob medida</p>
      <h1 className="mt-2 max-w-3xl text-5xl md:text-6xl">Palavras certas para quem você ama</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">Escolha o produto, a ocasião e o estilo. <span className="inline-flex items-center gap-1 text-primary"><Sparkles className="size-4" />Nossa assistente</span> cria três dedicatórias para você editar, escolher e aplicar.</p>
      <section className="mt-10 rounded-[2rem] border border-border bg-card p-5 shadow-soft md:p-10">
        <PhraseGenerator onApply={(p, text, toCart) => {
          const f = aiField(p);
          if (toCart && f) {
            add({ slug: p.slug, qty: p.minQty ?? 1, options: { Cor: p.colors[0] ?? "", Tamanho: p.sizes[0] ?? "", Acabamento: p.finishes[0] ?? "", [f.label]: text } });
            toast.success("Adicionado ao carrinho com sua dedicatória");
            navigate({ to: "/carrinho" });
          } else navigate({ to: "/produto/$slug", params: { slug: p.slug }, search: { frase: text } });
        }} />
      </section>
      <h2 className="mt-20 text-4xl">Todos os personalizáveis</h2>
      <div className="mt-8"><ProductGrid items={publishedProducts.filter((p) => p.personalizable)} /></div>
    </div>
  );
}
