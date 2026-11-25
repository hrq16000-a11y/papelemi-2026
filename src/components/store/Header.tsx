import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useCatalog } from "@/lib/catalog-store";

export function Header() {
  const { count } = useCart();
  const { categories } = useCatalog();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchOpen(false);
    setMenuOpen(false);
    navigate({ to: "/loja", search: { q: q.trim() || undefined } });
  };

  return (
    <header className="relative z-40 bg-background">
      <div className="bg-secondary px-3 py-1.5 text-center text-[10px] tracking-[0.12em] text-foreground md:text-xs">
        Feito com afeto, pensado para cada história <span className="px-1 text-primary">✦</span> Enviamos para todo o Brasil!
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4 md:px-8 md:py-5">
        <button type="button" aria-label="Abrir busca" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)} className="justify-self-start rounded-full p-2 text-foreground transition-colors hover:bg-secondary">
          <Search className="size-4" />
        </button>
        <Link to="/" className="justify-self-center text-center leading-none" aria-label="PapeLemi — início">
          <span className="block font-display text-[2rem] font-semibold tracking-tight text-foreground md:text-3xl">PapeLe<span className="text-primary">♡</span>i</span>
          <span className="mt-1 block text-[8px] font-medium tracking-[0.28em] text-muted-foreground md:text-[9px]">PAPELARIA PERSONALIZADA</span>
        </Link>
        <div className="flex items-center justify-self-end gap-2 md:gap-5">
          <Link to="/loja" className="hidden text-xs transition-colors hover:text-primary md:inline-flex md:items-center md:gap-1">Ver produtos <span aria-hidden="true">↗</span></Link>
          <Link to="/carrinho" className="relative rounded-full p-2 transition-colors hover:bg-secondary" aria-label={"Carrinho, " + count + " itens"}>
            <ShoppingBag className="size-4" />
            {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[9px] text-primary-foreground">{count}</span>}
          </Link>
          <button type="button" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} className="rounded-full p-2 md:hidden">
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <nav className="hidden items-center justify-center gap-7 border-y border-border/70 px-4 py-3 text-[11px] tracking-[0.04em] md:flex">
        <Link to="/" className="transition-colors hover:text-primary">Início</Link>
        <Link to="/loja" className="transition-colors hover:text-primary">Todos os produtos</Link>
        {categories.map((c) => <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} className="transition-colors hover:text-primary">{c.name}</Link>)}
        <Link to="/sobre" className="transition-colors hover:text-primary">Nossa história</Link>
      </nav>
      <div className="bg-cream px-3 py-1.5 text-center text-[9px] tracking-[0.1em] text-muted-foreground md:text-[10px]">Personalize o que é seu. Guarde o que importa. ♡</div>

      {searchOpen && (
        <form onSubmit={submit} className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="O que você está buscando?" aria-label="Buscar produtos" className="min-w-0 flex-1 border-b border-border bg-transparent px-2 py-2 text-base outline-none focus:border-primary" />
          <button className="bg-foreground px-4 py-2 text-xs text-background">Buscar →</button>
        </form>
      )}

      {menuOpen && (
        <div className="border-t border-border bg-background px-5 pb-6 pt-4 md:hidden">
          <form onSubmit={submit} className="mb-5 flex items-center gap-2 border-b border-border pb-2">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produtos" aria-label="Buscar produtos" className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none" />
            <button className="text-xs text-primary">Buscar</button>
          </form>
          <div className="grid gap-4 text-sm">
            <Link to="/" onClick={() => setMenuOpen(false)}>Início</Link>
            <Link to="/loja" onClick={() => setMenuOpen(false)}>Todos os produtos</Link>
            {categories.map((c) => <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} onClick={() => setMenuOpen(false)}>{c.name}</Link>)}
            <Link to="/sobre" onClick={() => setMenuOpen(false)}>Nossa história</Link>
            <Link to="/personalizados" onClick={() => setMenuOpen(false)}>Personalizados</Link>
            <Link to="/kits" onClick={() => setMenuOpen(false)}>Kits</Link>
            <Link to="/presentes" onClick={() => setMenuOpen(false)}>Presentes</Link>
          </div>
        </div>
      )}
    </header>
  );
}
