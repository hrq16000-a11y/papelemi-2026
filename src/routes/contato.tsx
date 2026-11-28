import { publicSocialMeta } from "@/lib/social-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Instagram } from "lucide-react";

export const Route = createFileRoute("/contato")({
  head: () => ({ meta: [
    { title: "Atendimento — PapeLemi" },
    { name: "description", content: "Fale com a PapeLemi para encomendas, orçamentos e dúvidas." },
    { property: "og:title", content: "Atendimento — PapeLemi" },
    { property: "og:description", content: "Atendimento direto da PapeLemi." },
      ...publicSocialMeta("Atendimento — PapeLemi", "Atendimento direto da PapeLemi."),
  ] }),
  component: Contact,
});

function Contact() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-24">
      <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Atendimento com afeto</p>
      <h1 className="mt-3 font-display text-4xl md:text-6xl">Vamos conversar?</h1>
      <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">
        Para dúvidas sobre produtos, personalização e encomendas, fale com a PapeLemi pelo perfil oficial no Instagram.
        Se você já escolheu suas peças, registre a solicitação pelo carrinho: os detalhes chegam à equipe para confirmação.
      </p>
      <a href="https://www.instagram.com/papelemi.personalizados/" target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-3 bg-foreground px-6 py-4 text-xs text-background transition-colors hover:bg-primary">
        <Instagram className="size-4" /> Falar pelo Instagram <ArrowRight className="size-3" />
      </a>
      <div className="mt-12 border-t border-border pt-8">
        <h2 className="font-display text-2xl">Quer fazer uma encomenda?</h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">Escolha os produtos, personalize os detalhes e envie sua solicitação. Nenhuma cobrança é feita nesta etapa.</p>
        <Link to="/loja" className="mt-5 inline-flex items-center gap-2 border-b border-primary pb-1 text-xs text-primary">Conhecer os produtos <ArrowRight className="size-3" /></Link>
      </div>
    </div>
  );
}
