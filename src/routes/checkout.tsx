import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Lock, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { brl, finalPrice } from "@/data/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { useCart } from "@/lib/cart";
import { createOrder, validateCoupon } from "@/lib/shop.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [
    { title: "Finalizar compra — PapeLemi" },
    { name: "description", content: "Conclua seu pedido PapeLemi com frete e cupom." },
    { property: "og:title", content: "Finalizar compra — PapeLemi" },
    { name: "robots", content: "noindex" },
  ] }),
  component: Checkout,
});

const FREE_FROM = 199;
const FLAT = 19.9;
const input = "w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus:border-ring md:text-sm";

function Checkout() {
  const { items, clear } = useCart();
  const { getProduct } = useCatalog();
  const navigate = useNavigate();
  const rows = useMemo(() => items.flatMap((i) => { const p = getProduct(i.slug); return p ? [{ i, p }] : []; }), [items, getProduct]);
  const subtotal = rows.reduce((s, { i, p }) => s + finalPrice(p) * i.qty, 0);
  const shipping = subtotal >= FREE_FROM ? 0 : FLAT;

  const [form, setForm] = useState({ name: "", email: "", phone: "", cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" });
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ orderId: string; paymentReady: boolean } | null>(null);

  useEffect(() => {
    window.__lovableEvents?.track?.("project.checkout_started", { items: rows.length, subtotal: Math.round(subtotal * 100) / 100 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const discount = coupon ? Math.round(subtotal * coupon.percent) / 100 : 0;
  const total = Math.round((subtotal - discount + shipping) * 100) / 100;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const applyCoupon = async () => {
    if (!couponInput.trim() || checkingCoupon) return;
    setCheckingCoupon(true);
    try {
      const c = await validateCoupon({ data: { code: couponInput.trim() } });
      if (c) { setCoupon(c); toast.success(`Cupom ${c.code} aplicado: ${c.percent}% de desconto`); }
      else { setCoupon(null); toast.error("Cupom não encontrado ou inativo"); }
    } catch { toast.error("Não foi possível validar o cupom"); }
    finally { setCheckingCoupon(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || !rows.length) return;
    setSending(true);
    try {
      const r = await createOrder({ data: {
        customer: { name: form.name, email: form.email, phone: form.phone },
        address: { cep: form.cep, street: form.street, number: form.number, complement: form.complement, district: form.district, city: form.city, state: form.state.toUpperCase() },
        items: rows.map(({ i }) => ({ slug: i.slug, qty: i.qty, options: i.options })),
        couponCode: coupon?.code,
        origin: window.location.origin,
      } });
      window.__lovableEvents?.track?.("project.order_created", { total: r.total, items: rows.length, coupon: coupon?.code ?? null });
      clear();
      if (r.initPoint) { window.location.href = r.initPoint; return; }
      setDone({ orderId: r.orderId, paymentReady: r.paymentReady });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir o pedido. Confira os dados e tente novamente.");
    } finally { setSending(false); }
  };

  if (done) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-5xl">Pedido recebido com carinho</h1>
      <p className="mt-4 text-muted-foreground">Número do pedido: <span className="font-medium text-foreground">{done.orderId.slice(0, 8)}</span></p>
      {done.paymentReady
        ? <p className="mt-2 text-muted-foreground">Acompanhe o pagamento na página do pedido.</p>
        : <p className="mt-2 text-muted-foreground">O pagamento online está em configuração. Vamos entrar em contato pelo e-mail informado para combinar o pagamento e o envio.</p>}
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to="/pedido/$id" params={{ id: done.orderId }} className="rounded-full bg-primary px-7 py-3 text-sm text-primary-foreground">Acompanhar pedido</Link>
        <Link to="/loja" className="rounded-full border border-border px-7 py-3 text-sm hover:border-primary">Voltar à loja</Link>
      </div>
    </div>
  );

  if (!rows.length) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-5xl">Seu carrinho está vazio</h1>
      <p className="mt-3 text-muted-foreground">Adicione produtos antes de finalizar a compra.</p>
      <Link to="/loja" className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm text-primary-foreground">Ir para a loja</Link>
    </div>
  );

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1fr_360px] md:px-8">
      <div>
        <h1 className="text-5xl">Finalizar compra</h1>
        <section className="mt-8">
          <h2 className="text-2xl">Seus dados</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input required value={form.name} onChange={set("name")} maxLength={80} placeholder="Nome completo" aria-label="Nome completo" className={cn(input, "sm:col-span-2")} />
            <input required type="email" value={form.email} onChange={set("email")} maxLength={120} placeholder="E-mail" aria-label="E-mail" className={input} />
            <input value={form.phone} onChange={set("phone")} maxLength={20} placeholder="Telefone / WhatsApp" aria-label="Telefone" className={input} />
          </div>
        </section>
        <section className="mt-8">
          <h2 className="text-2xl">Entrega</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input required value={form.cep} onChange={set("cep")} maxLength={9} placeholder="CEP (00000-000)" aria-label="CEP" className={input} />
            <input required value={form.district} onChange={set("district")} maxLength={80} placeholder="Bairro" aria-label="Bairro" className={input} />
            <input required value={form.street} onChange={set("street")} maxLength={120} placeholder="Rua / avenida" aria-label="Rua" className={cn(input, "sm:col-span-2")} />
            <input required value={form.number} onChange={set("number")} maxLength={20} placeholder="Número" aria-label="Número" className={input} />
            <input value={form.complement} onChange={set("complement")} maxLength={80} placeholder="Complemento (opcional)" aria-label="Complemento" className={input} />
            <input required value={form.city} onChange={set("city")} maxLength={80} placeholder="Cidade" aria-label="Cidade" className={input} />
            <input required value={form.state} onChange={set("state")} maxLength={2} placeholder="UF" aria-label="UF" className={input} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Frete fixo de {brl(FLAT)} para todo o Brasil — grátis em pedidos a partir de {brl(FREE_FROM)}. Cálculo por CEP pelos Correios/Melhor Envio chega em breve.</p>
        </section>
      </div>

      <aside className="h-fit rounded-[1.5rem] bg-cream p-6 md:sticky md:top-36">
        <h2 className="text-2xl">Resumo</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {rows.map(({ i, p }) => (
            <li key={i.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{i.qty}× {p.name}</span><span className="whitespace-nowrap">{brl(finalPrice(p) * i.qty)}</span></li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} maxLength={40} placeholder="Cupom de desconto" aria-label="Cupom" className={cn(input, "flex-1")} />
          <button type="button" onClick={applyCoupon} disabled={checkingCoupon} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border px-4 text-sm hover:border-primary disabled:opacity-60">
            {checkingCoupon ? <Loader2 className="size-4 animate-spin" /> : <Tag className="size-4" />} Aplicar
          </button>
        </div>
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
          <div className="flex justify-between"><span>Frete</span><span>{shipping === 0 ? "Grátis" : brl(shipping)}</span></div>
          {discount > 0 && <div className="flex justify-between text-primary"><span>Cupom {coupon?.code}</span><span>−{brl(discount)}</span></div>}
          <div className="flex justify-between pt-2 text-lg font-medium"><span>Total</span><span>{brl(total)}</span></div>
        </div>
        <button type="submit" disabled={sending} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-medium text-primary-foreground shadow-soft disabled:opacity-60">
          {sending ? <><Loader2 className="size-4 animate-spin" /> Registrando pedido…</> : <><Lock className="size-4" /> Concluir pedido · {brl(total)}</>}
        </button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Pagamento seguro via Mercado Pago (Pix, cartão e boleto).</p>
        <button type="button" onClick={() => navigate({ to: "/carrinho" })} className="mt-3 w-full text-center text-xs text-muted-foreground underline">Voltar ao carrinho</button>
      </aside>
    </form>
  );
}
