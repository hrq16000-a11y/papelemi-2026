import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Minus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { brl, finalPrice, getProduct } from "@/data/catalog";
import { useCart } from "@/lib/cart";
import { aiField } from "@/components/store/PhraseGenerator";
import { submitOrderRequest } from "@/lib/order.functions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/carrinho")({
  head: () => ({ meta: [
    { title: "Carrinho e encomenda — PapeLemi" },
    { name: "description", content: "Revise seus produtos personalizados e solicite sua encomenda PapeLemi." },
    { property: "og:title", content: "Carrinho e encomenda — PapeLemi" },
    { property: "og:description", content: "Registre sua solicitação de encomenda PapeLemi." },
    { name: "robots", content: "noindex" },
  ] }),
  component: Cart,
});

function Cart() {
  const { items, setQty, remove, clear } = useCart();
  const submitOrder = useServerFn(submitOrderRequest);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const rows = items.flatMap((i) => {
    const p = getProduct(i.slug);
    return p ? [{ i, p }] : [];
  });
  const subtotal = rows.reduce((sum, { i, p }) => sum + finalPrice(p) * i.qty, 0);
  const field = "w-full border border-input bg-background px-3 py-3 text-base outline-none transition-colors focus:border-primary md:text-sm";
  const label = "grid gap-1.5 text-xs font-medium text-foreground";

  const openCheckout = () => {
    setError(null);
    setStartedAt(Date.now());
    setCheckoutOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "");
    try {
      const result = await submitOrder({
        data: {
          customer: {
            name: value("name"),
            email: value("email"),
            phone: value("phone"),
            cep: value("cep"),
            city: value("city"),
            state: value("state"),
            address: value("address"),
            number: value("number"),
            complement: value("complement"),
            notes: value("notes"),
            acceptedPrivacy: data.get("acceptedPrivacy") === "on",
          },
          items: rows.map(({ i, p }) => ({ slug: p.slug, qty: i.qty, options: i.options })),
          website: value("website"),
          startedAt,
        },
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOrderNumber(result.orderNumber);
      setCheckoutOpen(false);
      clear();
    } catch {
      setError("Não foi possível registrar sua solicitação agora. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {rows.length === 0 ? (
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary">PapeLemi</p>
          <h1 className="mt-3 text-4xl md:text-5xl">Seu carrinho está vazio</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Escolha uma peça, personalize os detalhes e guarde uma ideia bonita para o seu momento.</p>
          <Link to="/loja" className="mt-8 inline-flex items-center gap-2 bg-foreground px-6 py-3 text-xs text-background transition-colors hover:bg-primary">
            Explorar produtos <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1fr_340px] md:px-8">
          <div>
            <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Suas escolhas</p>
            <h1 className="mt-2 text-4xl md:text-5xl">Carrinho</h1>
            <p className="mt-2 text-xs text-muted-foreground">Confira os produtos e detalhes antes de solicitar sua encomenda.</p>
            <ul className="mt-8 divide-y divide-border border-y border-border">
              {rows.map(({ i, p }) => (
                <li key={i.id} className="flex gap-4 py-6">
                  <Link to="/produto/$slug" params={{ slug: p.slug }} className="size-24 shrink-0 overflow-hidden bg-secondary md:size-28">
                    <img src={p.images[0]} alt={p.name} className="size-full object-cover" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <Link to="/produto/$slug" params={{ slug: p.slug }} search={{ frase: i.options[aiField(p)?.label ?? ""] || undefined }} className="font-display text-xl hover:text-primary">{p.name}</Link>
                      <p className="whitespace-nowrap text-sm font-medium">{brl(finalPrice(p) * i.qty)}</p>
                    </div>
                    <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {Object.entries(i.options).filter(([, v]) => v).map(([k, v]) => (
                        <div key={k} className="break-words"><dt className="inline font-medium">{k}:</dt> <dd className="inline">{v}</dd></div>
                      ))}
                    </dl>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex items-center border border-border text-sm">
                        <button type="button" aria-label="Diminuir quantidade" onClick={() => setQty(i.id, Math.max(p.minQty ?? 1, i.qty - 1))} className="p-2"><Minus className="size-3" /></button>
                        <span className="w-8 text-center tabular-nums">{i.qty}</span>
                        <button type="button" aria-label="Aumentar quantidade" onClick={() => setQty(i.id, i.qty + 1)} className="p-2"><Plus className="size-3" /></button>
                      </div>
                      <button type="button" aria-label={"Remover " + p.name} onClick={() => remove(i.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"><Trash2 className="size-3.5" /> Remover</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Link to="/loja" className="mt-5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"><ArrowRight className="size-3 rotate-180" /> Continuar escolhendo</Link>
          </div>

          <aside className="h-fit border border-border bg-cream p-6 md:sticky md:top-32">
            <h2 className="text-2xl">Resumo da encomenda</h2>
            <div className="mt-5 flex justify-between text-sm"><span>Subtotal de referência</span><span className="font-medium">{brl(subtotal)}</span></div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Frete</span><span>Confirmado depois</span></div>
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-[10px] leading-5 text-muted-foreground">Os valores são referências. A PapeLemi confirmará disponibilidade, personalização, prazo, frete e pagamento antes da produção.</p>
              <p className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" /> Seus dados serão usados somente para atender esta solicitação.</p>
            </div>
            <button type="button" onClick={openCheckout} className="mt-6 w-full bg-foreground px-4 py-3.5 text-xs font-medium text-background transition-colors hover:bg-primary">
              Solicitar encomenda <ArrowRight className="ml-2 inline size-3" />
            </button>
            <p className="mt-3 text-center text-[10px] text-muted-foreground">Nenhuma cobrança é feita agora.</p>
          </aside>
        </div>
      )}

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto rounded-none p-5 md:p-8">
          <p className="text-[9px] uppercase tracking-[0.2em] text-primary">Atendimento direto PapeLemi</p>
          <DialogTitle className="mt-1 font-display text-3xl">Solicitar encomenda</DialogTitle>
          <DialogDescription className="text-xs leading-5 text-muted-foreground">
            Registre seus dados para a PapeLemi confirmar personalização, prazo, frete e pagamento. Nenhuma cobrança é feita nesta etapa.
          </DialogDescription>
          <form onSubmit={submit} className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>Nome completo<input name="name" autoComplete="name" required minLength={2} maxLength={120} className={field} /></label>
              <label className={label}>E-mail<input name="email" type="email" autoComplete="email" required maxLength={180} className={field} /></label>
              <label className={label}>Telefone com DDD<input name="phone" type="tel" autoComplete="tel" inputMode="tel" required minLength={10} maxLength={30} placeholder="(00) 00000-0000" className={field} /></label>
              <label className={label}>CEP<input name="cep" autoComplete="postal-code" inputMode="numeric" pattern="[0-9-]{8,9}" required placeholder="00000-000" className={field} /></label>
              <label className={label}>Cidade<input name="city" autoComplete="address-level2" required maxLength={100} className={field} /></label>
              <label className={label}>UF<input name="state" autoComplete="address-level1" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" className={field} /></label>
              <label className={label + " sm:col-span-2"}>Rua e bairro<input name="address" autoComplete="street-address" required maxLength={180} className={field} /></label>
              <label className={label}>Número<input name="number" required maxLength={30} className={field} /></label>
              <label className={label}>Complemento<input name="complement" maxLength={120} className={field} /></label>
              <label className={label + " sm:col-span-2"}>Observações da encomenda<textarea name="notes" rows={3} maxLength={1000} className={field} /></label>
            </div>
            <input type="hidden" name="startedAt" value={startedAt} />
            <label className="flex items-start gap-2 text-[10px] leading-5 text-muted-foreground">
              <input type="checkbox" name="acceptedPrivacy" required className="mt-1 accent-primary" />
              <span>Autorizo a PapeLemi a usar estes dados exclusivamente para responder e atender esta solicitação. <a href="/#privacidade" target="_blank" rel="noreferrer" className="underline underline-offset-2">Leia sobre privacidade</a>.</span>
            </label>
            <label aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">Site<input name="website" tabIndex={-1} autoComplete="off" /></label>
            {error && <p role="alert" className="border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full bg-primary px-5 py-3.5 text-xs font-medium text-primary-foreground transition-opacity disabled:cursor-wait disabled:opacity-60">
              {submitting ? "Registrando solicitação…" : "Registrar solicitação"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!orderNumber} onOpenChange={(open) => { if (!open) setOrderNumber(null); }}>
        <DialogContent className="max-w-md rounded-none p-7 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-primary"><ShieldCheck className="size-6" /></div>
          <DialogTitle className="mt-4 font-display text-3xl">Solicitação registrada</DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-6 text-muted-foreground">
            Sua solicitação foi recebida pela PapeLemi. Nossa equipe confirmará disponibilidade, personalização, prazo, frete e pagamento pelo contato informado. Nenhuma cobrança foi feita.
          </DialogDescription>
          <p className="mt-5 border-y border-border py-3 text-xs text-muted-foreground">Protocolo <strong className="ml-1 text-foreground">{orderNumber}</strong></p>
          <button type="button" onClick={() => setOrderNumber(null)} className="mt-5 w-full bg-foreground px-5 py-3 text-xs text-background">Continuar na loja</button>
        </DialogContent>
      </Dialog>
    </>
  );
}
