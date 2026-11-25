import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { brl, type Product } from "@/data/catalog";
import { useCart } from "@/lib/cart";
import { useCatalog } from "@/lib/catalog-store";

export function ProductCard({ p }: { p: Product }) {
  const { getCategory } = useCatalog();
  const { add } = useCart();
  const addQuickly = () => {
    add({ slug: p.slug, qty: p.minQty ?? 1, options: {} });
    toast.success("Adicionado ao carrinho", { description: "Você pode revisar sua seleção no carrinho." });
  };
  return (
    <article className="group min-w-0">
      <Link to="/produto/$slug" params={{ slug: p.slug }} className="block">
        <div className="relative aspect-square overflow-hidden bg-secondary/50">
          <img src={p.images[0]} alt={p.name} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.035]" />
          <span className="absolute left-2 top-2 bg-background/90 px-2 py-1 text-[8px] uppercase tracking-[0.12em] text-foreground md:left-3 md:top-3 md:text-[9px]">Feito sob encomenda</span>
        </div>
      </Link>
      <div className="pt-3">
        <p className="text-[9px] uppercase tracking-[0.16em] text-primary">{getCategory(p.category)?.name}</p>
        <Link to="/produto/$slug" params={{ slug: p.slug }} className="block">
          <h3 className="mt-1 min-h-10 font-sans text-[12px] font-medium leading-[1.45] text-foreground transition-colors group-hover:text-primary md:text-[13px]">{p.name}</h3>
        </Link>
        <p className="mt-1 text-[13px] font-semibold text-foreground">{brl(p.promoPrice ?? p.price)}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">Produção: {p.productionDays}*</p>
        <button type="button" onClick={addQuickly} className="mt-3 inline-flex items-center gap-1 border-b border-primary/60 pb-1 text-[10px] text-primary transition-colors hover:border-primary hover:text-foreground">
          Adicionar ao carrinho <Plus className="size-3" />
        </button>
      </div>
    </article>
  );
}

export function ProductGrid({ items }: { items: Product[] }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">{items.map((p) => <ProductCard key={p.slug} p={p} />)}</div>;
}
