import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus, Trash2 } from "lucide-react";
import { brl, finalPrice } from "@/data/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { useCart } from "@/lib/cart";
import { aiField } from "@/lib/product-personalization";

export const Route = createFileRoute("/carrinho")({
  head: () => ({ meta: [
    { title: "Carrinho — PapeLemi" },
    { name: "description", content: "Revise seus produtos personalizados antes de solicitar sua encomenda." },
    { property: "og:title", content: "Carrinho — PapeLemi" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Cart,
});

function Cart() {
  const { items, setQty, remove } = useCart();
  const { getProduct } = useCatalog();
  const rows = items.flatMap((i) => { const p = getProduct(i.slug); return p ? [{ i, p }] : []; });
  const subtotal = rows.reduce((s, { i, p }) => s + finalPrice(p) * i.qty, 0);

  if (!rows.length) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-[10px] uppercase tracking-[0.2em] text-primary">PapeLemi</p>
      <h1 className="mt-3 font-display text-4xl md:text-5xl">Seu carrinho está vazio</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Escolha uma peça, personalize os detalhes e guarde uma ideia bonita para o seu momento.</p>
      <Link to="/loja" className="mt-8 inline-flex items-center gap-2 bg-foreground px-6 py-3 text-xs text-background transition-colors hover:bg-primary">Explorar produtos <ArrowRight className="size-3" /></Link>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1fr_340px] md:px-8">
      <div>
        <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Suas escolhas</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">Carrinho</h1>
        <p className="mt-2 text-xs text-muted-foreground">Confira os produtos e detalhes antes de solicitar sua encomenda.</p>
        <ul className="mt-8 divide-y divide-border border-y border-border">
          {rows.map(({ i, p }) => (
            <li key={i.id} className="flex gap-4 py-6">
              <Link to="/produto/$slug" params={{ slug: p.slug }} className="size-24 shrink-0 overflow-hidden bg-secondary md:size-28"><img src={p.images[0]} alt={p.name} className="size-full object-cover" /></Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <Link to="/produto/$slug" params={{ slug: p.slug }} search={{ frase: i.options[aiField(p)?.label ?? ""] || undefined }} className="font-display text-xl hover:text-primary">{p.name}</Link>
                  <p className="whitespace-nowrap text-sm font-medium">{brl(finalPrice(p) * i.qty)}</p>
                </div>
                <dl className="mt-2 space-y-1 text-xs text-muted-foreground">{Object.entries(i.options).filter(([, v]) => v).map(([k, v]) => <div key={k} className="break-words"><dt className="inline font-medium">{k}:</dt> <dd className="inline">{v}</dd></div>)}</dl>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center border border-border text-sm">
                    <button type="button" aria-label="Diminuir quantidade" onClick={() => setQty(i.id, Math.max(p.minQty ?? 1, i.qty - 1))} className="p-2"><Minus className="size-3" /></button>
                    <span className="w-8 text-center tabular-nums">{i.qty}</span>
                    <button type="button" aria-label="Aumentar quantidade" onClick={() => setQty(i.id, i.qty + 1)} className="p-2"><Plus className="size-3" /></button>
                  </div>
                  <button type="button" aria-label={"Remover " + p.name} onClick={() => remove(i.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /> Remover</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Link to="/loja" className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"><ArrowRight className="size-3 rotate-180" /> Continuar escolhendo</Link>
      </div>
      <aside className="h-fit border border-border bg-cream p-6 md:sticky md:top-32">
        <h2 className="font-display text-2xl">Resumo da encomenda</h2>
        <div className="mt-5 flex justify-between text-sm"><span>Subtotal de referência</span><span className="font-medium">{brl(subtotal)}</span></div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Frete</span><span>Confirmado depois</span></div>
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-[10px] leading-5 text-muted-foreground">Os valores são referências. A PapeLemi confirmará disponibilidade, personalização, prazo, frete e pagamento antes da produção.</p>
          <p className="mt-3 text-[10px] leading-5 text-muted-foreground">Nenhuma cobrança é feita nesta etapa.</p>
        </div>
        <Link to="/checkout" className="mt-6 flex w-full items-center justify-center gap-2 bg-foreground px-4 py-3.5 text-xs font-medium text-background transition-colors hover:bg-primary">Solicitar encomenda <ArrowRight className="size-3" /></Link>
      </aside>
    </div>
  );
}
