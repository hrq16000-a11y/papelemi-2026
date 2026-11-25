import { Link } from "@tanstack/react-router";
import { brl, getCategory, type Product } from "@/data/catalog";

export function ProductCard({ p }: { p: Product }) {
  return (
    <Link to="/produto/$slug" params={{ slug: p.slug }} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
        <img src={p.images[0]} alt={p.name} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
        {p.promoPrice && <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">Oferta</span>}
        {p.personalizable && <span className="absolute bottom-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs">Personalizável</span>}
      </div>
      <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">{getCategory(p.category)?.name}</p>
      <h3 className="mt-1 text-xl leading-tight transition-colors group-hover:text-primary">{p.name}</h3>
      <p className="mt-1 text-xs text-muted-foreground">Produção: {p.productionDays}</p>
      <p className="mt-1.5 text-sm">
        {p.promoPrice ? <><span className="mr-2 text-muted-foreground line-through">{brl(p.price)}</span><span className="font-medium text-primary">{brl(p.promoPrice)}</span></> : <span className="font-medium">{brl(p.price)}</span>}
        {p.minQty && <span className="text-muted-foreground"> /un · mín. {p.minQty}</span>}
      </p>
    </Link>
  );
}

export function ProductGrid({ items }: { items: Product[] }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">{items.map((p) => <ProductCard key={p.slug} p={p} />)}</div>;
}
