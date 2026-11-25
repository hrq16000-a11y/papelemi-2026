import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { useCatalog } from "@/lib/catalog-store";
import { useCart } from "@/lib/cart";

const nav = [
  { to: "/loja", label: "Loja" },
  { to: "/personalizados", label: "Personalizados" },
  { to: "/sobre", label: "Sobre" },
  { to: "/contato", label: "Contato" },
] as const;

export function Header() {
  const { count } = useCart();
  const { categories } = useCatalog();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setOpen(false);
    navigate({ to: "/loja", search: { q: q.trim() || undefined } });
  };
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="bg-primary px-4 py-1.5 text-center text-xs tracking-wide text-primary-foreground">
        Pré-venda das agendas 2027 · Loja demonstrativa — preços ilustrativos
      </div>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 md:px-8">
        <button className="md:hidden" aria-label="Abrir menu" onClick={() => setOpen(!open)}>
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
        <Link to="/" className="font-display text-3xl font-semibold italic text-primary" aria-label="PapeLemi — início">
          PapeLemi
        </Link>
        <nav className="ml-6 hidden gap-6 text-sm md:flex">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className="transition-colors hover:text-primary" activeProps={{ className: "text-primary" }}>{n.label}</Link>
          ))}
        </nav>
        <form onSubmit={submit} className="ml-auto hidden items-center rounded-full border border-border bg-card px-3 lg:flex">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar agendas, kits…" aria-label="Buscar produtos" className="w-56 bg-transparent px-2 py-2 text-sm outline-none" />
        </form>
        <Link to="/carrinho" className="relative ml-auto rounded-full p-2 transition-colors hover:bg-secondary lg:ml-0" aria-label={`Carrinho, ${count} itens`}>
          <ShoppingBag className="size-5" />
          {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{count}</span>}
        </Link>
      </div>
      <div className="hidden border-t border-border/60 md:block">
        <div className="mx-auto flex max-w-7xl gap-8 overflow-x-auto px-8 py-2.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {categories.map((c) => (
            <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} className="whitespace-nowrap hover:text-primary" activeProps={{ className: "text-primary" }}>{c.name}</Link>
          ))}
        </div>
      </div>
      {open && (
        <div className="border-t border-border bg-background px-4 pb-6 md:hidden">
          <form onSubmit={submit} className="my-4 flex items-center rounded-full border border-border bg-card px-3">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produtos" aria-label="Buscar produtos" className="w-full bg-transparent px-2 py-2.5 text-base outline-none" />
          </form>
          <div className="flex flex-col gap-3 text-lg">
            {nav.map((n) => <Link key={n.to} to={n.to} onClick={() => setOpen(false)}>{n.label}</Link>)}
          </div>
          <p className="mt-5 text-xs uppercase tracking-widest text-muted-foreground">Categorias</p>
          <div className="mt-2 flex flex-col gap-2">
            {categories.map((c) => <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} onClick={() => setOpen(false)}>{c.name}</Link>)}
          </div>
        </div>
      )}
    </header>
  );
}
