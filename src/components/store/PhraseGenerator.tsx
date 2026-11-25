import { useServerFn } from "@tanstack/react-start";
import * as Icons from "lucide-react";
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, RefreshCw, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { getAiProfile, LENGTH_OPTIONS, OCCASIONS, STYLES, type StyleId } from "@/data/ai-config";
import { publishedProducts, type Product } from "@/data/catalog";
import { suggestPhrases } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const aiField = (p: Product) => p.personalization.find((o) => o.type === "text" && o.ai) as Extract<Product["personalization"][number], { type: "text" }> | undefined;
const STEP_NAMES = ["Produto", "Ocasião", "Estilo", "Detalhes", "Gerar", "Editar", "Aplicar"];
type Suggestion = { id: number; text: string; fav: boolean };

export function PhraseGenerator({ fixedProduct, onApply }: { fixedProduct?: Product; onApply: (p: Product, text: string, addToCart: boolean) => void }) {
  const run = useServerFn(suggestPhrases);
  const products = publishedProducts.filter((p) => aiField(p));
  const [product, setProduct] = useState<Product | undefined>(fixedProduct);
  const [step, setStep] = useState(fixedProduct ? 2 : 1);
  const [occasion, setOccasion] = useState("");
  const [customOccasion, setCustomOccasion] = useState("");
  const [style, setStyle] = useState<StyleId | "">(fixedProduct ? getAiProfile(fixedProduct).defaultStyle : "");
  const [d, setD] = useState({ recipientName: "", giverName: "", relation: "", feeling: "" });
  const field = product ? aiField(product) : undefined;
  const fieldMax = field?.maxLength ?? 140;
  const [maxLength, setMaxLength] = useState(fieldMax);
  const [list, setList] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const nextId = useRef(1);
  const profile = product ? getAiProfile(product) : undefined;
  const occasionValue = occasion === "custom" ? customOccasion.trim() : occasion;

  const pickProduct = (p: Product) => {
    setProduct(p); setMaxLength(aiField(p)?.maxLength ?? 140); setList([]); setSelected(null);
    const prof = getAiProfile(p); if (!style) setStyle(prof.defaultStyle);
    setStep(2);
  };

  const generate = async () => {
    if (busy.current || !product || !field || !occasionValue || !style) return;
    busy.current = true; setLoading(true); setError(null);
    try {
      const r = await run({ data: { productSlug: product.slug, fieldKey: field.key, occasion: occasionValue, style, maxLength: Math.min(maxLength, fieldMax), ...d } });
      if (r.error) setError(r.error);
      if (r.suggestions.length) {
        const keep = list.filter((s) => s.fav);
        setList([...keep, ...r.suggestions.map((text) => ({ id: nextId.current++, text, fav: false }))]);
        setStep(6);
      }
    } catch {
      setError("Confira os dados informados e tente novamente.");
    } finally { busy.current = false; setLoading(false); }
  };

  const chosen = list.find((s) => s.id === selected);
  const canNext = step === 1 ? !!product : step === 2 ? !!occasionValue : step === 3 ? !!style : step === 6 ? !!chosen?.text.trim() : true;
  const input = "w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus:border-ring md:text-sm";
  const card = (active: boolean) => cn("rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary", active ? "border-primary bg-secondary shadow-soft" : "border-border bg-card");

  return (
    <div className="min-w-0">
      <ol className="mb-6 flex gap-1.5" aria-label="Etapas">
        {STEP_NAMES.map((n, i) => (
          <li key={n} className="flex-1">
            <div className={cn("h-1 rounded-full transition-colors", i + 1 <= step ? "bg-primary" : "bg-border")} />
            <p className={cn("mt-1.5 hidden text-[11px] uppercase tracking-wider sm:block", i + 1 === step ? "text-primary" : "text-muted-foreground")}>{n}</p>
          </li>
        ))}
      </ol>
      <p className="text-xs uppercase tracking-[0.2em] text-primary">Etapa {step} de 7</p>

      {step === 1 && (<>
        <h3 className="mt-1 text-3xl">Escolha o produto</h3>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => (
            <button key={p.slug} type="button" onClick={() => pickProduct(p)} className={card(product?.slug === p.slug)}>
              <img src={p.images[0]} alt="" className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
              <p className="mt-2 font-display text-lg leading-tight">{p.name}</p>
              <p className="text-xs text-muted-foreground">{getAiProfile(p).theme}</p>
            </button>
          ))}
        </div>
      </>)}

      {step === 2 && (<>
        <h3 className="mt-1 text-3xl">Qual é a ocasião?</h3>
        {product && <p className="mt-1 text-sm text-muted-foreground">Para {product.name}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[...OCCASIONS].sort((a, b) => Number(profile?.suggestedOccasions.includes(b.id)) - Number(profile?.suggestedOccasions.includes(a.id))).map((o) => {
            const Icon = Icons[o.icon] as Icons.LucideIcon;
            return (
              <button key={o.id} type="button" onClick={() => setOccasion(o.id)} className={card(occasion === o.id)}>
                <Icon className="size-5 text-primary" />
                <p className="mt-2 font-medium">{o.label}</p>
                <p className="text-xs text-muted-foreground">{o.hint}</p>
                {profile?.suggestedOccasions.includes(o.id) && <span className="mt-1 inline-block text-[10px] uppercase tracking-wider text-primary">Indicado</span>}
              </button>
            );
          })}
          <button type="button" onClick={() => setOccasion("custom")} className={card(occasion === "custom")}>
            <Icons.PenLine className="size-5 text-primary" /><p className="mt-2 font-medium">Outra ocasião</p><p className="text-xs text-muted-foreground">Escreva a sua</p>
          </button>
        </div>
        {occasion === "custom" && <input autoFocus value={customOccasion} onChange={(e) => setCustomOccasion(e.target.value)} maxLength={60} placeholder="Ex.: aposentadoria da minha avó" className={cn(input, "mt-4")} />}
      </>)}

      {step === 3 && (<>
        <h3 className="mt-1 text-3xl">Escolha o estilo</h3>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {STYLES.map((s) => (
            <button key={s.id} type="button" onClick={() => setStyle(s.id)} className={card(style === s.id)}>
              <p className="font-display text-xl">{s.label}</p><p className="text-xs text-muted-foreground">{s.hint}</p>
              {profile?.defaultStyle === s.id && <span className="mt-1 inline-block text-[10px] uppercase tracking-wider text-primary">Sugerido</span>}
            </button>
          ))}
        </div>
      </>)}

      {step === 4 && (<>
        <h3 className="mt-1 text-3xl">Conte um pouco mais</h3>
        <p className="mt-1 text-sm text-muted-foreground">Tudo opcional — quanto mais detalhes, mais pessoal fica.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <input value={d.recipientName} onChange={(e) => setD({ ...d, recipientName: e.target.value })} maxLength={40} placeholder="Nome da pessoa" aria-label="Nome da pessoa" className={input} />
          <input value={d.giverName} onChange={(e) => setD({ ...d, giverName: e.target.value })} maxLength={40} placeholder="Nome de quem presenteia" aria-label="Nome de quem presenteia" className={input} />
          <input value={d.relation} onChange={(e) => setD({ ...d, relation: e.target.value })} maxLength={60} placeholder="Relação (ex.: mãe e filha)" aria-label="Relação" className={cn(input, "sm:col-span-2")} />
          <textarea value={d.feeling} onChange={(e) => setD({ ...d, feeling: e.target.value })} maxLength={240} rows={3} placeholder="Mensagem ou sentimento desejado" aria-label="Sentimento desejado" className={cn(input, "sm:col-span-2")} />
        </div>
        <p className="mt-4 text-sm font-medium">Limite de caracteres</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[...new Set([...LENGTH_OPTIONS.filter((n) => n < fieldMax), fieldMax])].map((n) => (
            <button key={n} type="button" onClick={() => setMaxLength(n)} className={cn("rounded-full border px-4 py-1.5 text-sm", maxLength === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>{n}</button>
          ))}
        </div>
      </>)}

      {step === 5 && (<>
        <h3 className="mt-1 text-3xl">Tudo pronto para criar</h3>
        <dl className="mt-5 grid gap-2 rounded-2xl bg-cream p-5 text-sm">
          <div><dt className="inline text-muted-foreground">Produto: </dt><dd className="inline">{product?.name}</dd></div>
          <div><dt className="inline text-muted-foreground">Ocasião: </dt><dd className="inline">{OCCASIONS.find((o) => o.id === occasion)?.label ?? occasionValue}</dd></div>
          <div><dt className="inline text-muted-foreground">Estilo: </dt><dd className="inline">{STYLES.find((s) => s.id === style)?.label}</dd></div>
          <div><dt className="inline text-muted-foreground">Até </dt><dd className="inline">{maxLength} caracteres</dd></div>
        </dl>
        <button type="button" onClick={generate} disabled={loading} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground shadow-soft disabled:opacity-60 sm:w-auto sm:px-8">
          {loading ? <><Loader2 className="size-4 animate-spin" /> Escrevendo com carinho…</> : <><Sparkles className="size-4" /> Gerar 3 sugestões</>}
        </button>
      </>)}

      {step === 6 && (<>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-3xl">Edite e escolha</h3>
          <button type="button" onClick={generate} disabled={loading} className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:border-primary disabled:opacity-60">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Gerar novas
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Toque para selecionar. Favoritas ficam guardadas ao gerar novas.</p>
        <ul className="mt-4 space-y-3">
          {list.map((s) => (
            <li key={s.id} onClick={() => setSelected(s.id)} className={cn("cursor-pointer rounded-2xl border p-4 transition-colors", selected === s.id ? "border-primary bg-secondary" : "border-border bg-card")}>
              <textarea value={s.text} maxLength={fieldMax} rows={3} aria-label="Editar sugestão" onChange={(e) => setList(list.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)))} className="min-h-24 w-full resize-none bg-transparent [field-sizing:content] font-display text-xl italic leading-snug outline-none" />
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <span className={cn(s.text.length > maxLength && "text-destructive")}>{s.text.length}/{maxLength}</span>
                <button type="button" aria-label="Favoritar" onClick={(e) => { e.stopPropagation(); setList(list.map((x) => (x.id === s.id ? { ...x, fav: !x.fav } : x))); }} className="ml-auto rounded-full p-2 hover:bg-background"><Star className={cn("size-4", s.fav && "fill-primary text-primary")} /></button>
                <button type="button" aria-label="Copiar" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(s.text).then(() => toast.success("Frase copiada")); }} className="rounded-full p-2 hover:bg-background"><Copy className="size-4" /></button>
                <span className={cn("ml-1 inline-flex items-center gap-1 rounded-full px-3 py-1", selected === s.id ? "bg-primary text-primary-foreground" : "border border-border")}>{selected === s.id ? <><Check className="size-3" /> Escolhida</> : "Escolher"}</span>
              </div>
            </li>
          ))}
        </ul>
      </>)}

      {step === 7 && chosen && product && (<>
        <h3 className="mt-1 text-3xl">Aplicar ao produto</h3>
        <div className="mt-5 flex gap-4 rounded-2xl bg-cream p-4">
          <img src={product.images[0]} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">{product.name} · {field?.label}</p><p className="mt-1 break-words font-display text-xl italic">“{chosen.text}”</p></div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => onApply(product, chosen.text.trim(), false)} className="flex-1 rounded-full border border-primary px-6 py-3.5 text-sm text-primary hover:bg-secondary">{fixedProduct ? "Inserir no produto" : "Continuar personalizando"}</button>
          <button type="button" onClick={() => onApply(product, chosen.text.trim(), true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm text-primary-foreground shadow-soft"><ShoppingBag className="size-4" /> Aplicar e adicionar ao carrinho</button>
        </div>
      </>)}

      {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
        <button type="button" disabled={loading || step === (fixedProduct ? 2 : 1)} onClick={() => setStep(step === 6 ? 4 : step - 1)} className="inline-flex items-center gap-1 text-sm disabled:opacity-30"><ArrowLeft className="size-4" /> Voltar</button>
        {step !== 5 && step !== 7 && (
          <button type="button" disabled={!canNext || loading} onClick={() => setStep(step + 1)} className="inline-flex items-center gap-1 rounded-full bg-foreground px-6 py-2.5 text-sm text-background disabled:opacity-30">Continuar <ArrowRight className="size-4" /></button>
        )}
      </div>
    </div>
  );
}
