import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Clock, Minus, Plus, Sparkles } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { brl, type Product } from "@/data/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { useCart } from "@/lib/cart";
import { aiField } from "@/lib/product-personalization";
import { getCatalogProduct } from "@/lib/shop.functions";
const PhraseGenerator = lazy(() => import("@/components/store/PhraseGenerator").then((m) => ({ default: m.PhraseGenerator })));
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProductGrid } from "@/components/store/ProductCard";

export const Route = createFileRoute("/produto/$slug")({
  validateSearch: (s: Record<string, unknown>): { frase?: string | undefined } => ({ frase: typeof s["frase"] === "string" ? s["frase"].slice(0, 400) : undefined }),
  loader: ({ params }) => getCatalogProduct({ data: { slug: params.slug } }),
  head: ({ loaderData: p }) => ({
    meta: p ? [
      { title: `${p.name} — PapeLemi` }, { name: "description", content: p.description },
      { property: "og:title", content: `${p.name} — PapeLemi` }, { property: "og:description", content: p.description },
      { property: "og:type", content: "product" }, { property: "og:image", content: p.images[0] ?? "" }, { name: "twitter:image", content: p.images[0] ?? "" },
    ] : [{ title: "Produto indisponível — PapeLemi" }, { name: "robots", content: "noindex" }],
    scripts: p ? [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description, image: p.images, offers: { "@type": "Offer", priceCurrency: "BRL", price: p.promoPrice ?? p.price } }) }] : [],
  }),
  component: ProductPage,
});

function ProductPage() {
  const loaderP = Route.useLoaderData();
  const p = loaderP;
  if (!p) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-4xl">Produto não encontrado</h1>
      <Link to="/loja" className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm text-primary-foreground">Ver toda a loja</Link>
    </div>
  );
  return <ProductDetail p={p} />;
}

function ProductDetail({ p }: { p: Product }) {
  const { getCategory, publishedProducts } = useCatalog();
  const { add } = useCart();
  const navigate = useNavigate();
  const [image, setImage] = useState(0);
  const [color, setColor] = useState(p.colors[0] ?? "");
  const [size, setSize] = useState(p.sizes[0] ?? "");
  const [finish, setFinish] = useState(p.finishes[0] ?? "");
  const [qty, setQty] = useState(p.minQty ?? 1);
  const { frase } = Route.useSearch();
  const ai = aiField(p);
  const [opts, setOpts] = useState<Record<string, string>>(() => (ai && frase ? { [ai.key]: frase.slice(0, ai.maxLength) } : {}));
  const [genOpen, setGenOpen] = useState(false);
  const set = (k: string, v: string) => setOpts((o) => ({ ...o, [k]: v }));
  const field = "w-full rounded-xl border border-input bg-card px-4 py-3 text-base md:text-sm outline-none focus:border-ring";
  const Pills = ({ label, list, value, onChange }: { label: string; list: string[]; value: string; onChange: (v: string) => void }) => list.length > 1 ? (
    <div><p className="text-sm font-medium">{label}: <span className="font-normal text-muted-foreground">{value}</span></p>
      <div className="mt-2 flex flex-wrap gap-2">{list.map((v) => <button key={v} type="button" onClick={() => onChange(v)} className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${v === value ? "border-primary bg-secondary text-secondary-foreground" : "border-border hover:border-primary"}`}>{v}</button>)}</div></div>
  ) : null;

  const addToCart = (current: Record<string, string>) => {
    const options: Record<string, string> = { Cor: color, Tamanho: size, Acabamento: finish };
    p.personalization.forEach((o) => { const v = current[o.key]; if (v) options[o.label] = v; });
    add({ slug: p.slug, qty, options });
    toast.success("Adicionado ao carrinho", { action: { label: "Ver carrinho", onClick: () => navigate({ to: "/carrinho" }) } });
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); addToCart(opts); };

  const cat = getCategory(p.category);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <nav className="mb-6 text-xs text-muted-foreground"><Link to="/loja" className="hover:text-primary">Loja</Link> / {cat && <Link to="/categoria/$slug" params={{ slug: cat.slug }} className="hover:text-primary">{cat.name}</Link>}</nav>
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <div className="md:sticky md:top-36 md:self-start">
          <img src={p.images[image]} alt={p.name} className="aspect-[4/5] w-full rounded-[2rem] object-cover" />
          {p.images.length > 1 && <div className="mt-3 flex gap-3">{p.images.map((src, i) => <button key={src} onClick={() => setImage(i)} aria-label={`Foto ${i + 1}`} className={`size-20 overflow-hidden rounded-xl border-2 ${i === image ? "border-primary" : "border-transparent"}`}><img src={src} alt="" className="size-full object-cover" /></button>)}</div>}
        </div>
        <form onSubmit={submit} className="space-y-6">
          <div>
            <h1 className="text-4xl leading-tight md:text-5xl">{p.name}</h1>
            <p className="mt-3 text-2xl">{p.promoPrice ? <><span className="mr-3 text-lg text-muted-foreground line-through">{brl(p.price)}</span><span className="text-primary">{brl(p.promoPrice)}</span></> : brl(p.price)}{p.minQty && <span className="text-sm text-muted-foreground"> por unidade</span>}</p>
            <p className="mt-1 text-xs text-muted-foreground">Preço de referência. Disponibilidade e condições serão confirmadas pela PapeLemi.</p>
            <p className="mt-4 text-muted-foreground">{p.description}</p>
            <p className="mt-3 flex items-center gap-2 text-sm"><Clock className="size-4 text-primary" /> Produção: {p.productionDays}</p>
          </div>
          <Pills label="Cor" list={p.colors} value={color} onChange={setColor} />
          <Pills label="Tamanho" list={p.sizes} value={size} onChange={setSize} />
          <Pills label="Acabamento" list={p.finishes} value={finish} onChange={setFinish} />
          {p.personalizable && (
            <div className="space-y-4 rounded-[1.5rem] bg-cream p-5 md:p-6">
              <h2 className="text-2xl">Personalize com afeto</h2>
              {p.personalization.map((o) => (
                <div key={o.key}>
                  <label htmlFor={o.key} className="mb-1.5 block text-sm font-medium">{o.label}</label>
                  {o.type === "choice" ? (
                    <select id={o.key} required={o.required ?? false} value={opts[o.key] ?? ""} onChange={(e) => set(o.key, e.target.value)} className={field}><option value="">Escolha…</option>{o.options.map((v) => <option key={v}>{v}</option>)}</select>
                  ) : o.type === "notes" ? (
                    <textarea id={o.key} required={o.required ?? false} rows={2} value={opts[o.key] ?? ""} onChange={(e) => set(o.key, e.target.value)} placeholder="Algo que precisamos saber?" className={field} maxLength={400} />
                  ) : (
                    <>
                      {o.maxLength > 60
                        ? <textarea id={o.key} required={o.required ?? false} rows={3} value={opts[o.key] ?? ""} onChange={(e) => set(o.key, e.target.value)} maxLength={o.maxLength} className={`${field} font-display text-lg italic`} />
                        : <input id={o.key} required={o.required ?? false} value={opts[o.key] ?? ""} onChange={(e) => set(o.key, e.target.value)} maxLength={o.maxLength} className={field} />}
                      <p className="mt-1 text-right text-xs text-muted-foreground">{(opts[o.key] ?? "").length}/{o.maxLength}</p>
                      {o.ai && <button type="button" onClick={() => setGenOpen(true)} className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Sparkles className="size-4" /> Criar dedicatória com a assistente</button>}
                    </>
                  )}
                </div>
              ))}
              {ai && (
                <div aria-live="polite">
                  <p className="mb-2 text-sm font-medium">Prévia da personalização</p>
                  <div className="relative overflow-hidden rounded-2xl">
                    <img src={p.images[image]} alt="" className="aspect-[4/3] w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-foreground/15 p-4">
                      <div className="max-w-[85%] rounded-xl bg-background/90 px-5 py-4 text-center shadow-soft backdrop-blur-sm">
                        {opts["nome"] || opts["name"] ? <p className="text-[11px] uppercase tracking-[0.25em] text-primary">{opts["nome"] || opts["name"]}</p> : null}
                        <p className={`break-words font-display italic leading-snug ${(opts[ai.key] ?? "").length > 90 ? "text-base" : "text-xl"}`}>{opts[ai.key]?.trim() ? `“${opts[ai.key]}”` : <span className="text-muted-foreground">Sua dedicatória aparece aqui</span>}</p>
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Ilustração aproximada; a arte final é ajustada pela nossa equipe.</p>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-full border border-border">
              <button type="button" aria-label="Diminuir" onClick={() => setQty(Math.max(p.minQty ?? 1, qty - 1))} className="p-3"><Minus className="size-4" /></button>
              <span className="w-10 text-center">{qty}</span>
              <button type="button" aria-label="Aumentar" onClick={() => setQty(qty + 1)} className="p-3"><Plus className="size-4" /></button>
            </div>
            <button className="flex-1 rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground shadow-soft transition-transform hover:-translate-y-0.5">Adicionar ao carrinho · {brl((p.promoPrice ?? p.price) * qty)}</button>
          </div>
          {p.minQty && <p className="text-xs text-muted-foreground">Pedido mínimo: {p.minQty} unidades.</p>}
        </form>
      </div>
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-3xl p-5 md:p-8">
          <DialogTitle className="sr-only">Assistente de dedicatórias</DialogTitle>
          <DialogDescription className="sr-only">Crie uma frase personalizada para {p.name}</DialogDescription>
          {genOpen && <Suspense fallback={<p className="py-8 text-center text-sm text-muted-foreground">Preparando o assistente…</p>}><PhraseGenerator fixedProduct={p} onApply={(_, text, toCart) => {
            if (!ai) return;
            const next = { ...opts, [ai.key]: text };
            setOpts(next); setGenOpen(false);
            if (toCart) addToCart(next); else toast.success("Dedicatória inserida no produto");
          }} /></Suspense>}
        </DialogContent>
      </Dialog>
      <section className="mt-24"><h2 className="mb-8 text-4xl">Você também pode gostar</h2><ProductGrid items={publishedProducts.filter((x) => x.category === p.category && x.slug !== p.slug).concat(publishedProducts.filter((x) => x.bestSeller && x.slug !== p.slug)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4)} /></section>
    </div>
  );
}
