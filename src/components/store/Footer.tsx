import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Instagram } from "lucide-react";
import { useCatalog } from "@/lib/catalog-store";

export function Footer() {
  const { categories } = useCatalog();
  return (
    <footer className="mt-0 bg-foreground text-background">
      <div className="mx-auto grid max-w-7xl gap-9 px-5 py-12 md:grid-cols-[1.35fr_0.8fr_1fr_1.3fr] md:px-8 md:py-14">
        <div>
          <Link to="/" className="inline-block leading-none" aria-label="PapeLemi — início">
            <span className="block font-display text-3xl font-semibold tracking-tight">PapeLe<span className="text-primary">♡</span>i</span>
            <span className="mt-1 block text-[8px] tracking-[0.28em] text-background/65">PAPELARIA PERSONALIZADA</span>
          </Link>
          <p className="mt-5 max-w-xs text-xs leading-6 text-background/75">Transformamos papel em memórias afetivas. Peças personalizadas para a sua rotina, seus momentos e a sua marca.</p>
        </div>
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-background/60">Explore</h2>
          <ul className="mt-4 space-y-3 text-xs text-background/85">
            <li><Link to="/loja" className="hover:text-white">Todos os produtos</Link></li>
            {categories.map((c) => <li key={c.slug}><Link to="/categoria/$slug" params={{ slug: c.slug }} className="hover:text-white">{c.name}</Link></li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-background/60">Precisa de ajuda?</h2>
          <ul className="mt-4 space-y-3 text-xs text-background/85">
            <li><a href="/#como-encomendar" className="hover:text-white">Como encomendar</a></li>
            <li><a href="/#faq" className="hover:text-white">Perguntas frequentes</a></li>
            <li><Link to="/politica-de-privacidade" className="hover:text-white">Privacidade</Link></li>
            <li><Link to="/termos-de-uso" className="hover:text-white">Termos de uso</Link></li>
            <li><Link to="/contato" className="hover:text-white">Atendimento</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-background/60">Vamos criar algo seu?</h2>
          <p className="mt-4 max-w-xs text-xs leading-6 text-background/75">Escolha uma peça e envie sua solicitação diretamente à PapeLemi. Prazo, frete e pagamento serão confirmados antes da produção.</p>
          <a href="https://www.instagram.com/papelemi.personalizados/" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs text-background transition-colors hover:text-primary">
            <Instagram className="size-4" /> Instagram <ArrowUpRight className="size-3" />
          </a>
          <Link to="/loja" className="mt-4 flex w-fit items-center gap-2 border-b border-background/60 pb-1 text-xs transition-colors hover:border-white">Conhecer a coleção <ArrowUpRight className="size-3" /></Link>
        </div>
      </div>
      <div className="border-t border-background/20 px-5 py-5 text-center text-[10px] text-background/60 md:flex md:items-center md:justify-between md:px-8">
        <span>© 2026 PapeLemi Papelaria Personalizada</span>
        <span className="mt-2 block md:mt-0">Pedidos recebidos diretamente pela PapeLemi</span>
      </div>
    </footer>
  );
}
