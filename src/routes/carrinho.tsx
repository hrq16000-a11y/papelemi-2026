import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { brl, finalPrice, getProduct } from "@/data/catalog";
import { useCart } from "@/lib/cart";
import { aiField } from "@/components/store/PhraseGenerator";

export const Route = createFileRoute("/carrinho")({
  head: () => ({ meta: [
    { title: "Carrinho — PapeLemi" }, { name: "description", content: "Revise seus produtos personalizados PapeLemi." },
    { property: "og:title", content: "Carrinho — PapeLemi" }, { property: "og:description", content: "Seu carrinho PapeLemi." }, { name: "robots", content: "noindex" },
  ] }),
  component: Cart,
});

function Cart() {
  const { items, setQty, remove } = useCart();
  const rows = items.flatMap((i) => { const p = getProduct(i.slug); return p ? [{ i, p }] : []; });
  const subtotal = rows.reduce((s, { i, p }) => s + finalPrice(p) * i.qty, 0);
  if (!rows.length) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-5xl">Seu carrinho está vazio</h1><p className="mt-3 text-muted-foreground">Que tal escolher algo especial?</p><Link to="/loja" className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm text-primary-foreground">Ir para a loja</Link></div>
  );
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1fr_340px] md:px-8">
      <div>
        <h1 className="text-5xl">Carrinho</h1>
        <ul className="mt-8 divide-y divide-border">
          {rows.map(({ i, p }) => (
            <li key={i.id} className="flex gap-4 py-6">
              <img src={p.images[0]} alt={p.name} className="size-24 shrink-0 rounded-xl object-cover md:size-28" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2"><Link to="/produto/$slug" params={{ slug: p.slug }} search={{ frase: i.options[aiField(p)?.label ?? ""] || undefined }} className="font-display text-xl hover:text-primary">{p.name}</Link><p className="whitespace-nowrap">{brl(finalPrice(p) * i.qty)}</p></div>
                <dl className="mt-1 space-y-0.5 text-xs text-muted-foreground">{Object.entries(i.options).filter(([, v]) => v).map(([k, v]) => <div key={k} className="break-words"><dt className="inline font-medium">{k}:</dt> <dd className="inline">{v}</dd></div>)}</dl>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center rounded-full border border-border text-sm">
                    <button aria-label="Diminuir" onClick={() => setQty(i.id, Math.max(p.minQty ?? 1, i.qty - 1))} className="p-2"><Minus className="size-3" /></button><span className="w-8 text-center">{i.qty}</span><button aria-label="Aumentar" onClick={() => setQty(i.id, i.qty + 1)} className="p-2"><Plus className="size-3" /></button>
                  </div>
                  <button aria-label="Remover" onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <aside className="h-fit rounded-[1.5rem] bg-cream p-6 md:sticky md:top-36">
        <h2 className="text-2xl">Resumo</h2>
        <div className="mt-4 flex justify-between text-sm"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
        <div className="mt-2 flex justify-between text-sm text-muted-foreground"><span>Frete</span><span>Calculado no checkout</span></div>
        <input placeholder="Cupom de desconto" aria-label="Cupom" className="mt-4 w-full rounded-full border border-input bg-card px-4 py-2.5 text-base md:text-sm" />
        <div className="mt-4 flex justify-between border-t border-border pt-4 text-lg"><span>Total</span><span>{brl(subtotal)}</span></div>
        <button disabled className="mt-5 w-full rounded-full bg-primary py-3.5 text-sm text-primary-foreground opacity-60">Finalizar compra (em breve)</button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Pagamentos serão ativados na próxima etapa.</p>
      </aside>
    </div>
  );
}
