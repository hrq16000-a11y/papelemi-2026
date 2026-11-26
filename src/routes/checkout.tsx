import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Tag } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { brl, finalPrice } from "@/data/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { useCart } from "@/lib/cart";
import { createOrder, validateCoupon } from "@/lib/shop.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [
    { title: "Solicitar encomenda — PapeLemi" },
    { name: "description", content: "Envie sua solicitação de encomenda personalizada para a PapeLemi." },
    { property: "og:title", content: "Solicitar encomenda — PapeLemi" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Checkout,
});

const input = "w-full border border-input bg-background px-3 py-3 text-base outline-none transition-colors focus:border-primary md:text-sm";

async function getCheckoutAttemptKey(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  const storageKey = `papelemi:checkout-attempt:${fingerprint}`;
  const stored = localStorage.getItem(storageKey);
  if (stored) return { idempotencyKey: stored, storageKey };

  const idempotencyKey = crypto.randomUUID();
  localStorage.setItem(storageKey, idempotencyKey);
  return { idempotencyKey: localStorage.getItem(storageKey) ?? idempotencyKey, storageKey };
}

function Checkout() {
  const { items, clear } = useCart();
  const { getProduct } = useCatalog();
  const navigate = useNavigate();
  const rows = useMemo(() => items.flatMap((i) => { const p = getProduct(i.slug); return p ? [{ i, p }] : []; }), [items, getProduct]);
  const subtotal = rows.reduce((s, { i, p }) => s + finalPrice(p) * i.qty, 0);
  const shipping = 0;

  const [form, setForm] = useState({ name: "", email: "", phone: "", cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" });
  const [customerNotes, setCustomerNotes] = useState("");
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ orderId: string; paymentReady: boolean; total: number } | null>(null);

  useEffect(() => {
    window.__lovableEvents?.track?.("project.checkout_started", { items: rows.length, subtotal: Math.round(subtotal * 100) / 100 });
  }, []);

  const discount = coupon ? Math.round(subtotal * coupon.percent) / 100 : 0;
  const total = Math.round((subtotal - discount + shipping) * 100) / 100;
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const applyCoupon = async () => {
    if (!couponInput.trim() || checkingCoupon) return;
    setCheckingCoupon(true);
    try {
      const c = await validateCoupon({ data: { code: couponInput.trim() } });
      if (c) { setCoupon(c); toast.success("Cupom aplicado: " + c.percent + "% de desconto"); }
      else { setCoupon(null); toast.error("Cupom não encontrado ou inativo"); }
    } catch { toast.error("Não foi possível validar o cupom"); }
    finally { setCheckingCoupon(false); }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || !rows.length) return;
    if (!acceptedPrivacy) { toast.error("É necessário aceitar o uso dos dados para atendimento da encomenda."); return; }
    if (items.length !== rows.length) {
      toast.error("Há um produto indisponível no carrinho. Revise os itens antes de continuar.");
      return;
    }
    setSending(true);
    try {
      const request = {
        customer: { name: form.name, email: form.email, phone: form.phone },
        address: { cep: form.cep, street: form.street, number: form.number, complement: form.complement, district: form.district, city: form.city, state: form.state.toUpperCase() },
        items: rows.map(({ i, p }) => ({
          slug: i.slug,
          qty: i.qty,
          options: i.options,
          expectedUnitPrice: finalPrice(p),
        })),
        couponCode: coupon?.code,
        origin: window.location.origin,
        customerNotes,
        acceptedPrivacy: true as const,
      };
      const attempt = await getCheckoutAttemptKey(request);
      const r = await createOrder({ data: { ...request, idempotencyKey: attempt.idempotencyKey } });
      localStorage.removeItem(attempt.storageKey);
      window.__lovableEvents?.track?.("project.order_created", { total: r.total, items: rows.length, coupon: coupon?.code ?? null });
      clear();
      if (r.initPoint) { window.location.href = r.initPoint; return; }
      setDone({ orderId: r.orderId, paymentReady: r.paymentReady, total: r.total });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar sua encomenda. Confira os dados e tente novamente.");
    } finally { setSending(false); }
  };

  if (done) return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <p className="text-[9px] uppercase tracking-[0.22em] text-primary">PapeLemi</p>
      <h1 className="mt-3 font-display text-4xl md:text-5xl">Encomenda recebida com carinho</h1>
      <p className="mt-4 text-sm text-muted-foreground">Protocolo: <span className="font-medium text-foreground">{done.orderId.slice(0, 8).toUpperCase()}</span></p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {done.paymentReady
          ? "Sua encomenda foi registrada. Acompanhe os próximos passos na página do pedido."
          : "A PapeLemi confirmará disponibilidade, personalização, prazo, frete e pagamento pelo contato informado. Nenhuma cobrança foi feita nesta etapa."}
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to="/pedido/$id" params={{ id: done.orderId }} className="bg-primary px-7 py-3 text-sm text-primary-foreground">Acompanhar encomenda</Link>
        <Link to="/loja" className="border border-border px-7 py-3 text-sm hover:border-primary">Voltar à loja</Link>
      </div>
    </div>
  );

  if (items.length !== rows.length) return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="font-display text-4xl">Revise seu carrinho</h1>
      <p className="mt-3 text-sm text-muted-foreground">Um ou mais produtos foram removidos ou ficaram indisponíveis. Volte ao carrinho para revisar os itens. Nenhuma encomenda foi enviada.</p>
      <Link to="/carrinho" className="mt-8 inline-block bg-foreground px-7 py-3 text-sm text-background">Revisar carrinho</Link>
    </div>
  );

  if (!rows.length) return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="font-display text-4xl">Seu carrinho está vazio</h1>
      <p className="mt-3 text-sm text-muted-foreground">Adicione produtos antes de solicitar sua encomenda.</p>
      <Link to="/loja" className="mt-8 inline-block bg-foreground px-7 py-3 text-sm text-background">Explorar produtos</Link>
    </div>
  );

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1fr_360px] md:px-8">
      <div>
        <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Atendimento direto PapeLemi</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">Solicitar encomenda</h1>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">Preencha seus dados para a equipe confirmar os detalhes antes da produção.</p>
        <section className="mt-8">
          <h2 className="font-display text-2xl">Seus dados</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium sm:col-span-2">Nome completo<input required autoComplete="name" value={form.name} onChange={set("name")} maxLength={80} className={input} /></label>
            <label className="grid gap-1.5 text-xs font-medium">E-mail<input required type="email" autoComplete="email" value={form.email} onChange={set("email")} maxLength={120} className={input} /></label>
            <label className="grid gap-1.5 text-xs font-medium">Telefone com DDD<input required type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} maxLength={20} placeholder="(00) 00000-0000" className={input} /></label>
          </div>
        </section>
        <section className="mt-8">
          <h2 className="font-display text-2xl">Endereço para entrega</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-medium">CEP<input required autoComplete="postal-code" value={form.cep} onChange={set("cep")} maxLength={9} placeholder="00000-000" className={input} /></label>
            <label className="grid gap-1.5 text-xs font-medium">Bairro<input required value={form.district} onChange={set("district")} maxLength={80} className={input} /></label>
            <label className="grid gap-1.5 text-xs font-medium sm:col-span-2">Rua / avenida<input required autoComplete="street-address" value={form.street} onChange={set("street")} maxLength={120} className={input} /></label>
            <label className="grid gap-1.5 text-xs font-medium">Número<input required value={form.number} onChange={set("number")} maxLength={20} className={input} /></label>
            <label className="grid gap-1.5 text-xs font-medium">Complemento<input value={form.complement} onChange={set("complement")} maxLength={80} className={input} /></label>
            <label className="grid gap-1.5 text-xs font-medium">Cidade<input required autoComplete="address-level2" value={form.city} onChange={set("city")} maxLength={80} className={input} /></label>
            <label className="grid gap-1.5 text-xs font-medium">UF<input required value={form.state} onChange={set("state")} maxLength={2} pattern="[A-Za-z]{2}" className={input} /></label>
          </div>
          <label className="mt-4 grid gap-1.5 text-xs font-medium">Observações da encomenda<textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={3} maxLength={1000} className={input} placeholder="Conte algo importante sobre o pedido, prazo ou entrega." /></label>
        </section>
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="font-display text-2xl">Privacidade</h2>
          <label className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground">
            <input type="checkbox" required checked={acceptedPrivacy} onChange={(e) => setAcceptedPrivacy(e.target.checked)} className="mt-1 accent-primary" />
            <span>Autorizo a PapeLemi a utilizar meus dados exclusivamente para responder e atender esta solicitação. <Link to="/politica-de-privacidade" className="underline underline-offset-2">Leia a política de privacidade</Link>.</span>
          </label>
        </section>
      </div>
      <aside className="h-fit border border-border bg-cream p-6 md:sticky md:top-32">
        <h2 className="font-display text-2xl">Resumo da encomenda</h2>
        <ul className="mt-4 space-y-2 text-sm">{rows.map(({ i, p }) => <li key={i.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{i.qty}× {p.name}</span><span className="whitespace-nowrap">{brl(finalPrice(p) * i.qty)}</span></li>)}</ul>
        <div className="mt-4 flex gap-2">
          <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} maxLength={40} placeholder="Cupom" aria-label="Cupom" className={cn(input, "min-w-0 flex-1")} />
          <button type="button" onClick={applyCoupon} disabled={checkingCoupon} className="inline-flex shrink-0 items-center gap-1 border border-border px-3 text-xs hover:border-primary disabled:opacity-60">{checkingCoupon ? <Loader2 className="size-4 animate-spin" /> : <Tag className="size-4" />} Aplicar</button>
        </div>
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between"><span>Subtotal de referência</span><span>{brl(subtotal)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>Frete</span><span>A confirmar</span></div>
          {discount > 0 && <div className="flex justify-between text-primary"><span>Cupom {coupon?.code}</span><span>−{brl(discount)}</span></div>}
          <div className="flex justify-between pt-2 text-lg font-medium"><span>Total de referência</span><span>{brl(total)}</span></div>
        </div>
        <p className="mt-4 text-[10px] leading-5 text-muted-foreground">Os valores são referências. Frete, disponibilidade, personalização e condições finais serão confirmados pela PapeLemi. Nenhuma cobrança é feita agora.</p>
        <button type="submit" disabled={sending || !acceptedPrivacy} className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-primary py-3.5 text-xs font-medium text-primary-foreground disabled:opacity-60">
          {sending ? <><Loader2 className="size-4 animate-spin" /> Registrando encomenda…</> : "Registrar solicitação"}
        </button>
        <button type="button" onClick={() => navigate({ to: "/carrinho" })} className="mt-3 w-full text-center text-xs text-muted-foreground underline">Voltar ao carrinho</button>
      </aside>
    </form>
  );
}
