import { publicSocialMeta } from "@/lib/social-preview";
import { createFileRoute } from "@tanstack/react-router";
import { useCatalog } from "@/lib/catalog-store";
import { ProductGrid } from "@/components/store/ProductCard";

export const Route = createFileRoute("/kits")({
  head: () => ({ meta: [
    { title: "Kits presenteáveis — PapeLemi" }, { name: "description", content: "Kits de papelaria afetiva prontos para presentear: professoras, bebês, empresas e datas especiais." },
    { property: "og:title", content: "Kits presenteáveis — PapeLemi" }, { property: "og:description", content: "Kits de papelaria personalizados, montados com carinho." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
      ...publicSocialMeta("Kits presenteáveis — PapeLemi", "Kits de papelaria personalizados, montados com carinho."),
  ] }),
  component: function KitsPage() {
    const { publishedProducts } = useCatalog();
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Prontos para presentear</p>
        <h1 className="mt-2 text-5xl md:text-6xl">Kits PapeLemi</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">Combinações pensadas peça por peça, em caixas delicadas e com dedicatória personalizada.</p>
        <div className="mt-10"><ProductGrid items={publishedProducts.filter((p) => p.category === "kits")} /></div>
      </div>
    );
  },
});
