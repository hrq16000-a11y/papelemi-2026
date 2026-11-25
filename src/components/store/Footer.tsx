import { Link } from "@tanstack/react-router";
import { Instagram, Mail, MessageCircle } from "lucide-react";
import { categories } from "@/data/catalog";

export function Footer() {
  return (
    <footer className="mt-24 bg-cream">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-4 md:px-8">
        <div>
          <p className="font-display text-3xl italic text-primary">PapeLemi</p>
          <p className="mt-3 text-sm text-muted-foreground">Papelaria com afeto: transformamos papel em memórias.</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Categorias</p>
          <ul className="mt-3 space-y-2 text-sm">{categories.map((c) => <li key={c.slug}><Link to="/categoria/$slug" params={{ slug: c.slug }} className="hover:text-primary">{c.name}</Link></li>)}</ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">PapeLemi</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to="/loja" className="hover:text-primary">Loja</Link></li>
            <li><Link to="/personalizados" className="hover:text-primary">Personalizados</Link></li>
            <li><Link to="/sobre" className="hover:text-primary">Nossa história</Link></li>
            <li><Link to="/kits" className="hover:text-primary">Kits</Link></li>
            <li><Link to="/presentes" className="hover:text-primary">Presentes</Link></li>
            <li><Link to="/contato" className="hover:text-primary">Atendimento</Link></li>
            <li><Link to="/politica-de-privacidade" className="hover:text-primary">Política de privacidade</Link></li>
            <li><Link to="/termos-de-uso" className="hover:text-primary">Termos de uso</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Fale com a gente</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2"><MessageCircle className="size-4" /> WhatsApp (em breve)</li>
            <li className="flex items-center gap-2"><Mail className="size-4" /> contato@papelemi (a confirmar)</li>
            <li className="flex items-center gap-2"><Instagram className="size-4" /> @papelemi</li>
          </ul>
        </div>
      </div>
      <p className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} PapeLemi · Catálogo demonstrativo</p>
    </footer>
  );
}
