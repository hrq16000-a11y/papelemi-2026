import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { brl } from "@/data/catalog";
import { useCart } from "@/lib/cart";
import { createOrder, getOrderQuote, validateCoupon } from "@/lib/shop.functions";
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

type CheckoutShippingOption = {
  id: string;
  provider: string;
  service_name: string;
  price: number;
  estimated_delivery_days: string;
  estimated: boolean;
  requiresConfirmation: boolean;
  pickupAddress?: string;
  pickupInstructions?: string;
};

type CheckoutQuote = {
  items: Array<{ slug: string; name: string; qty: number; unit_price: number; line_total: number; options: Record<string, string> }>;
  couponCode: string | null;
  quoteToken: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  shippingOptions: CheckoutShippingOption[];
  selectedShippingOption: CheckoutShippingOption | null;
  selectedShippingOptionId: string | null;
  shippingSelectionChanged: boolean;
};

const ORDER_REQUEST_KEY = "papelemi-order-request-v1";
const ORDER_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

function createOrderRequestId() {
  return crypto.randomUUID();
}

function saveOrderRequestId(id: string) {
  try {
    localStorage.setItem(ORDER_REQUEST_KEY, JSON.stringify({ id, createdAt: Date.now() }));
  } catch { /* idempotency still protects repeated submits in this page session */ }
}

function loadOrderRequestId() {
  try {
    const raw = localStorage.getItem(ORDER_REQUEST_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { id?: unknown; createdAt?: unknown };
      if (
        typeof saved.id === "string"
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.id)
        && typeof saved.createdAt === "number"
        && Date.now() - saved.createdAt >= 0
        && Date.now() - saved.createdAt < ORDER_REQUEST_TTL_MS
      ) return saved.id;
    }
  } catch { /* creates a fresh request id below */ }
  const id = createOrderRequestId();
  saveOrderRequestId(id);
  return id;
}

function clearOrderRequestId() {
  try { localStorage.removeItem(ORDER_REQUEST_KEY); } catch { /* ignore unavailable storage */ }
}

function Checkout() {
  const { items, clear } = useCart();
  const navigate = useNavigate();
  const quoteItems = useMemo(() => items.map(({ slug, qty, options }) => ({ slug, qty, options })), [items]);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [selectedShippingOptionId, setSelectedShippingOptionId] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const checkoutTracked = useRef(false);

  const [form, setForm] = useState({ name: "", email: "", phone: "", cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" });
  const [customerNotes, setCustomerNotes] = useState("");
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ orderId: string; paymentReady: boolean; total: number } | null>(null);

  const normalizedCep = form.cep.replace(/\D/g, "");
  const validCep = /^\d{8}$/.test(normalizedCep);

  useEffect(() => {
    let active = true;
    if (!quoteItems.length) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return () => { active = false; };
    }
    setQuoteLoading(true);
    setQuoteError(null);
    getOrderQuote({ data: {
      items: quoteItems,
      couponCode: coupon?.code,
      ...(validCep ? { destinationZip: normalizedCep } : {}),
      ...(form.state.trim().length === 2 ? { destinationState: form.state.toUpperCase() } : {}),
      ...(selectedShippingOptionId ? { shippingOptionId: selectedShippingOptionId } : {}),
    } })
      .then((result) => {
        if (active) {
          setQuote(result);
          setQuoteError(null);
          if (selectedShippingOptionId && !result.selectedShippingOption) setSelectedShippingOptionId("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setQuote(null);
          setQuoteError(error instanceof Error ? error.message : "Não foi possível validar os produtos e o frete.");
        }
      })
      .finally(() => {
        if (active) setQuoteLoading(false);
      });
    return () => { active = false; };
  }, [quoteItems, coupon?.code, normalizedCep, form.state, selectedShippingOptionId, validCep]);
  const subtotal = quote?.subtotal ?? 0;
  const discount = quote?.discount ?? 0;
  const total = quote?.total ?? 0;
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => { const value = e.target.value; setForm((current) => ({ ...current, [k]: value })); if (k === "cep") setSelectedShippingOptionId(""); };

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
    if (sending || !items.length || !quote || quoteLoading || quoteError || !validCep || !selectedShippingOptionId || !quote.selectedShippingOption) return;
    if (!acceptedPrivacy) { toast.error("É necessário aceitar o uso dos dados para atendimento da encomenda."); return; }
    setSending(true);
    try {
      const currentRequestId = requestId ?? loadOrderRequestId();
      if (!requestId) setRequestId(currentRequestId);
      const r = await createOrder({ data: {
        requestId: currentRequestId,
        customer: { name: form.name, email: form.email, phone: form.phone },
        address: { cep: form.cep, street: form.street, number: form.number, complement: form.complement, district: form.district, city: form.city, state: form.state.toUpperCase() },
        items: quoteItems,
        couponCode: coupon?.code,
        quoteToken: quote.quoteToken,
        destinationZip: normalizedCep,
        destinationState: form.state.toUpperCase(),
        shippingOptionId: selectedShippingOptionId,
        origin: window.location.origin,
        customerNotes,
        acceptedPrivacy: true,
      } });
      window.__lovableEvents?.track?.("project.order_created", { total: r.total, items: items.length, coupon: coupon?.code ?? null });
      clearOrderRequestId();
      setRequestId(null);
      clear();
      if (r.initPoint) { window.location.href = r.initPoint; return; }
      setDone({ orderId: r.orderId, paymentReady: r.paymentReady, total: r.total });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível registrar sua encomenda. Confira os dados e tente novamente.";
      if (message.includes("PRICE_CHANGED")) {
        try {
          const refreshed = await getOrderQuote({ data: {
            items: quoteItems,
            couponCode: coupon?.code,
            destinationZip: normalizedCep,
            destinationState: form.state.toUpperCase(),
            shippingOptionId: selectedShippingOptionId,
          } });
          setQuote(refreshed);
          setQuoteError(null);
          toast.error("O preço ou as condições mudaram. Atualizamos o resumo; confira os novos valores antes de enviar novamente.");
        } catch (refreshError) {
          setQuote(null);
          setQuoteError(refreshError instanceof Error ? refreshError.message : "Não foi possível atualizar o resumo.");
          toast.error("Não foi possível atualizar os valores do carrinho.");
        }
      } else if (message.includes("SHIPPING_CHANGED")) {
        setSelectedShippingOptionId("");
        toast.error("A cotação de frete mudou. Selecione novamente a opção de entrega.");
      } else if (message.includes("ORDER_REQUEST_CONFLICT")) {
        const nextId = createOrderRequestId();
        saveOrderRequestId(nextId);
        setRequestId(nextId);
        toast.error("Os dados mudaram após uma tentativa anterior. Confira o resumo e clique novamente para registrar uma nova solicitação.");
      } else {
        toast.error(message);
      }
    } finally { setSending(false); }
  };

  if (done) return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <p className="text-[9px] uppercase tracking-[0.22em] text-primary">PapeLemi</p>
      <h1 className="mt-3 font-display text-4xl md:text-5xl">Encomenda recebida com carinho</h1>
      <p className="mt-4 text-sm text-muted-foreground">Protocolo: <span className="font-medium text-foreground">{done.orderId.slice(0, 8).toUpperCase()}</span></p>
      <p className="mt-2 text-sm text-muted-foreground">Total de referência recalculado: <span className="font-medium text-foreground">{brl(done.total)}</span></p>
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

  if (!items.length) return (
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
        {quoteLoading && <p className="mt-4 text-xs text-muted-foreground" role="status">Conferindo preços, opções e disponibilidade…</p>}
        {quoteError && <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          {quoteError}
          {coupon && <button type="button" onClick={() => { setCoupon(null); setCouponInput(""); }} className="ml-2 underline">Remover cupom</button>}
        </div>}
        {quote && <ul className="mt-4 space-y-3 text-sm">{quote.items.map((item, index) => <li key={`${item.slug}-${index}`} className="border-b border-border/60 pb-3 last:border-0">
          <div className="flex justify-between gap-2"><span className="min-w-0">{item.qty}× {item.name}</span><span className="whitespace-nowrap">{brl(item.line_total)}</span></div>
          {Object.entries(item.options).map(([label, value]) => <p key={label} className="mt-1 break-words text-[11px] text-muted-foreground">{label}: {value}</p>)}
        </li>)}</ul>}
        <div className="mt-4 flex gap-2">
          <input value={couponInput} onChange={(e) => { const value = e.target.value.toUpperCase(); setCouponInput(value); if (coupon && value.trim() !== coupon.code) setCoupon(null); }} maxLength={40} placeholder="Cupom" aria-label="Cupom" className={cn(input, "min-w-0 flex-1")} />
          <button type="button" onClick={applyCoupon} disabled={checkingCoupon} className="inline-flex shrink-0 items-center gap-1 border border-border px-3 text-xs hover:border-primary disabled:opacity-60">{checkingCoupon ? <Loader2 className="size-4 animate-spin" /> : <Tag className="size-4" />} Aplicar</button>
        </div>
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between"><span>Subtotal de referência</span><span>{brl(subtotal)}</span></div>
          <section className="mt-4 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Opções de entrega</h3>
            {!validCep ? (
              <p className="mt-2 text-xs text-muted-foreground">Informe um CEP válido para consultar as opções de entrega.</p>
            ) : quoteLoading ? (
              <p className="mt-2 text-xs text-muted-foreground" role="status">Consultando frete…</p>
            ) : quote?.shippingOptions.length ? (
              <div className="mt-2 space-y-2">
                {quote.shippingOptions.map((option) => (
                  <label key={option.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors", selectedShippingOptionId === option.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                    <input type="radio" name="shippingOption" value={option.id} checked={selectedShippingOptionId === option.id} onChange={() => setSelectedShippingOptionId(option.id)} className="mt-1 accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-start justify-between gap-2 text-xs font-medium">
                        <span>{option.provider} · {option.service_name}</span>
                        <span>{option.requiresConfirmation ? "A confirmar" : option.price === 0 ? "Grátis" : brl(option.price)}</span>
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">{option.estimated_delivery_days}{option.estimated ? " · estimativa, não cotação oficial" : ""}</span>
                      {option.pickupAddress ? <span className="mt-1 block text-[10px] text-muted-foreground">{option.pickupAddress}</span> : null}
                      {option.pickupInstructions ? <span className="mt-1 block text-[10px] text-muted-foreground">{option.pickupInstructions}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : <p className="mt-2 text-xs text-muted-foreground">Não há opções de entrega disponíveis para este CEP.</p>}
          </section>
          {discount > 0 && <div className="flex justify-between text-primary"><span>Cupom {quote?.couponCode}</span><span>−{brl(discount)}</span></div>}
          <div className="flex justify-between text-muted-foreground"><span>Frete</span><span>{quote?.selectedShippingOption ? (quote.selectedShippingOption.requiresConfirmation ? "A confirmar" : quote.shipping === 0 ? "Grátis" : brl(quote.shipping)) : "Selecione uma opção"}</span></div>
          <div className="flex justify-between pt-2 text-lg font-medium"><span>Total de referência</span><span>{brl(total)}</span></div>
        </div>
        <p className="mt-4 text-[10px] leading-5 text-muted-foreground">{quote?.selectedShippingOption?.requiresConfirmation ? "Esta opção é uma estimativa ou frete a combinar. A equipe confirmará o valor final antes de qualquer cobrança." : quote?.selectedShippingOption ? "A opção de entrega foi cotada para o CEP informado. Disponibilidade e prazo serão confirmados no processamento do pedido." : "Selecione uma opção de entrega para concluir a solicitação. Nenhuma cobrança é feita antes da confirmação."}</p>
        <button type="submit" disabled={sending || !acceptedPrivacy || quoteLoading || !quote || Boolean(quoteError) || !validCep || !selectedShippingOptionId || !quote.selectedShippingOption} className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-primary py-3.5 text-xs font-medium text-primary-foreground disabled:opacity-60">
          {sending ? <><Loader2 className="size-4 animate-spin" /> Registrando encomenda…</> : quoteLoading ? "Conferindo valores…" : "Registrar solicitação"}
        </button>
        <button type="button" onClick={() => navigate({ to: "/carrinho" })} className="mt-3 w-full text-center text-xs text-muted-foreground underline">Voltar ao carrinho</button>
      </aside>
    </form>
  );
}
