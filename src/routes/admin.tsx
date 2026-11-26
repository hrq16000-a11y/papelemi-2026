import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Eye, EyeOff, Loader2, LogOut, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { brl, type PersonalizationOption } from "@/data/catalog";
import type { OrderStatus } from "@/lib/order-admin-validation";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteCategory, deleteCoupon, deletePhrase, deleteProduct,
  getMyRole, getOrderDetails, listAdminCategories, listAdminCoupons, listAdminPhrases, listAdminProducts, listCustomers, listOrders,
  archiveCategory, archiveProduct, restoreCategory, restoreProduct, setCategoryActive, setProductPublished,
  saveCategory, saveCoupon, saveCustomer, savePhrase, saveProduct, setOrderStatus, updateOrderOperations,
} from "@/lib/shop.functions";
import { cn } from "@/lib/utils";
import ShippingAdminPanel from "@/components/admin/ShippingAdminPanel";

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

type Tab = "dashboard" | "pedidos" | "clientes" | "produtos" | "categorias" | "frases" | "cupons" | "fretes" | "seguranca";

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
    { id: "fretes", label: "Fretes" },
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
        {tab === "fretes" && <ShippingAdminPanel />}
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
type OrderDetail = Awaited<ReturnType<typeof getOrderDetails>>;
type OrderOperationsForm = { status: OrderStatus; shippingMethod: string; shippingCompany: string; shippingDays: string; shippingPrice: string; trackingCode: string; trackingCarrier: string; trackingUrl: string; notes: string; };
const ORDER_STATUS: Record<OrderStatus, string> = {
  pending: "Recebido / aguardando confirmação",
  paid: "Pago",
  confirmed: "Confirmado",
  processing: "Em produção",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

function formatOrderDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR");
}

function displayOrderValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "";
  return JSON.stringify(value);
}

function OrdersTab() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [operationsForm, setOperationsForm] = useState<OrderOperationsForm | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await listOrders();
      setOrders(result);
    } catch (error) {
      setOrders([]);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os pedidos.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openDetails = async (id: string) => {
    setSelectedOrderId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const result = await getOrderDetails({ data: { id } });
      setDetail(result);
      setOperationsForm({
        status: result.order.status as OrderStatus,
        shippingMethod: result.order.shipping_method || "A combinar",
        shippingCompany: result.order.shipping_company || "",
        shippingDays: result.order.shipping_days || "",
        shippingPrice: String(result.order.shipping_price ?? result.order.shipping ?? 0),
        trackingCode: result.order.tracking_code || "",
        trackingCarrier: result.order.tracking_carrier || "",
        trackingUrl: result.order.tracking_url || "",
        notes: result.order.notes || "",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os detalhes do pedido.");
      setSelectedOrderId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const updateStatus = async (id: string, status: OrderStatus) => {
    setUpdatingId(id);
    try {
      await setOrderStatus({ data: { id, status } });
      setOrders((current) => current?.map((order) => order.id === id ? { ...order, status } : order) ?? null);
      toast.success("Status do pedido atualizado.");
      if (selectedOrderId === id) await openDetails(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const saveOperations = async () => {
    if (!detail || !operationsForm || updatingId) return;
    setUpdatingId(detail.order.id);
    try {
      await updateOrderOperations({ data: { id: detail.order.id, ...operationsForm, shippingPrice: Number(operationsForm.shippingPrice) } });
      toast.success("Operação e dados de entrega atualizados.");
      await load();
      await openDetails(detail.order.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o pedido.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!orders) return <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = orders.filter((order) => {
    const matchesSearch = [order.id, order.customer_name, order.customer_email, order.customer_phone]
      .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    return matchesSearch && (statusFilter === "all" || order.status === statusFilter);
  });
  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const paidCount = orders.filter((order) => order.status === "paid").length;
  const fulfillmentCount = orders.filter((order) => order.status === "shipped" || order.status === "delivered").length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Operação comercial</p>
          <h2 className="mt-1 text-3xl">Pedidos</h2>
          <p className="mt-2 text-sm text-muted-foreground">Acompanhe pagamentos, itens, personalizações, entrega e dados de cada encomenda.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={refreshing} className={btnGhost}>
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : null} Atualizar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Pedidos registrados", value: orders.length },
          { label: "Aguardando confirmação", value: pendingCount },
          { label: "Pagos", value: paidCount },
          { label: "Em entrega / entregues", value: fulfillmentCount },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar pedidos</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por protocolo, cliente, e-mail ou telefone" className={cn(input, "w-full")} />
        </label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar pedidos por status" className={cn(input, "sm:w-64")}>
          <option value="all">Todos os status</option>
          {Object.entries(ORDER_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} de {orders.length} pedidos encontrados · consulta limitada aos 200 mais recentes</p>

      {selectedOrderId && (
        <div className="rounded-2xl border border-primary/30 bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-primary">Ficha completa</p>
              <h3 className="mt-1 text-xl font-semibold">Pedido {detail?.order.order_code || selectedOrderId.slice(0, 8).toUpperCase()}</h3>
            </div>
            <button type="button" onClick={() => { setSelectedOrderId(null); setDetail(null); }} className={btnGhost}>Fechar detalhes</button>
          </div>
          {detailLoading ? (
            <div className="flex min-h-28 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
          ) : detail ? (() => {
            const address = detail.order.address && typeof detail.order.address === "object" && !Array.isArray(detail.order.address)
              ? detail.order.address as Record<string, unknown>
              : {};
            const shippingSelection = address["shipping"] && typeof address["shipping"] === "object" && !Array.isArray(address["shipping"])
              ? address["shipping"] as Record<string, unknown>
              : {};
            return (
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <section>
                    <h4 className="text-sm font-semibold">Cliente</h4>
                    <p className="mt-2 text-sm">{detail.order.customer_name}</p>
                    <p className="text-sm text-muted-foreground">{detail.order.customer_email}</p>
                    <p className="text-sm text-muted-foreground">{detail.order.customer_phone || "Telefone não informado"}</p>
                    {detail.order.customer_id ? <p className="mt-1 break-all text-xs text-muted-foreground">Cadastro CRM: {detail.order.customer_id}</p> : null}
                  </section>
                  <section className="border-t border-border pt-4">
                    <h4 className="text-sm font-semibold">Entrega</h4>
                    <p className="mt-2 text-sm">{[detail.order.address_street || address["street"], detail.order.address_number || address["number"], detail.order.address_complement || address["complement"]].filter(Boolean).map(displayOrderValue).join(", ") || "Endereço não informado"}</p>
                    <p className="text-sm text-muted-foreground">{[detail.order.address_neighborhood || address["district"], detail.order.address_city || address["city"], detail.order.address_state || address["state"]].filter(Boolean).map(displayOrderValue).join(" · ")}</p>
                    <p className="text-sm text-muted-foreground">CEP: {detail.order.address_cep || displayOrderValue(address["cep"]) || "—"}</p>
                    <p className="mt-2 text-sm">Frete: {shippingSelection["requires_confirmation"] ? "A confirmar" : Number(detail.order.shipping) === 0 ? "Grátis" : brl(Number(detail.order.shipping))}</p>
                    <p className="text-sm text-muted-foreground">Modalidade: {detail.order.shipping_method || displayOrderValue(shippingSelection["provider"]) || "Frete a combinar"} · {detail.order.shipping_company || displayOrderValue(shippingSelection["service_name"]) || "Transportadora a definir"}</p>
                    <p className="text-sm text-muted-foreground">Prazo: {detail.order.shipping_days || displayOrderValue(shippingSelection["estimated_delivery_days"]) || "A confirmar"}{shippingSelection["estimated"] ? " · estimativa" : ""}</p>
                    {detail.order.tracking_code ? <p className="mt-2 text-sm">Rastreamento: <span className="font-mono">{detail.order.tracking_code}</span></p> : null}
                    {detail.order.tracking_url ? <a className="text-xs text-primary underline" href={detail.order.tracking_url} target="_blank" rel="noreferrer">Abrir rastreamento</a> : null}
                    {shippingSelection["pickup_address"] ? <p className="text-xs text-muted-foreground">Retirada: {displayOrderValue(shippingSelection["pickup_address"])}</p> : null}
                    {shippingSelection["pickup_instructions"] ? <p className="text-xs text-muted-foreground">{displayOrderValue(shippingSelection["pickup_instructions"])}</p> : null}
                  </section>
                  <section className="border-t border-border pt-4">
                    <h4 className="text-sm font-semibold">Observações da encomenda</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{detail.order.customer_notes || "Nenhuma observação informada."}</p>
                  </section>
                </div>
                <div className="space-y-4">
                  <section>
                    <h4 className="text-sm font-semibold">Itens e personalizações</h4>
                    {detail.items.length ? (
                      <ul className="mt-2 space-y-3">
                        {detail.items.map((item) => {
                          const personalization = item.personalization && typeof item.personalization === "object" && !Array.isArray(item.personalization)
                            ? item.personalization as Record<string, unknown>
                            : {};
                          return (
                            <li key={item.id} className="rounded-xl border border-border p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div><p className="text-sm font-medium">{item.quantity}× {item.product_name}</p><p className="text-xs text-muted-foreground">{item.product_slug || "Produto"}</p></div>
                                <p className="text-sm font-medium">{brl(Number(item.line_total))}</p>
                              </div>
                              {Object.entries(personalization).filter(([, value]) => value != null && value !== "").map(([key, value]) => <p key={key} className="mt-1 text-xs text-muted-foreground">{key}: {displayOrderValue(value)}</p>)}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">Os itens normalizados ainda não estão disponíveis para este pedido.</p>
                    )}
                  </section>
                  <section className="border-t border-border pt-4">
                    <h4 className="text-sm font-semibold">Resumo financeiro</h4>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <p className="flex justify-between"><span>Subtotal</span><span>{brl(Number(detail.order.subtotal))}</span></p>
                      <p className="flex justify-between"><span>Desconto</span><span>{brl(Number(detail.order.discount))}</span></p>
                      <p className="flex justify-between"><span>Frete</span><span>{brl(Number(detail.order.shipping))}</span></p>
                      <p className="flex justify-between border-t border-border pt-2 font-semibold text-foreground"><span>Total</span><span>{brl(Number(detail.order.total))}</span></p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Cupom: {detail.order.coupon_code || "Não utilizado"}</p>
                    <p className="text-xs text-muted-foreground">Situação do pagamento: {detail.order.payment_status === "approved" ? "Aprovado" : detail.order.payment_status === "refunded" ? "Estornado" : detail.order.payment_status === "cancelled" ? "Cancelado" : detail.order.status === "paid" ? "Pago — aguardando conciliação" : "Pendente"}</p>
                    <p className="text-xs text-muted-foreground">Forma: {detail.order.payment_method || "Não informada"} · ID: {detail.order.payment_id || detail.order.mp_payment_id || "Aguardando"}</p>
                    {detail.order.paid_at ? <p className="text-xs text-muted-foreground">Pago em {formatOrderDate(detail.order.paid_at)}</p> : null}
                    <p className="text-xs text-muted-foreground">Pagamento Mercado Pago: {detail.order.mp_payment_id || "Ainda sem identificador"}</p>
                  </section>
                  <section className="border-t border-border pt-4">
                    <h4 className="text-sm font-semibold">Registro e privacidade</h4>
                    <p className="mt-2 text-xs text-muted-foreground">Criado em {formatOrderDate(detail.order.created_at)} · Origem: {detail.order.source}</p>
                    <p className="text-xs text-muted-foreground">Consentimento: {detail.order.accepted_privacy ? "Aceito" : "Não registrado"}{detail.order.privacy_consent_at ? ` em ${formatOrderDate(detail.order.privacy_consent_at)}` : ""}</p>
                  </section>
                </div>
                <div className="lg:col-span-2 grid gap-4 md:grid-cols-2">
                  <section className="rounded-xl border border-border p-3">
                    <h4 className="text-sm font-semibold">Histórico de status</h4>
                    {detail.history.length ? <ol className="mt-2 space-y-2">{detail.history.map((entry) => (
                      <li key={entry.id} className="border-l-2 border-primary/30 pl-3">
                        <p className="text-sm font-medium">{ORDER_STATUS[entry.to_status as OrderStatus] || entry.to_status}</p>
                        <p className="text-xs text-muted-foreground">{entry.note || "Alteração registrada"} · {formatOrderDate(entry.created_at)}</p>
                      </li>
                    ))}</ol> : <p className="mt-2 text-xs text-muted-foreground">Nenhuma alteração de status registrada.</p>}
                  </section>
                  <section className="rounded-xl border border-border p-3">
                    <h4 className="text-sm font-semibold">Eventos de pagamento</h4>
                    {detail.paymentEvents.length ? <ul className="mt-2 space-y-2">{detail.paymentEvents.map((event) => (
                      <li key={event.id} className="rounded-lg bg-muted/40 p-3 text-xs">
                        <p className="font-medium">{event.provider} · {event.provider_status || "status não informado"} · {event.result}</p>
                        <p className="mt-1 text-muted-foreground">Pagamento {event.payment_id} · {formatOrderDate(event.created_at)}</p>
                        {event.error_message ? <p className="mt-1 text-destructive">{event.error_message}</p> : null}
                      </li>
                    ))}</ul> : <p className="mt-2 text-xs text-muted-foreground">Nenhum evento de pagamento registrado.</p>}
                  </section>
                  <section className="rounded-xl border border-border p-3">
                    <h4 className="text-sm font-semibold">E-mails de rastreamento</h4>
                    {detail.trackingEmails.length ? <ul className="mt-2 space-y-2">{detail.trackingEmails.map((email) => (
                      <li key={email.id} className="text-xs text-muted-foreground">
                        {email.email_type} · {email.status} · {email.recipient_email} · {formatOrderDate(email.created_at)}
                        {email.error_message ? <span className="text-destructive"> · {email.error_message}</span> : null}
                      </li>
                    ))}</ul> : <p className="mt-2 text-xs text-muted-foreground">Nenhum envio de rastreamento registrado.</p>}
                    {detail.notifications.length ? <ul className="mt-2 space-y-1">{detail.notifications.map((notification) => (
                      <li key={notification.id} className="text-xs text-muted-foreground">
                        {notification.channel} · {notification.status} · {notification.success ? "Enviado" : "Pendente/falhou"} · {formatOrderDate(notification.created_at)}
                      </li>
                    ))}</ul> : null}
                  </section>
                </div>
            {operationsForm ? (
              <form onSubmit={(event) => { event.preventDefault(); void saveOperations(); }} className="lg:col-span-2 mt-6 space-y-4 border-t border-border pt-5">
                <div><h4 className="text-sm font-semibold">Atualizar operação do pedido</h4><p className="mt-1 text-xs text-muted-foreground">A alteração é auditada e o total é recalculado quando o frete muda.</p></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="text-xs text-muted-foreground">Status
                    <select value={operationsForm.status} onChange={(e) => setOperationsForm({ ...operationsForm, status: e.target.value as OrderStatus })} className={cn(input, "mt-1")}>
                      {Object.entries(ORDER_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">Modalidade de envio<input value={operationsForm.shippingMethod} onChange={(e) => setOperationsForm({ ...operationsForm, shippingMethod: e.target.value })} className={cn(input, "mt-1")} required /></label>
                  <label className="text-xs text-muted-foreground">Transportadora<input value={operationsForm.shippingCompany} onChange={(e) => setOperationsForm({ ...operationsForm, shippingCompany: e.target.value })} className={cn(input, "mt-1")} /></label>
                  <label className="text-xs text-muted-foreground">Prazo informado<input value={operationsForm.shippingDays} onChange={(e) => setOperationsForm({ ...operationsForm, shippingDays: e.target.value })} className={cn(input, "mt-1")} placeholder="Ex.: 3 a 5 dias úteis" /></label>
                  <label className="text-xs text-muted-foreground">Valor do frete (R$)<input type="number" min="0" max="99999" step="0.01" value={operationsForm.shippingPrice} onChange={(e) => setOperationsForm({ ...operationsForm, shippingPrice: e.target.value })} className={cn(input, "mt-1")} required /></label>
                  <label className="text-xs text-muted-foreground">Código de rastreio<input value={operationsForm.trackingCode} onChange={(e) => setOperationsForm({ ...operationsForm, trackingCode: e.target.value })} className={cn(input, "mt-1")} /></label>
                  <label className="text-xs text-muted-foreground">Transportadora do rastreio<input value={operationsForm.trackingCarrier} onChange={(e) => setOperationsForm({ ...operationsForm, trackingCarrier: e.target.value })} className={cn(input, "mt-1")} /></label>
                  <label className="text-xs text-muted-foreground sm:col-span-2">URL de rastreamento (HTTPS)<input type="url" value={operationsForm.trackingUrl} onChange={(e) => setOperationsForm({ ...operationsForm, trackingUrl: e.target.value })} className={cn(input, "mt-1")} placeholder="https://..." /></label>
                  <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">Observações administrativas<textarea rows={3} value={operationsForm.notes} onChange={(e) => setOperationsForm({ ...operationsForm, notes: e.target.value })} className={cn(input, "mt-1")} /></label>
                </div>
                <div className="flex justify-end"><button type="submit" disabled={updatingId === detail.order.id} className={btn}>{updatingId === detail.order.id ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar operação</button></div>
              </form>
            ) : null}
              </div>
            );
          })() : <p className="py-8 text-sm text-muted-foreground">Não foi possível carregar os detalhes deste pedido.</p>}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-medium">{orders.length ? "Nenhum pedido encontrado." : "Nenhum pedido registrado ainda."}</p>
          <p className="mt-2 text-sm text-muted-foreground">{orders.length ? "Ajuste a busca ou o filtro de status." : "As encomendas aparecerão aqui assim que um cliente concluir o checkout."}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((order) => (
            <li key={order.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{order.customer_name} <span className="break-all text-xs font-normal text-muted-foreground">· {order.customer_email}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatOrderDate(order.created_at)} · pedido {order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="mt-2 text-sm font-semibold">{brl(Number(order.total))}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={order.status} disabled={updatingId === order.id} onChange={(event) => void updateStatus(order.id, event.target.value as OrderStatus)} aria-label={"Status do pedido " + order.id.slice(0, 8)} className={cn(input, "min-w-0 flex-1 sm:w-64")}>
                    {Object.entries(ORDER_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" onClick={() => void openDetails(order.id)} className={btnGhost}>Ver pedido</button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <span>{Array.isArray(order.items) ? order.items.length : 0} item(ns) · Frete {Number(order.shipping) === 0 ? "a confirmar" : brl(Number(order.shipping))}</span>
                <span>{order.customer_phone || "Telefone não informado"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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
type AdminCategory = Awaited<ReturnType<typeof listAdminCategories>>[number];
const catalogPageSize = 10;
function CatalogPagination({ page, total, onPage }: { page: number; total: number; onPage: (next: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / catalogPageSize));
  return <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-muted-foreground"><span>{total === 0 ? "Nenhum registro" : `Página ${page} de ${pages} · ${total} registro(s)`}</span><div className="flex gap-2"><button type="button" className={btnGhost} disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><button type="button" className={btnGhost} disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button></div></div>;
}
type ProductForm = {
  originalSlug?: string;
  slug: string; categorySlug: string; name: string; description: string; images: string;
  price: string; promoPrice: string; colors: string; sizes: string; finishes: string;
  productionDays: string; stock: string; published: boolean; bestSeller: boolean; personalizable: boolean; minQty: string;
  personalization: PersonalizationOption[];
  weightKg: string; lengthCm: string; widthCm: string; heightCm: string; requiresShipping: boolean;
};

const emptyProduct: ProductForm = {
  slug: "", categorySlug: "", name: "", description: "", images: "", price: "", promoPrice: "",
  colors: "", sizes: "", finishes: "", productionDays: "", stock: "0", published: true,
  bestSeller: false, personalizable: false, minQty: "", personalization: [],
  weightKg: "", lengthCm: "", widthCm: "", heightCm: "", requiresShipping: true,
};

const toForm = (p: AdminProduct): ProductForm => ({
  originalSlug: p.slug,
  slug: p.slug, categorySlug: p.category, name: p.name, description: p.description,
  images: p.images.join("\n"), price: String(p.price), promoPrice: p.promoPrice == null ? "" : String(p.promoPrice),
  colors: p.colors.join(", "), sizes: p.sizes.join(", "), finishes: p.finishes.join(", "),
  productionDays: p.productionDays, stock: String(p.stock), published: p.published,
  bestSeller: p.bestSeller ?? false, personalizable: p.personalizable, minQty: p.minQty == null ? "" : String(p.minQty),
  personalization: p.personalization ?? [],
  weightKg: p.weightKg == null ? "" : String(p.weightKg),
  lengthCm: p.lengthCm == null ? "" : String(p.lengthCm),
  widthCm: p.widthCm == null ? "" : String(p.widthCm),
  heightCm: p.heightCm == null ? "" : String(p.heightCm),
  requiresShipping: p.requiresShipping !== false,
});

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function ProductsTab() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [editing, setEditing] = useState<ProductForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [status, setStatus] = useState<"all" | "published" | "hidden" | "archived">("all");
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    try { const [nextProducts, nextCategories] = await Promise.all([listAdminProducts(), listAdminCategories()]); setProducts(nextProducts); setCats(nextCategories); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar o catálogo."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const result = (products ?? []).filter((product) => {
      if (term && !product.name.toLocaleLowerCase("pt-BR").includes(term) && !product.slug.toLocaleLowerCase("pt-BR").includes(term)) return false;
      if (categoryFilter !== "all" && product.category !== categoryFilter) return false;
      if (status === "published" && (!product.published || product.archivedAt)) return false;
      if (status === "hidden" && (product.published || product.archivedAt)) return false;
      if (status === "archived" && !product.archivedAt) return false;
      return true;
    });
    return result.sort((a,b) => sort === "name-desc" ? b.name.localeCompare(a.name,"pt-BR") : sort === "price-asc" ? a.price-b.price : sort === "price-desc" ? b.price-a.price : sort === "stock-asc" ? (a.stock??0)-(b.stock??0) : sort === "stock-desc" ? (b.stock??0)-(a.stock??0) : a.name.localeCompare(b.name,"pt-BR"));
  }, [products,search,categoryFilter,status,sort]);
  const totalPages = Math.max(1,Math.ceil(filteredProducts.length/catalogPageSize));
  const visibleProducts = filteredProducts.slice((page-1)*catalogPageSize,page*catalogPageSize);
  useEffect(() => { if(page>totalPages)setPage(totalPages); },[page,totalPages]);
  const runAction = async (slug:string,action:()=>Promise<unknown>,success:string) => {
    setBusySlug(slug);
    try { await action(); toast.success(success); await load(); }
    catch(error) { toast.error(error instanceof Error?error.message:"Não foi possível concluir a operação."); }
    finally { setBusySlug(null); }
  };

  const updatePersonalizationIdentity = (index: number, property: "key" | "label", value: string) => {
    setEditing((current) => current ? {
      ...current,
      personalization: current.personalization.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [property]: value } : field,
      ),
    } : current);
  };

  const changePersonalizationType = (index: number, type: PersonalizationOption["type"]) => {
    setEditing((current) => {
      if (!current) return current;
      const field = current.personalization[index];
      if (!field) return current;
      const common = { key: field.key, label: field.label };
      const next: PersonalizationOption = type === "text"
        ? { ...common, type: "text", maxLength: 140 }
        : type === "choice"
          ? { ...common, type: "choice", options: [] }
          : { ...common, type: "notes" };
      return {
        ...current,
        personalization: current.personalization.map((item, fieldIndex) => fieldIndex === index ? next : item),
      };
    });
  };

  const updatePersonalizationText = (index: number, patch: { maxLength?: number; ai?: boolean }) => {
    setEditing((current) => current ? {
      ...current,
      personalization: current.personalization.map((field, fieldIndex) =>
        fieldIndex === index && field.type === "text" ? { ...field, ...patch } : field,
      ),
    } : current);
  };

  const updatePersonalizationChoices = (index: number, value: string) => {
    setEditing((current) => current ? {
      ...current,
      personalization: current.personalization.map((field, fieldIndex) =>
        fieldIndex === index && field.type === "choice"
          ? { ...field, options: value.split("\n").map((option) => option.trim()).filter(Boolean).slice(0, 50) }
          : field,
      ),
    } : current);
  };

  const addPersonalizationField = () => {
    setEditing((current) => {
      if (!current) return current;
      let suffix = current.personalization.length + 1;
      while (current.personalization.some((field) => field.key === "campo-" + suffix)) suffix += 1;
      return {
        ...current,
        personalization: [
          ...current.personalization,
          { type: "text", key: "campo-" + suffix, label: "Campo " + suffix, maxLength: 140 },
        ],
      };
    });
  };

  const removePersonalizationField = (index: number) => {
    setEditing((current) => current ? {
      ...current,
      personalization: current.personalization.filter((_, fieldIndex) => fieldIndex !== index),
    } : current);
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await saveProduct({ data: {
        originalSlug: editing.originalSlug, slug: editing.slug, categorySlug: editing.categorySlug, name: editing.name, description: editing.description,
        images: editing.images.split("\n").map((x) => x.trim()).filter(Boolean),
        price: Number(editing.price), promoPrice: editing.promoPrice ? Number(editing.promoPrice) : null,
        colors: split(editing.colors), sizes: split(editing.sizes), finishes: split(editing.finishes),
        productionDays: editing.productionDays, stock: Number(editing.stock) || 0,
        published: editing.published, bestSeller: editing.bestSeller, personalizable: editing.personalizable,
        minQty: editing.minQty ? Number(editing.minQty) : null,
        personalization: editing.personalization,
        weightKg: editing.weightKg.trim() ? Number(editing.weightKg) : null,
        lengthCm: editing.lengthCm.trim() ? Number(editing.lengthCm) : null,
        widthCm: editing.widthCm.trim() ? Number(editing.widthCm) : null,
        heightCm: editing.heightCm.trim() ? Number(editing.heightCm) : null,
        requiresShipping: editing.requiresShipping,
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
      <h2 className="text-2xl">{editing.originalSlug ? "Editar produto" : "Novo produto"}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Identificador (slug)<input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className={cn(input, "mt-1")} placeholder="ex.: caderno-afeto" /></label>
        <label className="text-xs text-muted-foreground">Categoria
          <select value={editing.categorySlug} onChange={(e) => setEditing({ ...editing, categorySlug: e.target.value })} className={cn(input, "mt-1")}>
            <option value="">Escolha…</option>
            {cats.map((c) => <option key={c.slug} value={c.slug} disabled={Boolean(c.archived_at)}>{c.name}{c.archived_at ? " (arquivada)" : ""}</option>)}
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
        <section className="sm:col-span-2 rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Envio e embalagem</p>
              <p className="text-xs text-muted-foreground">Dados usados pelo cálculo de frete. Não informe medidas estimadas como se fossem definitivas.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.requiresShipping} onChange={(e) => setEditing({ ...editing, requiresShipping: e.target.checked })} />
              Exige envio
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-muted-foreground">Peso (kg)
              <input type="number" min="0" max="100" step="0.001" value={editing.weightKg} onChange={(e) => setEditing({ ...editing, weightKg: e.target.value })} className={cn(input, "mt-1")} placeholder="Ex.: 0,250" />
            </label>
            <label className="text-xs text-muted-foreground">Comprimento (cm)
              <input type="number" min="0.1" max="300" step="0.1" value={editing.lengthCm} onChange={(e) => setEditing({ ...editing, lengthCm: e.target.value })} className={cn(input, "mt-1")} />
            </label>
            <label className="text-xs text-muted-foreground">Largura (cm)
              <input type="number" min="0.1" max="300" step="0.1" value={editing.widthCm} onChange={(e) => setEditing({ ...editing, widthCm: e.target.value })} className={cn(input, "mt-1")} />
            </label>
            <label className="text-xs text-muted-foreground">Altura (cm)
              <input type="number" min="0.1" max="300" step="0.1" value={editing.heightCm} onChange={(e) => setEditing({ ...editing, heightCm: e.target.value })} className={cn(input, "mt-1")} />
            </label>
          </div>
        </section>
        <section className="sm:col-span-2 rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Campos de personalização</p>
              <p className="text-xs text-muted-foreground">Configure nome, dedicatória, escolhas e observações que serão validados no servidor.</p>
            </div>
            <button type="button" onClick={addPersonalizationField} className={btnGhost}>
              <Plus className="size-3.5" /> Adicionar campo
            </button>
          </div>
          {!editing.personalizable ? <p className="mt-3 text-xs text-muted-foreground">Ative “Personalizável” para exibir estes campos na página do produto.</p> : null}
          {editing.personalization.length === 0 ? (
            <p className="mt-3 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">Nenhum campo configurado. Produtos personalizáveis precisam de campos para coletar os detalhes da encomenda.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {editing.personalization.map((field, index) => (
                <div key={field.key + "-" + index} className="rounded-xl border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="text-xs text-muted-foreground">Tipo
                      <select value={field.type} onChange={(e) => changePersonalizationType(index, e.target.value as PersonalizationOption["type"])} className={cn(input, "mt-1")}>
                        <option value="text">Texto livre</option>
                        <option value="choice">Escolha</option>
                        <option value="notes">Observações</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">Chave técnica
                      <input value={field.key} maxLength={40} onChange={(e) => updatePersonalizationIdentity(index, "key", e.target.value)} className={cn(input, "mt-1")} />
                    </label>
                    <label className="text-xs text-muted-foreground">Rótulo exibido
                      <input value={field.label} maxLength={120} onChange={(e) => updatePersonalizationIdentity(index, "label", e.target.value)} className={cn(input, "mt-1")} />
                    </label>
                  </div>
                  {field.type === "text" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <label className="text-xs text-muted-foreground">Limite de caracteres
                        <input type="number" min="1" max="400" value={field.maxLength} onChange={(e) => updatePersonalizationText(index, { maxLength: Number(e.target.value) })} className={cn(input, "mt-1 w-36")} />
                      </label>
                      <label className="mt-4 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={Boolean(field.ai)} onChange={(e) => updatePersonalizationText(index, { ai: e.target.checked })} />
                        Permitir sugestões por IA
                      </label>
                    </div>
                  ) : null}
                  {field.type === "choice" ? (
                    <label className="mt-3 block text-xs text-muted-foreground">Opções (uma por linha)
                      <textarea rows={3} value={field.options.join("\n")} onChange={(e) => updatePersonalizationChoices(index, e.target.value)} className={cn(input, "mt-1")} placeholder={"Rosa\nAzul\nBege"} />
                    </label>
                  ) : null}
                  <button type="button" onClick={() => removePersonalizationField(index)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-destructive hover:underline">
                    <Trash2 className="size-3.5" /> Remover campo
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
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

  const publishedCount=products.filter(p=>p.published&&!p.archivedAt).length;
  const archivedCount=products.filter(p=>Boolean(p.archivedAt)).length;
  const hiddenCount=products.length-publishedCount-archivedCount;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-primary">Gestão do catálogo</p><h2 className="mt-1 text-2xl font-semibold">Produtos</h2><p className="mt-1 text-sm text-muted-foreground">{products.length} cadastrados · {publishedCount} publicados · {hiddenCount} ocultos · {archivedCount} arquivados</p></div><button type="button" onClick={()=>setEditing({...emptyProduct,categorySlug:cats.find(c=>c.active&&!c.archived_at)?.slug??""})} className={btn}><Plus className="size-3.5"/> Novo produto</button></div>
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-4">
      <label className="text-xs text-muted-foreground md:col-span-2">Pesquisar produto<span className="relative mt-1 block"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className={cn(input,"pl-9")} placeholder="Nome ou slug"/></span></label>
      <label className="text-xs text-muted-foreground">Categoria<select value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setPage(1);}} className={cn(input,"mt-1")}><option value="all">Todas</option>{cats.map(c=><option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
      <label className="text-xs text-muted-foreground">Situação<select value={status} onChange={e=>{setStatus(e.target.value as typeof status);setPage(1);}} className={cn(input,"mt-1")}><option value="all">Todas</option><option value="published">Publicados</option><option value="hidden">Não publicados</option><option value="archived">Arquivados</option></select></label>
      <label className="text-xs text-muted-foreground md:col-span-2">Ordenar por<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}} className={cn(input,"mt-1")}><option value="name-asc">Nome (A–Z)</option><option value="name-desc">Nome (Z–A)</option><option value="price-asc">Menor preço</option><option value="price-desc">Maior preço</option><option value="stock-asc">Menor estoque</option><option value="stock-desc">Maior estoque</option></select></label>
    </div>
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {visibleProducts.length===0?<li className="p-6 text-sm text-muted-foreground">Nenhum produto corresponde aos filtros.</li>:visibleProducts.map(p=>{
        const busyRow=busySlug===p.slug, categoryName=cats.find(c=>c.slug===p.category)?.name??p.category;
        return <li key={p.slug} className="flex flex-wrap items-center gap-3 p-4"><img src={p.images[0]||"/images/papelemi/caderneta-ursinho-clean.jpg"} alt="" className="size-14 shrink-0 rounded-xl border border-border object-cover"/><div className="min-w-0 flex-1"><p className="font-medium">{p.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{p.slug} · {categoryName}</p><p className="mt-1 text-xs text-muted-foreground">{brl(p.promoPrice??p.price)} · estoque {p.stock??0} · {p.requiresShipping===false?"sem envio":"com envio"}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{p.archivedAt?"Arquivado":p.published?"Publicado":"Oculto"}</span>{p.personalizable&&<span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">Personalizável</span>}</div></div>
          <div className="flex flex-wrap items-center gap-1.5"><button type="button" className={btnGhost} disabled={busyRow} onClick={()=>setEditing(toForm(p))}><Pencil className="size-3.5"/>Editar</button>
            {!p.archivedAt&&<button type="button" className={btnGhost} disabled={busyRow} onClick={()=>void runAction(p.slug,()=>setProductPublished({data:{slug:p.slug,published:!p.published}}),p.published?"Produto ocultado.":"Produto publicado.")}>{p.published?<EyeOff className="size-3.5"/>:<Eye className="size-3.5"/>}{p.published?"Ocultar":"Publicar"}</button>}
            {p.archivedAt?<button type="button" className={btnGhost} disabled={busyRow} onClick={()=>void runAction(p.slug,()=>restoreProduct({data:{slug:p.slug}}),"Produto restaurado.")}><RotateCcw className="size-3.5"/>Restaurar</button>:<button type="button" className={btnGhost} disabled={busyRow} onClick={()=>{if(confirm("Arquivar este produto? Ele deixará de aparecer na loja e não poderá ser comprado."))void runAction(p.slug,()=>archiveProduct({data:{slug:p.slug}}),"Produto arquivado.");}}><Archive className="size-3.5"/>Arquivar</button>}
            {p.archivedAt&&<button type="button" className={btnGhost} disabled={busyRow} onClick={()=>{if(confirm("Excluir definitivamente? A operação será bloqueada se houver referência em pedido histórico."))void runAction(p.slug,()=>deleteProduct({data:{slug:p.slug}}),"Produto excluído.");}}><Trash2 className="size-3.5"/>Excluir</button>}
          </div></li>;
      })}
    </ul>
    <CatalogPagination page={page} total={filteredProducts.length} onPage={setPage}/>
  </div>;
}

// ===== Categorias =====

function CategoriesTab() {
  const [cats,setCats]=useState<AdminCategory[]|null>(null);
  const [products,setProducts]=useState<AdminProduct[]>([]);
  const [editing,setEditing]=useState<{originalSlug?:string;slug:string;name:string;description:string;image:string;sort:string;active:boolean}|null>(null);
  const [busy,setBusy]=useState(false),[busySlug,setBusySlug]=useState<string|null>(null);
  const [search,setSearch]=useState(""),[status,setStatus]=useState<"all"|"active"|"inactive"|"archived">("all"),[sort,setSort]=useState("sort-asc"),[page,setPage]=useState(1);
  const load=useCallback(async()=>{try{const [c,p]=await Promise.all([listAdminCategories(),listAdminProducts()]);setCats(c);setProducts(p);}catch(e){toast.error(e instanceof Error?e.message:"Não foi possível carregar categorias.");}},[]);
  useEffect(()=>{void load();},[load]);
  const counts=useMemo(()=>{const m=new Map<string,number>();for(const p of products)m.set(p.category,(m.get(p.category)??0)+1);return m;},[products]);
  const filtered=useMemo(()=>{const term=search.trim().toLocaleLowerCase("pt-BR");const result=(cats??[]).filter(c=>{if(term&&!c.name.toLocaleLowerCase("pt-BR").includes(term)&&!c.slug.toLocaleLowerCase("pt-BR").includes(term))return false;if(status==="active"&&(!c.active||c.archived_at))return false;if(status==="inactive"&&(c.active||c.archived_at))return false;if(status==="archived"&&!c.archived_at)return false;return true;});return result.sort((a,b)=>sort==="name-asc"?a.name.localeCompare(b.name,"pt-BR"):sort==="products-desc"?(counts.get(b.slug)??0)-(counts.get(a.slug)??0):a.sort-b.sort||a.name.localeCompare(b.name,"pt-BR"));},[cats,search,status,sort,counts]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/catalogPageSize)),visible=filtered.slice((page-1)*catalogPageSize,page*catalogPageSize);
  useEffect(()=>{if(page>totalPages)setPage(totalPages);},[page,totalPages]);
  const runAction=async(slug:string,action:()=>Promise<unknown>,success:string)=>{setBusySlug(slug);try{await action();toast.success(success);await load();}catch(e){toast.error(e instanceof Error?e.message:"Não foi possível concluir.");}finally{setBusySlug(null);}};
  const save=async()=>{if(!editing||busy)return;setBusy(true);try{await saveCategory({data:{originalSlug:editing.originalSlug,slug:editing.slug,name:editing.name,description:editing.description,image:editing.image,sort:Number(editing.sort)||0,active:editing.active}});toast.success("Categoria salva");setEditing(null);await load();}catch(e){toast.error(e instanceof Error?e.message:"Erro ao salvar categoria");}finally{setBusy(false);}};
  if(!cats)return <Loader2 className="size-6 animate-spin text-primary"/>;
  if(editing)return <div className="rounded-2xl border border-border bg-card p-6"><h2 className="text-2xl">{editing.originalSlug?"Editar categoria":"Nova categoria"}</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">
    <label className="text-xs text-muted-foreground">Identificador (slug)<input value={editing.slug} onChange={e=>setEditing({...editing,slug:e.target.value})} className={cn(input,"mt-1")}/></label>
    <label className="text-xs text-muted-foreground">Nome<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} className={cn(input,"mt-1")}/></label>
    <label className="text-xs text-muted-foreground sm:col-span-2">Descrição<input value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})} className={cn(input,"mt-1")}/></label>
    <label className="text-xs text-muted-foreground">URL da imagem<input value={editing.image} onChange={e=>setEditing({...editing,image:e.target.value})} className={cn(input,"mt-1")}/></label>
    <label className="text-xs text-muted-foreground">Ordem<input type="number" min="0" value={editing.sort} onChange={e=>setEditing({...editing,sort:e.target.value})} className={cn(input,"mt-1")}/></label>
    <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/>Categoria ativa na loja</label>
  </div><div className="mt-6 flex gap-3"><button onClick={save} disabled={busy} className={btn}>{busy?<Loader2 className="size-3.5 animate-spin"/>:null}Salvar</button><button onClick={()=>setEditing(null)} className={btnGhost}>Cancelar</button></div></div>;
  const activeCount=cats.filter(c=>c.active&&!c.archived_at).length,archivedCount=cats.filter(c=>Boolean(c.archived_at)).length;
  return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-primary">Organização do catálogo</p><h2 className="mt-1 text-2xl font-semibold">Categorias</h2><p className="mt-1 text-sm text-muted-foreground">{cats.length} cadastradas · {activeCount} ativas · {archivedCount} arquivadas</p></div><button type="button" onClick={()=>setEditing({slug:"",name:"",description:"",image:"",sort:String(cats.length),active:true})} className={btn}><Plus className="size-3.5"/> Nova categoria</button></div>
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-3"><label className="text-xs text-muted-foreground md:col-span-2">Pesquisar categoria<span className="relative mt-1 block"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} className={cn(input,"pl-9")} placeholder="Nome ou slug"/></span></label>
      <label className="text-xs text-muted-foreground">Situação<select value={status} onChange={e=>{setStatus(e.target.value as typeof status);setPage(1);}} className={cn(input,"mt-1")}><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option><option value="archived">Arquivadas</option></select></label>
      <label className="text-xs text-muted-foreground">Ordenar por<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}} className={cn(input,"mt-1")}><option value="sort-asc">Ordem definida</option><option value="name-asc">Nome (A–Z)</option><option value="products-desc">Mais produtos</option></select></label></div>
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">{visible.length===0?<li className="p-6 text-sm text-muted-foreground">Nenhuma categoria corresponde aos filtros.</li>:visible.map(c=>{const count=counts.get(c.slug)??0,busyRow=busySlug===c.slug;return <li key={c.slug} className="flex flex-wrap items-center gap-3 p-4">{c.image?<img src={c.image} alt="" className="size-12 shrink-0 rounded-xl border border-border object-cover"/>:<div className="size-12 shrink-0 rounded-xl bg-secondary"/>}<div className="min-w-0 flex-1"><p className="font-medium">{c.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{c.slug} · ordem {c.sort} · {count} produto(s)</p><span className="mt-2 inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px]">{c.archived_at?"Arquivada":c.active?"Ativa":"Inativa"}</span></div><div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={btnGhost} disabled={busyRow} onClick={()=>setEditing({originalSlug:c.slug,slug:c.slug,name:c.name,description:c.description,image:c.image,sort:String(c.sort),active:c.active})}><Pencil className="size-3.5"/>Editar</button>
      {!c.archived_at&&<button type="button" className={btnGhost} disabled={busyRow} onClick={()=>void runAction(c.slug,()=>setCategoryActive({data:{slug:c.slug,active:!c.active}}),c.active?"Categoria desativada.":"Categoria ativada.")}>{c.active?"Desativar":"Ativar"}</button>}
      {c.archived_at?<button type="button" className={btnGhost} disabled={busyRow} onClick={()=>void runAction(c.slug,()=>restoreCategory({data:{slug:c.slug}}),"Categoria restaurada.")}><RotateCcw className="size-3.5"/>Restaurar</button>:<button type="button" className={btnGhost} disabled={busyRow} onClick={()=>{const warning=count?`Arquivar esta categoria também ocultará ${count} produto(s) vinculados. Continuar?`:"Arquivar esta categoria?";if(confirm(warning))void runAction(c.slug,()=>archiveCategory({data:{slug:c.slug}}),"Categoria arquivada.");}}><Archive className="size-3.5"/>Arquivar</button>}
      <button type="button" className={btnGhost} disabled={busyRow||count>0} title={count>0?"Mova ou exclua os produtos vinculados antes.":"Excluir categoria"} onClick={()=>{if(confirm("Excluir definitivamente esta categoria?"))void runAction(c.slug,()=>deleteCategory({data:{slug:c.slug}}),"Categoria excluída.");}}><Trash2 className="size-3.5"/>Excluir</button>
    </div></li>;})}</ul><CatalogPagination page={page} total={filtered.length} onPage={setPage}/></div>;
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
