import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Eye, EyeOff, Loader2, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { brl, type Product } from "@/data/catalog";
import {
  archiveCategory,
  archiveProduct,
  deleteCategory,
  deleteProduct,
  listAdminCategories,
  listAdminProducts,
  restoreCategory,
  restoreProduct,
  saveCategory,
  saveProduct,
  setCategoryActive,
  setProductPublished,
} from "@/lib/shop.functions";
import { cn } from "@/lib/utils";

const input = "w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50";
const btnGhost = "inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs hover:border-primary disabled:opacity-50";
const pageSize = 10;

type AdminProduct = Awaited<ReturnType<typeof listAdminProducts>>[number];
type AdminCategory = Awaited<ReturnType<typeof listAdminCategories>>[number];

type ProductForm = {
  originalSlug?: string;
  slug: string;
  categorySlug: string;
  name: string;
  description: string;
  images: string;
  price: string;
  promoPrice: string;
  colors: string;
  sizes: string;
  finishes: string;
  productionDays: string;
  stock: string;
  minQty: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  requiresShipping: boolean;
  published: boolean;
  bestSeller: boolean;
  personalizable: boolean;
  personalizationJson: string;
};

const emptyProduct: ProductForm = {
  slug: "",
  categorySlug: "",
  name: "",
  description: "",
  images: "",
  price: "",
  promoPrice: "",
  colors: "",
  sizes: "",
  finishes: "",
  productionDays: "",
  stock: "0",
  minQty: "",
  weightKg: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  requiresShipping: true,
  published: true,
  bestSeller: false,
  personalizable: false,
  personalizationJson: "[]",
};

const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);

const toForm = (product: AdminProduct): ProductForm => ({
  originalSlug: product.slug,
  slug: product.slug,
  categorySlug: product.category,
  name: product.name,
  description: product.description,
  images: product.images.join("\n"),
  price: String(product.price),
  promoPrice: product.promoPrice == null ? "" : String(product.promoPrice),
  colors: product.colors.join(", "),
  sizes: product.sizes.join(", "),
  finishes: product.finishes.join(", "),
  productionDays: product.productionDays,
  stock: String(product.stock ?? 0),
  minQty: product.minQty == null ? "" : String(product.minQty),
  weightKg: product.weightKg == null ? "" : String(product.weightKg),
  lengthCm: product.lengthCm == null ? "" : String(product.lengthCm),
  widthCm: product.widthCm == null ? "" : String(product.widthCm),
  heightCm: product.heightCm == null ? "" : String(product.heightCm),
  requiresShipping: product.requiresShipping ?? true,
  published: product.published,
  bestSeller: product.bestSeller ?? false,
  personalizable: product.personalizable,
  personalizationJson: JSON.stringify(product.personalization ?? [], null, 2),
});

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (next: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-muted-foreground">
      <span>{total === 0 ? "Nenhum registro" : `Página ${page} de ${pages} · ${total} registro(s)`}</span>
      <div className="flex gap-2">
        <button type="button" className={btnGhost} disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <button type="button" className={btnGhost} disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button>
      </div>
    </div>
  );
}

export function ProductsTab() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [editing, setEditing] = useState<ProductForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [status, setStatus] = useState<"all" | "published" | "hidden" | "archived">("all");
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [nextProducts, nextCategories] = await Promise.all([listAdminProducts(), listAdminCategories()]);
      setProducts(nextProducts);
      setCategories(nextCategories);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o catálogo.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const result = (products ?? []).filter((product) => {
      if (term && !product.name.toLocaleLowerCase("pt-BR").includes(term) && !product.slug.toLocaleLowerCase("pt-BR").includes(term)) return false;
      if (categoryFilter !== "all" && product.category !== categoryFilter) return false;
      if (status === "published" && (!product.published || product.archivedAt)) return false;
      if (status === "hidden" && (product.published || product.archivedAt)) return false;
      if (status === "archived" && !product.archivedAt) return false;
      return true;
    });
    return result.sort((a, b) => {
      switch (sort) {
        case "name-desc": return b.name.localeCompare(a.name, "pt-BR");
        case "price-asc": return a.price - b.price;
        case "price-desc": return b.price - a.price;
        case "stock-asc": return (a.stock ?? 0) - (b.stock ?? 0);
        case "stock-desc": return (b.stock ?? 0) - (a.stock ?? 0);
        default: return a.name.localeCompare(b.name, "pt-BR");
      }
    });
  }, [products, search, categoryFilter, status, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const runAction = async (slug: string, action: () => Promise<unknown>, success: string) => {
    setBusySlug(slug);
    try { await action(); toast.success(success); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação."); }
    finally { setBusySlug(null); }
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      const personalization = JSON.parse(editing.personalizationJson) as Product["personalization"];
      if (!Array.isArray(personalization)) throw new Error("A personalização precisa ser uma lista JSON.");
      await saveProduct({ data: {
        ...(editing.originalSlug ? { originalSlug: editing.originalSlug } : {}),
        slug: editing.slug,
        categorySlug: editing.categorySlug,
        name: editing.name,
        description: editing.description,
        images: editing.images.split("\n").map((value) => value.trim()).filter(Boolean),
        price: Number(editing.price),
        promoPrice: editing.promoPrice.trim() ? Number(editing.promoPrice) : null,
        colors: split(editing.colors),
        sizes: split(editing.sizes),
        finishes: split(editing.finishes),
        productionDays: editing.productionDays,
        stock: Number(editing.stock),
        minQty: optionalNumber(editing.minQty),
        weightKg: optionalNumber(editing.weightKg),
        lengthCm: optionalNumber(editing.lengthCm),
        widthCm: optionalNumber(editing.widthCm),
        heightCm: optionalNumber(editing.heightCm),
        requiresShipping: editing.requiresShipping,
        published: editing.published,
        bestSeller: editing.bestSeller,
        personalizable: editing.personalizable,
        personalization,
      } });
      toast.success("Produto salvo. A vitrine usará os dados atualizados do Supabase.");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o produto.");
    } finally {
      setBusy(false);
    }
  };

  if (!products) return <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;

  if (editing) {
    const patch = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setEditing((current) => current ? { ...current, [key]: value } : current);
    return (
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-primary">Catálogo PapeLemi</p>
            <h2 className="mt-1 text-2xl font-semibold">{editing.originalSlug ? "Editar produto" : "Novo produto"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Os campos abaixo correspondem ao modelo atual do banco; o SKU ainda não existe nesse schema.</p>
          </div>
          <button type="button" className={btnGhost} onClick={() => setEditing(null)}>Voltar ao catálogo</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Slug<input value={editing.slug} onChange={(event) => patch("slug", event.target.value)} className={cn(input, "mt-1")} placeholder="ex.: caderno-afeto" /></label>
          <label className="text-xs text-muted-foreground">Categoria
            <select value={editing.categorySlug} onChange={(event) => patch("categorySlug", event.target.value)} className={cn(input, "mt-1")}>
              <option value="">Escolha…</option>
              {categories.map((category) => <option key={category.slug} value={category.slug} disabled={Boolean(category.archived_at)}>{category.name}{category.archived_at ? " (arquivada)" : ""}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Nome<input value={editing.name} onChange={(event) => patch("name", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Descrição<textarea value={editing.description} onChange={(event) => patch("description", event.target.value)} rows={3} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Imagens (uma URL HTTPS ou caminho /images/ por linha)<textarea value={editing.images} onChange={(event) => patch("images", event.target.value)} rows={3} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Preço (R$)<input type="number" step="0.01" min="0.50" value={editing.price} onChange={(event) => patch("price", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Preço promocional<input type="number" step="0.01" min="0.50" value={editing.promoPrice} onChange={(event) => patch("promoPrice", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Cores (separadas por vírgula)<input value={editing.colors} onChange={(event) => patch("colors", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Tamanhos (separados por vírgula)<input value={editing.sizes} onChange={(event) => patch("sizes", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Acabamentos (separados por vírgula)<input value={editing.finishes} onChange={(event) => patch("finishes", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Prazo de produção<input value={editing.productionDays} onChange={(event) => patch("productionDays", event.target.value)} className={cn(input, "mt-1")} placeholder="ex.: 5 a 7 dias úteis" /></label>
          <label className="text-xs text-muted-foreground">Estoque<input type="number" min="0" value={editing.stock} onChange={(event) => patch("stock", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Quantidade mínima<input type="number" min="1" value={editing.minQty} onChange={(event) => patch("minQty", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Peso (kg)<input type="number" min="0" step="0.001" value={editing.weightKg} onChange={(event) => patch("weightKg", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Comprimento (cm)<input type="number" min="0.01" step="0.01" value={editing.lengthCm} onChange={(event) => patch("lengthCm", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Largura (cm)<input type="number" min="0.01" step="0.01" value={editing.widthCm} onChange={(event) => patch("widthCm", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Altura (cm)<input type="number" min="0.01" step="0.01" value={editing.heightCm} onChange={(event) => patch("heightCm", event.target.value)} className={cn(input, "mt-1")} /></label>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            {([
              ["published", "Publicado na vitrine"],
              ["bestSeller", "Mais vendido"],
              ["personalizable", "Aceita personalização"],
              ["requiresShipping", "Exige envio"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing[key]} onChange={(event) => patch(key, event.target.checked)} />{label}</label>
            ))}
          </div>
          <label className="text-xs text-muted-foreground sm:col-span-2">Opções de personalização (JSON)
            <textarea value={editing.personalizationJson} onChange={(event) => patch("personalizationJson", event.target.value)} rows={8} spellCheck={false} className={cn(input, "mt-1 font-mono text-xs")} />
            <span className="mt-1 block">Tipos aceitos: text, choice e notes. A configuração é validada no servidor antes de salvar.</span>
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => void save()} disabled={busy} className={btn}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}Salvar produto</button>
          <button type="button" onClick={() => setEditing(null)} className={btnGhost}>Cancelar</button>
        </div>
      </section>
    );
  }

  const publishedCount = products.filter((product) => product.published && !product.archivedAt).length;
  const archivedCount = products.filter((product) => Boolean(product.archivedAt)).length;
  const hiddenCount = products.length - publishedCount - archivedCount;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Gestão do catálogo</p>
          <h2 className="mt-1 text-2xl font-semibold">Produtos</h2>
          <p className="mt-1 text-sm text-muted-foreground">{products.length} cadastrados · {publishedCount} publicados · {hiddenCount} ocultos · {archivedCount} arquivados</p>
        </div>
        <button type="button" className={btn} onClick={() => setEditing({ ...emptyProduct, categorySlug: categories.find((category) => category.active && !category.archived_at)?.slug ?? "" })}><Plus className="size-3.5" />Novo produto</button>
      </div>
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-4">
        <label className="text-xs text-muted-foreground md:col-span-2">Pesquisar produto
          <span className="relative mt-1 block"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={cn(input, "pl-9")} placeholder="Nome ou slug" /></span>
        </label>
        <label className="text-xs text-muted-foreground">Categoria
          <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }} className={cn(input, "mt-1")}>
            <option value="all">Todas as categorias</option>
            {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Situação
          <select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }} className={cn(input, "mt-1")}>
            <option value="all">Todas</option><option value="published">Publicados</option><option value="hidden">Não publicados</option><option value="archived">Arquivados</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground md:col-span-2">Ordenar por
          <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className={cn(input, "mt-1")}>
            <option value="name-asc">Nome (A–Z)</option><option value="name-desc">Nome (Z–A)</option><option value="price-asc">Menor preço</option><option value="price-desc">Maior preço</option><option value="stock-asc">Menor estoque</option><option value="stock-desc">Maior estoque</option>
          </select>
        </label>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {visible.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhum produto corresponde aos filtros.</p> : (
          <ul className="divide-y divide-border">
            {visible.map((product) => {
              const categoryName = categories.find((category) => category.slug === product.category)?.name ?? product.category;
              const busyRow = busySlug === product.slug;
              return (
                <li key={product.slug} className="flex flex-wrap items-center gap-3 p-4">
                  <img src={product.images[0] || "/images/papelemi/caderneta-ursinho-clean.jpg"} alt="" className="size-14 shrink-0 rounded-xl border border-border object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{product.slug} · {categoryName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{brl(product.promoPrice ?? product.price)} · estoque {product.stock ?? 0} · {product.requiresShipping === false ? "sem envio" : "com envio"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{product.archivedAt ? "Arquivado" : product.published ? "Publicado" : "Oculto"}</span>
                      {product.personalizable && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">Personalizável</span>}
                      {product.bestSeller && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">Destaque</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" className={btnGhost} disabled={busyRow} onClick={() => setEditing(toForm(product))}><Pencil className="size-3.5" />Editar</button>
                    {!product.archivedAt && <button type="button" className={btnGhost} disabled={busyRow} onClick={() => void runAction(product.slug, () => setProductPublished({ data: { slug: product.slug, published: !product.published } }), product.published ? "Produto ocultado." : "Produto publicado.")}>{product.published ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{product.published ? "Ocultar" : "Publicar"}</button>}
                    {product.archivedAt
                      ? <button type="button" className={btnGhost} disabled={busyRow} onClick={() => void runAction(product.slug, () => restoreProduct({ data: { slug: product.slug } }), "Produto restaurado.")}><RotateCcw className="size-3.5" />Restaurar</button>
                      : <button type="button" className={btnGhost} disabled={busyRow} onClick={() => { if (confirm("Arquivar este produto? Ele deixará de aparecer na loja e não poderá ser comprado.")) void runAction(product.slug, () => archiveProduct({ data: { slug: product.slug } }), "Produto arquivado."); }}><Archive className="size-3.5" />Arquivar</button>}
                    {product.archivedAt && <button type="button" className={btnGhost} disabled={busyRow} onClick={() => { if (confirm("Excluir definitivamente? A operação será bloqueada se houver referência em pedido histórico.")) void runAction(product.slug, () => deleteProduct({ data: { slug: product.slug } }), "Produto excluído."); }}><Trash2 className="size-3.5" />Excluir</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Pagination page={page} total={filtered.length} onPage={setPage} />
    </section>
  );
}

type CategoryForm = {
  originalSlug?: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  sort: string;
  active: boolean;
};

export function CategoriesTab() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [editing, setEditing] = useState<CategoryForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive" | "archived">("all");
  const [sort, setSort] = useState("sort-asc");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const [nextCategories, nextProducts] = await Promise.all([listAdminCategories(), listAdminProducts()]);
      setCategories(nextCategories);
      setProducts(nextProducts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as categorias.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) map.set(product.category, (map.get(product.category) ?? 0) + 1);
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const result = (categories ?? []).filter((category) => {
      if (term && !category.name.toLocaleLowerCase("pt-BR").includes(term) && !category.slug.toLocaleLowerCase("pt-BR").includes(term)) return false;
      if (status === "active" && (!category.active || category.archived_at)) return false;
      if (status === "inactive" && (category.active || category.archived_at)) return false;
      if (status === "archived" && !category.archived_at) return false;
      return true;
    });
    return result.sort((a, b) => {
      if (sort === "name-asc") return a.name.localeCompare(b.name, "pt-BR");
      if (sort === "products-desc") return (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0);
      return a.sort - b.sort || a.name.localeCompare(b.name, "pt-BR");
    });
  }, [categories, search, status, sort, counts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const runAction = async (slug: string, action: () => Promise<unknown>, success: string) => {
    setBusySlug(slug);
    try { await action(); toast.success(success); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação."); }
    finally { setBusySlug(null); }
  };

  const save = async () => {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await saveCategory({ data: {
        ...(editing.originalSlug ? { originalSlug: editing.originalSlug } : {}),
        slug: editing.slug,
        name: editing.name,
        description: editing.description,
        image: editing.image,
        sort: Number(editing.sort) || 0,
        active: editing.active,
      } });
      toast.success("Categoria salva.");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a categoria.");
    } finally {
      setBusy(false);
    }
  };

  if (!categories) return <div className="flex min-h-48 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;

  if (editing) {
    const patch = <K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) => setEditing((current) => current ? { ...current, [key]: value } : current);
    return (
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs uppercase tracking-[0.18em] text-primary">Catálogo PapeLemi</p><h2 className="mt-1 text-2xl font-semibold">{editing.originalSlug ? "Editar categoria" : "Nova categoria"}</h2></div>
          <button type="button" className={btnGhost} onClick={() => setEditing(null)}>Voltar às categorias</button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Slug<input value={editing.slug} onChange={(event) => patch("slug", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Nome<input value={editing.name} onChange={(event) => patch("name", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Descrição<textarea value={editing.description} onChange={(event) => patch("description", event.target.value)} rows={3} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2">Imagem (URL HTTPS ou caminho /images/)<input value={editing.image} onChange={(event) => patch("image", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="text-xs text-muted-foreground">Ordem<input type="number" min="0" max="999" value={editing.sort} onChange={(event) => patch("sort", event.target.value)} className={cn(input, "mt-1")} /></label>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={editing.active} onChange={(event) => patch("active", event.target.checked)} />Categoria ativa na loja</label>
        </div>
        <div className="mt-6 flex gap-3"><button type="button" onClick={() => void save()} disabled={busy} className={btn}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}Salvar categoria</button><button type="button" onClick={() => setEditing(null)} className={btnGhost}>Cancelar</button></div>
      </section>
    );
  }

  const activeCount = categories.filter((category) => category.active && !category.archived_at).length;
  const archivedCount = categories.filter((category) => Boolean(category.archived_at)).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[0.18em] text-primary">Organização do catálogo</p><h2 className="mt-1 text-2xl font-semibold">Categorias</h2><p className="mt-1 text-sm text-muted-foreground">{categories.length} cadastradas · {activeCount} ativas · {archivedCount} arquivadas</p></div>
        <button type="button" className={btn} onClick={() => setEditing({ slug: "", name: "", description: "", image: "", sort: String(categories.length), active: true })}><Plus className="size-3.5" />Nova categoria</button>
      </div>
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-3">
        <label className="text-xs text-muted-foreground md:col-span-2">Pesquisar categoria
          <span className="relative mt-1 block"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={cn(input, "pl-9")} placeholder="Nome ou slug" /></span>
        </label>
        <label className="text-xs text-muted-foreground">Situação<select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }} className={cn(input, "mt-1")}><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option><option value="archived">Arquivadas</option></select></label>
        <label className="text-xs text-muted-foreground">Ordenar por<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className={cn(input, "mt-1")}><option value="sort-asc">Ordem definida</option><option value="name-asc">Nome (A–Z)</option><option value="products-desc">Mais produtos</option></select></label>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {visible.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nenhuma categoria corresponde aos filtros.</p> : (
          <ul className="divide-y divide-border">
            {visible.map((category) => {
              const productCount = counts.get(category.slug) ?? 0;
              const busyRow = busySlug === category.slug;
              return (
                <li key={category.slug} className="flex flex-wrap items-center gap-3 p-4">
                  {category.image ? <img src={category.image} alt="" className="size-12 shrink-0 rounded-xl border border-border object-cover" /> : <div className="size-12 shrink-0 rounded-xl bg-secondary" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{category.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{category.slug} · ordem {category.sort} · {productCount} produto(s)</p>
                    <span className="mt-2 inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px]">{category.archived_at ? "Arquivada" : category.active ? "Ativa" : "Inativa"}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" className={btnGhost} disabled={busyRow} onClick={() => setEditing({ originalSlug: category.slug, slug: category.slug, name: category.name, description: category.description, image: category.image, sort: String(category.sort), active: category.active })}><Pencil className="size-3.5" />Editar</button>
                    {!category.archived_at && <button type="button" className={btnGhost} disabled={busyRow} onClick={() => void runAction(category.slug, () => setCategoryActive({ data: { slug: category.slug, active: !category.active } }), category.active ? "Categoria desativada." : "Categoria ativada.")}>{category.active ? "Desativar" : "Ativar"}</button>}
                    {category.archived_at
                      ? <button type="button" className={btnGhost} disabled={busyRow} onClick={() => void runAction(category.slug, () => restoreCategory({ data: { slug: category.slug } }), "Categoria restaurada.")}><RotateCcw className="size-3.5" />Restaurar</button>
                      : <button type="button" className={btnGhost} disabled={busyRow} onClick={() => { const warning = productCount ? `Arquivar esta categoria também ocultará ${productCount} produto(s) vinculados. Continuar?` : "Arquivar esta categoria?"; if (confirm(warning)) void runAction(category.slug, () => archiveCategory({ data: { slug: category.slug } }), "Categoria arquivada."); }}><Archive className="size-3.5" />Arquivar</button>}
                    <button type="button" className={btnGhost} disabled={busyRow || productCount > 0} title={productCount > 0 ? "Mova ou exclua os produtos vinculados antes." : "Excluir categoria"} onClick={() => { if (confirm("Excluir definitivamente esta categoria?")) void runAction(category.slug, () => deleteCategory({ data: { slug: category.slug } }), "Categoria excluída."); }}><Trash2 className="size-3.5" />Excluir</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Pagination page={page} total={filtered.length} onPage={setPage} />
    </section>
  );
}
