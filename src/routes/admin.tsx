import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { brl, type Product } from "@/data/catalog";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteCategory, deleteCoupon, deletePhrase, deleteProduct,
  getMyRole, listAdminCategories, listAdminCoupons, listAdminPhrases, listAdminProducts, listCustomers, listOrders, saveCustomer,
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

type Tab = "dashboard" | "pedidos" | "clientes" | "produtos" | "categorias" | "frases" | "cupons" | "seguranca";

function Admin() {
  const [stage, setStage] = useState<"loading" | "login" | "denied" | "ok">("loading");
  const [tab, setTab] = useState<Tab>("dashboard");

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
    { id: "dashboard", label: "Visão geral" },
    { id: "pedidos", label: "Pedidos" },
    { id: "clientes", label: "Clientes" },
    { id: "produtos", label: "Produtos" },
    { id: "categorias", label: "Categorias" },
    { id: "frases", label: "Frases" },
    { id: "cupons", label: "Cupons" },
    { id: "seguranca", label: "Segurança" },
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
        {tab === "dashboard" && <DashboardTab onNavigate={setTab} />}
        {tab === "pedidos" && <OrdersTab />}
        {tab === "clientes" && <CustomersTab />}
        {tab === "produtos" && <ProductsTab />}
        {tab === "categorias" && <CategoriesTab />}
        {tab === "frases" && <PhrasesTab />}
        {tab === "cupons" && <CouponsTab />}
        {tab === "seguranca" && <PasswordTab />}
      </div>
    </div>
  );
}

type DashboardOrder = Awaited<ReturnType<typeof listOrders>>[number];
type DashboardProduct = Awaited<ReturnType<typeof listAdminProducts>>[number];
type DashboardCategory = Awaited<ReturnType<typeof listAdminCategories>>[number];
type DashboardCustomer = Awaited<ReturnType<typeof listCustomers>>["customers"][number];

function DashboardTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [customers, setCustomers] = useState<DashboardCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextOrders, nextProducts, nextCategories, nextCustomers] = await Promise.all([
        listOrders(),
        listAdminProducts(),
        listAdminCategories(),
        listCustomers(),
      ]);
      setOrders(nextOrders);
      setProducts(nextProducts);
      setCategories(nextCategories);
      setCustomers(nextCustomers.customers);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o resumo da loja.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;

  const pendingOrders = orders.filter((order) => order.status === "pending").length;
  const publishedProducts = products.filter((product) => product.published).length;
  const hiddenProducts = products.length - publishedProducts;
  const stats = [
    { label: "Encomendas", value: orders.length, detail: "Solicitações registradas" },
    { label: "Aguardando confirmação", value: pendingOrders, detail: "Pedidos em aberto" },
    { label: "Produtos publicados", value: publishedProducts, detail: hiddenProducts + " ocultos" },
    { label: "Categorias", value: categories.length, detail: "Organização do catálogo" },
    { label: "Clientes identificados", value: customers.length, detail: "Agrupados pelo histórico de pedidos" },
  ];
  const shortcuts: { id: Tab; label: string }[] = [
    { id: "pedidos", label: "Gerenciar encomendas" },
    { id: "clientes", label: "Consultar clientes" },
    { id: "produtos", label: "Gerenciar produtos" },
    { id: "categorias", label: "Gerenciar categorias" },
    { id: "cupons", label: "Gerenciar cupons" },
    { id: "frases", label: "Gerenciar frases" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Operação da loja</p>
          <h2 className="mt-1 text-3xl">Visão geral</h2>
          <p className="mt-2 text-sm text-muted-foreground">Acompanhe encomendas, catálogo e atividade administrativa da PapeLemi.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={refreshing} className={btnGhost}>
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Atualizar dados
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium">Encomendas recentes</h3>
              <p className="text-xs text-muted-foreground">Últimas solicitações recebidas</p>
            </div>
            <button type="button" onClick={() => onNavigate("pedidos")} className="text-xs text-primary underline underline-offset-4">Ver pedidos</button>
          </div>
          {orders.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma encomenda registrada ainda.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {orders.slice(0, 5).map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{order.customer_name || "Cliente"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">{brl(Number(order.total))}</p>
                    <p className="text-xs text-muted-foreground">{order.status === "pending" ? "Aguardando confirmação" : order.status === "paid" ? "Pago" : order.status === "shipped" ? "Enviado" : order.status === "delivered" ? "Entregue" : order.status === "cancelled" ? "Cancelado" : order.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-lg font-medium">Atalhos de gestão</h3>
          <p className="text-xs text-muted-foreground">Acesse as rotinas disponíveis no painel.</p>
          <div className="mt-4 grid gap-2">
            {shortcuts.map((shortcut) => (
              <button key={shortcut.id} type="button" onClick={() => onNavigate(shortcut.id)} className="rounded-xl border border-border px-4 py-3 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5">
                {shortcut.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error("E-mail ou senha incorretos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-24">
      <p className="text-center text-xs uppercase tracking-[0.2em] text-primary">PapeLemi</p>
      <h1 className="mt-2 text-center text-4xl">Painel administrativo</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">Acesso restrito à equipe autorizada.</p>
      <form onSubmit={submit} className="mt-8 space-y-3">
        <input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" aria-label="E-mail" className={input} />
        <input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" aria-label="Senha" className={input} />
        <button type="submit" disabled={busy} className={cn(btn, "w-full justify-center py-3 text-sm")}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Contas administrativas são provisionadas pelo proprietário; não há cadastro público neste painel.
      </p>
      <p className="mt-4 text-center text-xs text-muted-foreground"><Link to="/" className="underline">Voltar à loja</Link></p>
    </div>
  );
}

function PasswordTab() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 12) {
      toast.error("Use uma senha com pelo menos 12 caracteres.");
      return;
    }
    if (password !== confirmation) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirmation("");
      toast.success("Senha atualizada com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="max-w-2xl rounded-2xl border border-border bg-card p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-primary">Segurança</p>
      <h2 className="mt-2 text-2xl">Alterar senha</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Atualize a senha da conta administrativa. Recomendamos uma senha exclusiva, longa e armazenada em um gerenciador de senhas.
      </p>
      <form onSubmit={save} className="mt-6 space-y-4">
        <label className="block text-sm">
          Nova senha
          <input required type="password" autoComplete="new-password" minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} className={cn(input, "mt-1")} />
        </label>
        <label className="block text-sm">
          Confirmar nova senha
          <input required type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={cn(input, "mt-1")} />
        </label>
        <button type="submit" disabled={busy} className={btn}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Atualizar senha
        </button>
      </form>
    </section>
  );
}

// ===== Pedidos =====

type Order = Awaited<ReturnType<typeof listOrders>>[number];
const ORDER_STATUS: Record<string, string> = { pending: "Recebido / aguardando confirmação", paid: "Pago", shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado" };

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
            Subtotal {brl(Number(o.subtotal))} · Frete {Number(o.shipping) === 0 ? "A confirmar" : brl(Number(o.shipping))}
            {Number(o.discount) > 0 && <> · Cupom {o.coupon_code} (−{brl(Number(o.discount))})</>}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ===== Clientes =====

// Diretório do CRM relacional da PapeLemi, com histórico de pedidos vinculado.
type Customer = Awaited<ReturnType<typeof listCustomers>>["customers"][number];

type CustomerForm = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  city: string;
  state: string;
  status: "active" | "inactive";
  tags: string;
  notes: string;
};

const EMPTY_CUSTOMER_FORM: CustomerForm = {
  name: "", email: "", phone: "", whatsapp: "", city: "", state: "",
  status: "active", tags: "", notes: "",
};

const CUSTOMER_ACCOUNT_STATUS: Record<string, string> = { active: "Ativo", inactive: "Inativo" };

const CUSTOMER_STATUS: Record<string, string> = {
  pending: "Aguardando confirmação",
  paid: "Pago",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  no_orders: "Sem pedidos",
};

function CustomersTab() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<CustomerForm | null>(null);
  const [saving, setSaving] = useState(false);

  const editCustomer = (customer: Customer) => setForm({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    city: customer.city,
    state: customer.state,
    status: customer.status === "inactive" ? "inactive" : "active",
    tags: customer.tags.join(", "),
    notes: customer.notes,
  });

  const submitCustomer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    try {
      const tags = [...new Set(form.tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
      await saveCustomer({ data: {
        id: form.id,
        name: form.name,
        email: form.email,
        phone: form.phone,
        whatsapp: form.whatsapp,
        city: form.city,
        state: form.state,
        status: form.status,
        tags,
        notes: form.notes,
      } });
      toast.success(form.id ? "Cadastro do cliente atualizado." : "Cliente cadastrado.");
      setForm(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  };

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await listCustomers();
      setCustomers(result.customers);
      setTruncated(result.truncated);
    } catch (error) {
      setCustomers([]);
      setTruncated(false);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os clientes.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!customers) {
    return <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  }

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = customers.filter((customer) =>
    [customer.name, customer.email, customer.phone, customer.whatsapp, customer.city, customer.state, customer.tags.join(" ")].some((value) =>
      value.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
    ),
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Relacionamento</p>
          <h2 className="mt-1 text-3xl">Clientes</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastros persistentes do CRM da PapeLemi, com histórico de pedidos vinculado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setForm({ ...EMPTY_CUSTOMER_FORM })} className={btn}>
            <Plus className="size-3.5" /> Novo cliente
          </button>
          <button type="button" onClick={() => void load()} disabled={refreshing} className={btnGhost}>
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Atualizar
          </button>
        </div>
      </div>

      {form && (
        <form onSubmit={submitCustomer} className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-medium">{form.id ? "Editar cliente" : "Novo cliente"}</h3>
              <p className="text-xs text-muted-foreground">O cadastro fica restrito à loja PapeLemi.</p>
            </div>
            <button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancelar</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm sm:col-span-2 lg:col-span-1">Nome
              <input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={cn(input, "mt-1 w-full")} />
            </label>
            <label className="block text-sm">E-mail
              <input type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={cn(input, "mt-1 w-full")} />
            </label>
            <label className="block text-sm">Telefone
              <input maxLength={40} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={cn(input, "mt-1 w-full")} />
            </label>
            <label className="block text-sm">WhatsApp
              <input maxLength={40} value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} className={cn(input, "mt-1 w-full")} />
            </label>
            <label className="block text-sm">Cidade
              <input maxLength={100} value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className={cn(input, "mt-1 w-full")} />
            </label>
            <label className="block text-sm">UF
              <input maxLength={2} value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value.toUpperCase() })} className={cn(input, "mt-1 w-full")} />
            </label>
            <label className="block text-sm">Situação do cadastro
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CustomerForm["status"] })} className={cn(input, "mt-1 w-full")}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">Tags (separadas por vírgula)
              <input maxLength={640} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="Ex.: recorrente, presente, corporativo" className={cn(input, "mt-1 w-full")} />
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-3">Observações internas
              <textarea rows={3} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={cn(input, "mt-1 w-full resize-y")} />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className={btnGhost}>Cancelar</button>
            <button type="submit" disabled={saving} className={btn}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {form.id ? "Salvar alterações" : "Cadastrar cliente"}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, e-mail ou telefone"
          aria-label="Buscar clientes"
          className={cn(input, "min-w-0 flex-1 sm:max-w-md")}
        />
        <p className="text-xs text-muted-foreground">{filtered.length} de {customers.length} clientes</p>
      </div>

      {truncated && (
        <p role="status" className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          O histórico consultado atingiu o limite de 20.000 pedidos. Esta lista pode não incluir clientes mais antigos.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-medium">{customers.length === 0 ? "Nenhum cliente identificado ainda." : "Nenhum cliente encontrado."}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {customers.length === 0 ? "Os contatos aparecerão aqui quando houver encomendas registradas." : "Experimente outro nome, e-mail ou telefone."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Pedidos</th>
                  <th className="px-4 py-3 font-medium">Última encomenda</th>
                  <th className="px-4 py-3 font-medium">Status recente</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((customer) => (
                  <tr key={customer.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{customer.name || "Cliente sem nome"}</p>
                      {customer.email ? <a href={`mailto:${customer.email}`} className="text-xs text-muted-foreground underline underline-offset-2">{customer.email}</a> : <span className="text-xs text-muted-foreground">E-mail não informado</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{customer.phone || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{customer.ordersCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(customer.lastOrderAt).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span>{CUSTOMER_STATUS[customer.lastOrderStatus] ?? customer.lastOrderStatus}</span>
                      <span className="mt-1 block text-xs">{CUSTOMER_ACCOUNT_STATUS[customer.status] ?? customer.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => editCustomer(customer)} className={btnGhost} aria-label={"Editar cliente " + customer.name}>
                        <Pencil className="size-3.5" /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 md:hidden">
            {filtered.map((customer) => (
              <li key={customer.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="font-medium">{customer.name || "Cliente sem nome"}</p>
                {customer.email ? <a href={`mailto:${customer.email}`} className="mt-1 block break-all text-xs text-muted-foreground underline underline-offset-2">{customer.email}</a> : <span className="mt-1 block text-xs text-muted-foreground">E-mail não informado</span>}
                <p className="mt-2 text-sm text-muted-foreground">{customer.phone || "Telefone não informado"}</p>
                <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>{customer.ordersCount} pedido(s)</span>
                  <span>Último: {new Date(customer.lastOrderAt).toLocaleDateString("pt-BR")}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {CUSTOMER_STATUS[customer.lastOrderStatus] ?? customer.lastOrderStatus} · {CUSTOMER_ACCOUNT_STATUS[customer.status] ?? customer.status}
                </p>
                <button type="button" onClick={() => editCustomer(customer)} className={cn(btnGhost, "mt-3 w-full justify-center")}>
                  <Pencil className="size-3.5" /> Editar cadastro
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
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
