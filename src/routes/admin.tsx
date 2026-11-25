import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { brl, type Product } from "@/data/catalog";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteCategory, deleteCoupon, deletePhrase, deleteProduct,
  getMyRole, listAdminCategories, listAdminCoupons, listAdminPhrases, listAdminProducts, listOrders,
  saveCategory, saveCoupon, savePhrase, saveProduct, setOrderStatus,
} from "@/lib/shop.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: "Painel da loja — PapeLemi" },
    { name: "description", content: "Gestão da loja PapeLemi." },
    { name: "robots", content: "noindex" },
  ] }),
  component: Admin,
});

const input = "w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring";
const btn = "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs hover:border-primary disabled:opacity-60";

type Tab = "pedidos" | "produtos" | "categorias" | "frases" | "cupons";

function Admin() {
  const [stage, setStage] = useState<"loading" | "login" | "denied" | "ok">("loading");
  const [tab, setTab] = useState<Tab>("pedidos");

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setStage("login"); return; }
      try {
        const r = await getMyRole();
        if (active) setStage(r.isAdmin ? "ok" : "denied");
      } catch { if (active) setStage("denied"); }
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") check();
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  if (stage === "loading") return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  if (stage === "login") return <LoginForm />;
  if (stage === "denied") return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-4xl">Acesso restrito</h1>
      <p className="mt-3 text-muted-foreground">Esta conta ainda não tem permissão de administradora. Peça ao dono da loja para liberar o acesso.</p>
      <button onClick={() => supabase.auth.signOut()} className={cn(btnGhost, "mt-6")}><LogOut className="size-3.5" /> Sair</button>
    </div>
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "pedidos", label: "Pedidos" },
    { id: "produtos", label: "Produtos" },
    { id: "categorias", label: "Categorias" },
    { id: "frases", label: "Frases" },
    { id: "cupons", label: "Cupons" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Painel da loja</p>
          <h1 className="mt-1 text-4xl">Gestão PapeLemi</h1>
        </div>
        <button onClick={() => supabase.auth.signOut()} className={btnGhost}><LogOut className="size-3.5" /> Sair</button>
      </div>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("whitespace-nowrap rounded-full border px-4 py-1.5 text-sm", tab === t.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>{t.label}</button>
        ))}
      </div>
      <div className="mt-8">
        {tab === "pedidos" && <OrdersTab />}
        {tab === "produtos" && <ProductsTab />}
        {tab === "categorias" && <CategoriesTab />}
        {tab === "frases" && <PhrasesTab />}
        {tab === "cupons" && <CouponsTab />}
      </div>
    </div>
  );
}

function LoginForm() {
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) toast.error("E-mail ou senha incorretos");
      } else {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) toast.error(error.message);
        else setSent(true);
      }
    } finally { setBusy(false); }
  };

  if (sent) return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-4xl">Confirme seu e-mail</h1>
      <p className="mt-3 text-muted-foreground">Enviamos um link de confirmação para {email}. Depois de confirmar, volte e entre no painel.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <h1 className="text-center text-4xl">Painel da loja</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">Acesso exclusivo da equipe PapeLemi.</p>
      <form onSubmit={submit} className="mt-8 space-y-3">
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" aria-label="E-mail" className={input} />
        <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} placeholder="Senha" aria-label="Senha" className={input} />
        <button type="submit" disabled={busy} className={cn(btn, "w-full justify-center py-3 text-sm")}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "entrar" ? "Entrar" : "Criar conta"}
        </button>
      </form>
      <button onClick={() => setMode(mode === "entrar" ? "criar" : "entrar")} className="mt-4 w-full text-center text-xs text-muted-foreground underline">
        {mode === "entrar" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}
      </button>
      <p className="mt-6 text-center text-xs text-muted-foreground"><Link to="/" className="underline">Voltar à loja</Link></p>
    </div>
  );
}

// ===== Pedidos =====

type Order = Awaited<ReturnType<typeof listOrders>>[number];
const ORDER_STATUS: Record<string, string> = { pending: "Aguardando", paid: "Pago", shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado" };

function OrdersTab() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const load = useCallback(() => { listOrders().then(setOrders).catch((e) => toast.error(e.message)); }, []);
  useEffect(load, [load]);

  if (!orders) return <Loader2 className="size-6 animate-spin text-primary" />;
  if (!orders.length) return <p className="py-16 text-center text-muted-foreground">Nenhum pedido ainda. Quando a primeira venda acontecer, ela aparece aqui.</p>;

  return (
    <ul className="space-y-4">
      {orders.map((o) => (
        <li key={o.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{o.customer_name} <span className="text-sm font-normal text-muted-foreground">· {o.customer_email}</span></p>
              <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")} · pedido {o.id.slice(0, 8)}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-display text-xl">{brl(Number(o.total))}</p>
              <select value={o.status} onChange={async (e) => { try { await setOrderStatus({ data: { id: o.id, status: e.target.value as never } }); toast.success("Status atualizado"); load(); } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); } }} aria-label="Status do pedido" className={cn(input, "w-auto")}>
                {Object.entries(ORDER_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {(o.items as { name: string; qty: number; unit_price: number; options?: Record<string, string> }[]).map((it, idx) => (
              <li key={idx}>
                {it.qty}× {it.name} — {brl(Number(it.unit_price))}
                {it.options && Object.entries(it.options).filter(([, v]) => v).map(([k, v]) => <span key={k} className="block pl-4 text-xs">{k}: {v}</span>)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Subtotal {brl(Number(o.subtotal))} · Frete {Number(o.shipping) === 0 ? "grátis" : brl(Number(o.shipping))}
            {Number(o.discount) > 0 && <> · Cupom {o.coupon_code} (−{brl(Number(o.discount))})</>}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ===== Produtos =====

type AdminProduct = Awaited<ReturnType<typeof listAdminProducts>>[number];
type ProductForm = {
  slug: string; categorySlug: string; name: string; description: string; images: string;
  price: string; promoPrice: string; colors: string; sizes: string; finishes: string;
  productionDays: string; stock: string; published: boolean; bestSeller: boolean; personalizable: boolean; minQty: string;
};

const emptyProduct: ProductForm = { slug: "", categorySlug: "", name: "", description: "", images: "", price: "", promoPrice: "", colors: "", sizes: "", finishes: "", productionDays: "", stock: "0", published: true, bestSeller: false, personalizable: false, minQty: "" };

const toForm = (p: AdminProduct): ProductForm => ({
  slug: p.slug, categorySlug: p.category, name: p.name, description: p.description,
  images: p.images.join("\n"), price: String(p.price), promoPrice: p.promoPrice == null ? "" : String(p.promoPrice),
  colors: p.colors.join(", "), sizes: p.sizes.join(", "), finishes: p.finishes.join(", "),
  productionDays: p.productionDays, stock: String(p.stock), published: p.published,
  bestSeller: p.bestSeller ?? false, personalizable: p.personalizable, minQty: p.minQty == null ? "" : String(p.minQty),
});

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function ProductsTab() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<{ slug: string; name: string }[]>([]);
  const [editing, setEditing] = useState<ProductForm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listAdminProducts().then(setProducts).catch((e) => toast.error(e.message));
    listAdminCategories().then((c) => setCats(c.map((x) => ({ slug: x.slug, name: x.name })))).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await saveProduct({ data: {
        slug: editing.slug, categorySlug: editing.categorySlug, name: editing.name, description: editing.description,
        images: editing.images.split("\n").map((x) => x.trim()).filter(Boolean),
        price: Number(editing.price), promoPrice: editing.promoPrice ? Number(editing.promoPrice) : null,
        colors: split(editing.colors), sizes: split(editing.sizes), finishes: split(editing.finishes),
        productionDays: editing.productionDays, stock: Number(editing.stock) || 0,
        published: editing.published, bestSeller: editing.bestSeller, personalizable: editing.personalizable,
        minQty: editing.minQty ? Number(editing.minQty) : null,
      } });
      toast.success("Produto salvo");
      setEditing(null);
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setBusy(false); }
  };

  if (!products) return <Loader2 className="size-6 animate-spin text-primary" />;

  if (editing) return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-2xl">{products.some((p) => p.slug === editing.slug) ? "Editar produto" : "Novo produto"}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Identificador (slug)<input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className={cn(input, "mt-1")} placeholder="ex.: caderno-afeto" /></label>
        <label className="text-xs text-muted-foreground">Categoria
          <select value={editing.categorySlug} onChange={(e) => setEditing({ ...editing, categorySlug: e.target.value })} className={cn(input, "mt-1")}>
            <option value="">Escolha…</option>
            {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground sm:col-span-2">Nome<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground sm:col-span-2">Descrição<textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground sm:col-span-2">Fotos (uma URL por linha)<textarea value={editing.images} onChange={(e) => setEditing({ ...editing, images: e.target.value })} rows={2} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Preço (R$)<input type="number" step="0.01" min="0" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Preço promocional (opcional)<input type="number" step="0.01" min="0" value={editing.promoPrice} onChange={(e) => setEditing({ ...editing, promoPrice: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Cores (vírgula)<input value={editing.colors} onChange={(e) => setEditing({ ...editing, colors: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Tamanhos (vírgula)<input value={editing.sizes} onChange={(e) => setEditing({ ...editing, sizes: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Acabamentos (vírgula)<input value={editing.finishes} onChange={(e) => setEditing({ ...editing, finishes: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Prazo de produção<input value={editing.productionDays} onChange={(e) => setEditing({ ...editing, productionDays: e.target.value })} className={cn(input, "mt-1")} placeholder="ex.: 5 a 7 dias úteis" /></label>
        <label className="text-xs text-muted-foreground">Estoque<input type="number" min="0" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Quantidade mínima (opcional)<input type="number" min="1" value={editing.minQty} onChange={(e) => setEditing({ ...editing, minQty: e.target.value })} className={cn(input, "mt-1")} /></label>
        <div className="flex flex-wrap gap-5 sm:col-span-2">
          {([["published", "Publicado"], ["bestSeller", "Mais vendido"], ["personalizable", "Personalizável"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.checked })} /> {label}</label>
          ))}
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <button onClick={save} disabled={busy} className={btn}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar</button>
        <button onClick={() => setEditing(null)} className={btnGhost}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <div>
      <button onClick={() => setEditing({ ...emptyProduct, categorySlug: cats[0]?.slug ?? "" })} className={btn}><Plus className="size-3.5" /> Novo produto</button>
      <ul className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
        {products.map((p) => (
          <li key={p.slug} className="flex items-center gap-4 p-4">
            <img src={p.images[0]} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name} {!p.published && <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">Oculto</span>}</p>
              <p className="text-xs text-muted-foreground">{brl(p.promoPrice ?? p.price)} · estoque {p.stock}</p>
            </div>
            <button onClick={() => setEditing(toForm(p))} aria-label={`Editar ${p.name}`} className="rounded-full p-2 hover:bg-secondary"><Pencil className="size-4" /></button>
            <button onClick={async () => { if (!confirm(`Excluir ${p.name}?`)) return; try { await deleteProduct({ data: { slug: p.slug } }); toast.success("Produto excluído"); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } }} aria-label={`Excluir ${p.name}`} className="rounded-full p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== Categorias =====

type AdminCategory = Awaited<ReturnType<typeof listAdminCategories>>[number];

function CategoriesTab() {
  const [cats, setCats] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<{ slug: string; name: string; description: string; image: string; sort: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { listAdminCategories().then(setCats).catch((e) => toast.error(e.message)); }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await saveCategory({ data: { slug: editing.slug, name: editing.name, description: editing.description, image: editing.image, sort: Number(editing.sort) || 0 } });
      toast.success("Categoria salva"); setEditing(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setBusy(false); }
  };

  if (!cats) return <Loader2 className="size-6 animate-spin text-primary" />;

  if (editing) return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-2xl">{cats.some((c) => c.slug === editing.slug) ? "Editar categoria" : "Nova categoria"}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Identificador (slug)<input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Nome<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground sm:col-span-2">Descrição<input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">URL da imagem<input value={editing.image} onChange={(e) => setEditing({ ...editing, image: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Ordem<input type="number" min="0" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: e.target.value })} className={cn(input, "mt-1")} /></label>
      </div>
      <div className="mt-6 flex gap-3">
        <button onClick={save} disabled={busy} className={btn}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar</button>
        <button onClick={() => setEditing(null)} className={btnGhost}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <div>
      <button onClick={() => setEditing({ slug: "", name: "", description: "", image: "", sort: String(cats.length + 1) })} className={btn}><Plus className="size-3.5" /> Nova categoria</button>
      <ul className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
        {cats.map((c) => (
          <li key={c.slug} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">{c.slug} · ordem {c.sort}</p>
            </div>
            <button onClick={() => setEditing({ slug: c.slug, name: c.name, description: c.description, image: c.image, sort: String(c.sort) })} aria-label={`Editar ${c.name}`} className="rounded-full p-2 hover:bg-secondary"><Pencil className="size-4" /></button>
            <button onClick={async () => { if (!confirm(`Excluir a categoria ${c.name}? Produtos dela precisam ser movidos antes.`)) return; try { await deleteCategory({ data: { slug: c.slug } }); toast.success("Categoria excluída"); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } }} aria-label={`Excluir ${c.name}`} className="rounded-full p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== Frases =====

type AdminPhrase = Awaited<ReturnType<typeof listAdminPhrases>>[number];

function PhrasesTab() {
  const [phrases, setPhrases] = useState<AdminPhrase[] | null>(null);
  const [editing, setEditing] = useState<{ id?: string; phrase: string; occasion: string; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { listAdminPhrases().then(setPhrases).catch((e) => toast.error(e.message)); }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await savePhrase({ data: { id: editing.id, phrase: editing.phrase, occasion: editing.occasion, active: editing.active } });
      toast.success("Frase salva"); setEditing(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setBusy(false); }
  };

  if (!phrases) return <Loader2 className="size-6 animate-spin text-primary" />;

  if (editing) return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-2xl">{editing.id ? "Editar frase" : "Nova frase"}</h2>
      <div className="mt-5 grid gap-3">
        <label className="text-xs text-muted-foreground">Frase<textarea value={editing.phrase} onChange={(e) => setEditing({ ...editing, phrase: e.target.value })} rows={3} maxLength={220} className={cn(input, "mt-1")} /></label>
        <label className="text-xs text-muted-foreground">Ocasião (opcional)<input value={editing.occasion} onChange={(e) => setEditing({ ...editing, occasion: e.target.value })} maxLength={60} className={cn(input, "mt-1")} placeholder="ex.: aniversario, maternidade" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Ativa (aparece na assistente)</label>
      </div>
      <div className="mt-6 flex gap-3">
        <button onClick={save} disabled={busy} className={btn}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar</button>
        <button onClick={() => setEditing(null)} className={btnGhost}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">Frases curtidas pela loja, exibidas como inspiração na assistente de dedicatórias.</p>
      <button onClick={() => setEditing({ phrase: "", occasion: "", active: true })} className={btn}><Plus className="size-3.5" /> Nova frase</button>
      <ul className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
        {phrases.map((p) => (
          <li key={p.id} className="flex items-start gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="break-words font-display text-lg italic leading-snug">“{p.phrase}”</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.occasion || "todas as ocasiões"} · {p.active ? "ativa" : "inativa"}</p>
            </div>
            <button onClick={() => setEditing({ id: p.id, phrase: p.phrase, occasion: p.occasion, active: p.active })} aria-label="Editar frase" className="rounded-full p-2 hover:bg-secondary"><Pencil className="size-4" /></button>
            <button onClick={async () => { if (!confirm("Excluir esta frase?")) return; try { await deletePhrase({ data: { id: p.id } }); toast.success("Frase excluída"); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } }} aria-label="Excluir frase" className="rounded-full p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ===== Cupons =====

type AdminCoupon = Awaited<ReturnType<typeof listAdminCoupons>>[number];

function CouponsTab() {
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(null);
  const [editing, setEditing] = useState<{ code: string; percent: string; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { listAdminCoupons().then(setCoupons).catch((e) => toast.error(e.message)); }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await saveCoupon({ data: { code: editing.code.toUpperCase(), percent: Number(editing.percent), active: editing.active } });
      toast.success("Cupom salvo"); setEditing(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setBusy(false); }
  };

  if (!coupons) return <Loader2 className="size-6 animate-spin text-primary" />;

  if (editing) return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="text-2xl">{coupons.some((c) => c.code === editing.code) ? "Editar cupom" : "Novo cupom"}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Código<input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} maxLength={40} className={cn(input, "mt-1")} placeholder="ex.: BEMVINDO10" /></label>
        <label className="text-xs text-muted-foreground">Desconto (%)<input type="number" min="1" max="90" value={editing.percent} onChange={(e) => setEditing({ ...editing, percent: e.target.value })} className={cn(input, "mt-1")} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Ativo</label>
      </div>
      <div className="mt-6 flex gap-3">
        <button onClick={save} disabled={busy} className={btn}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar</button>
        <button onClick={() => setEditing(null)} className={btnGhost}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <div>
      <button onClick={() => setEditing({ code: "", percent: "10", active: true })} className={btn}><Plus className="size-3.5" /> Novo cupom</button>
      <ul className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card">
        {coupons.map((c) => (
          <li key={c.code} className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.code}</p>
              <p className="text-xs text-muted-foreground">{c.percent}% de desconto · {c.active ? "ativo" : "inativo"}</p>
            </div>
            <button onClick={() => setEditing({ code: c.code, percent: String(c.percent), active: c.active })} aria-label={`Editar ${c.code}`} className="rounded-full p-2 hover:bg-secondary"><Pencil className="size-4" /></button>
            <button onClick={async () => { if (!confirm(`Excluir o cupom ${c.code}?`)) return; try { await deleteCoupon({ data: { code: c.code } }); toast.success("Cupom excluído"); load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } }} aria-label={`Excluir ${c.code}`} className="rounded-full p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
