import { publicCanonical, publicSocialMeta } from "@/lib/social-preview";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Heart, Package, PenLine } from "lucide-react";
import { img, sortProducts } from "@/data/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { ProductGrid } from "@/components/store/ProductCard";

const hero = img("1519337265831-281ec6cc8514", 1600);
const storyImage = img("1527239441953-caffd968d952", 1400);

export const Route = createFileRoute("/")({
  head: () => ({ links: [publicCanonical("/")], meta: [
      { title: "PapeLemi — Papelaria personalizada com afeto" },
      { name: "description", content: "Cadernetas, planners, mimos e brindes feitos para contar a sua história." },
      { property: "og:title", content: "PapeLemi — Papelaria personalizada com afeto" },
      { property: "og:description", content: "Detalhes que viram memórias. Papelaria personalizada para celebrar pessoas e dar vida às suas ideias." },
      ...publicSocialMeta("/", "PapeLemi — Papelaria personalizada com afeto", "Detalhes que viram memórias. Papelaria personalizada para celebrar pessoas e dar vida às suas ideias."),
    ],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "PapeLemi",
        description: "Papelaria personalizada com afeto",
        url: "https://www.papelemi.com.br",
        sameAs: ["https://www.instagram.com/papelemi.personalizados/"],
      }),
    }],
  }),
  component: Home,
});

function SectionHeading({ eyebrow, title, description, link }: { eyebrow: string; title: string; description?: string; link?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 md:mb-10">
      <div>
        <p className="papel-kicker">{eyebrow}</p>
        <h2 className="mt-1 font-display text-3xl leading-tight tracking-tight text-foreground md:text-[2.65rem]">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p>}
      </div>
      {link}
    </div>
  );
}

function Home() {
  const { categories, publishedProducts } = useCatalog();
  const featured = sortProducts(publishedProducts).slice(0, 8);
  const collections = categories.map((c) => ({ slug: c.slug, title: c.name, subtitle: c.description, image: c.image }));

  return (
    <>
      <section className="papel-hero" aria-labelledby="papel-hero-title">
        <div className="papel-hero-copy">
          <div className="mx-auto w-full max-w-xl">
            <p className="papel-kicker">Papelaria personalizada com afeto</p>
            <h1 id="papel-hero-title" className="papel-hero-title">
              Detalhes que viram <em className="font-medium text-primary">memórias.</em>
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground md:text-base">
              Cadernetas, planners, mimos e brindes feitos para contar a sua história, celebrar pessoas e dar vida às suas ideias.
            </p>
            <Link to="/loja" className="papel-cta mt-7">
              Descobrir a coleção <ArrowRight className="size-3" />
            </Link>
            <a href="#como-encomendar" className="papel-secondary mt-2 inline-flex min-h-11 items-center gap-2">Como encomendar <ArrowRight className="size-4" aria-hidden="true" /></a>
          </div>
        </div>
        <figure className="papel-hero-figure">
          <div className="papel-hero-photo">
            <img src={hero} alt="Caderneta de Saúde Ursinho Clean da PapeLemi" className="size-full object-cover" fetchPriority="high" />
            <span className="papel-seal" aria-hidden="true">feito<br />pra você</span>
          </div>
          <figcaption className="papel-caption"><span>Personalizado com afeto</span><span>Caderneta Ursinho Clean</span></figcaption>
        </figure>
      </section>

      <section className="mx-auto grid max-w-6xl grid-cols-1 border-b border-border/70 px-5 py-5 sm:grid-cols-3 md:px-8">
        <div className="flex items-center gap-3 border-b border-border/60 py-3 sm:border-b-0 sm:border-r sm:py-1 sm:pr-5">
          <Heart className="size-4 shrink-0 text-primary" /><div><p className="text-xs font-semibold text-foreground">Feito com carinho</p><p className="mt-0.5 text-xs text-muted-foreground">Peças que acompanham a sua história</p></div>
        </div>
        <div className="flex items-center gap-3 border-b border-border/60 py-3 sm:border-b-0 sm:border-r sm:px-5 sm:py-1">
          <PenLine className="size-4 shrink-0 text-primary" /><div><p className="text-xs font-semibold text-foreground">Seu toque pessoal</p><p className="mt-0.5 text-xs text-muted-foreground">Escolha detalhes no seu pedido</p></div>
        </div>
        <div className="flex items-center gap-3 py-3 sm:pl-5 sm:py-1">
          <Package className="size-4 shrink-0 text-primary" /><div><p className="text-xs font-semibold text-foreground">Para todo o Brasil</p><p className="mt-0.5 text-xs text-muted-foreground">Consulte prazo e entrega no pedido</p></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-16">
        <SectionHeading eyebrow="Encontre o seu detalhe" title="Escolha por coleção" link={<Link to="/loja" className="inline-flex items-center gap-1 text-[10px] text-foreground hover:text-primary">Ver todos os produtos <ArrowRight className="size-3" /></Link>} />
        <div className="papel-collections">
          {collections.map((c) => (
            <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} className="papel-collection group">
              <img src={c.image} alt="" loading="lazy" className="papel-collection-photo size-full object-cover" />
              <div className="papel-collection-label"><p className="text-xs leading-snug text-muted-foreground">{c.subtitle}</p><h3 className="mt-1 flex items-center justify-between gap-2 font-display text-lg leading-tight text-foreground md:text-2xl">{c.title}<ArrowRight className="papel-collection-arrow size-4 shrink-0" aria-hidden="true" /></h3></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-muted/55">
        <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-16">
          <SectionHeading eyebrow="Seleção PapeLemi" title="Peças para se apaixonar" description="Ideias reais do catálogo para celebrar, organizar e presentear." link={<Link to="/loja" className="inline-flex items-center gap-1 text-[10px] text-foreground hover:text-primary">Explorar catálogo <ArrowRight className="size-3" /></Link>} />
          <ProductGrid items={featured} />
          <p className="mt-8 text-[9px] leading-5 text-muted-foreground">* Prazos e valores de referência. A PapeLemi confirmará disponibilidade, personalização e entrega antes da produção.</p>
        </div>
      </section>

      <section className="grid grid-cols-1 md:min-h-[430px] md:grid-cols-2">
        <div className="min-h-[320px] overflow-hidden bg-cream md:min-h-[430px]"><img src={storyImage} alt="Planner Devocional Masculino personalizado da PapeLemi" loading="lazy" className="size-full min-h-[320px] object-cover md:min-h-[430px]" /></div>
        <div className="flex items-center bg-[oklch(0.93_0.01_115)] px-6 py-14 sm:px-10 md:px-12 lg:px-16">
          <div className="mx-auto max-w-lg">
            <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Muito além do papel</p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.02] tracking-tight text-foreground md:text-5xl">Seu jeito de guardar o mundo.</h2>
            <p className="mt-5 text-xs leading-6 text-muted-foreground md:text-[13px]">Uma caderneta para os primeiros passos. Um planner para recomeçar. Um pequeno presente para dizer muito. Cada peça pode carregar um nome, uma ocasião e um sentimento.</p>
            <Link to="/sobre" className="mt-7 inline-flex items-center gap-2 border border-foreground/30 bg-background/80 px-4 py-2.5 text-[10px] text-foreground transition-colors hover:border-primary hover:text-primary">Conheça a PapeLemi <ArrowRight className="size-3" /></Link>
          </div>
        </div>
      </section>

      <section id="como-encomendar" className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-center text-[9px] uppercase tracking-[0.22em] text-primary">Simples e especial</p>
          <h2 className="mt-2 text-center font-display text-3xl font-semibold text-foreground md:text-4xl">Como escolher sua peça</h2>
          <div className="mt-9 grid gap-6 md:grid-cols-3 md:gap-8">
            {[
              { n: "01", title: "Encontre uma ideia", text: "Navegue por cadernetas, planners, mimos e brindes." },
              { n: "02", title: "Confira os detalhes", text: "Informe os detalhes da peça e a quantidade desejada." },
              { n: "03", title: "Solicite sua encomenda", text: "Registre a solicitação. A PapeLemi confirma frete, prazo e pagamento antes da produção." },
            ].map((step) => <div key={step.n} className="border-t border-border pt-4"><p className="font-display text-2xl italic text-primary">{step.n}</p><h3 className="mt-2 font-display text-xl font-semibold text-foreground">{step.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p></div>)}
          </div>
        </div>
      </section>

      <section className="bg-accent px-5 py-12 text-center md:py-16">
        <p className="text-[9px] uppercase tracking-[0.22em] text-accent-foreground/75">Feito para ser seu</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-foreground md:text-4xl">Uma ideia bonita começa aqui.</h2>
        <p className="mx-auto mt-3 max-w-xl text-[11px] leading-5 text-muted-foreground">Conheça a coleção completa da PapeLemi e encontre a peça certa para o seu momento.</p>
        <Link to="/loja" className="mt-6 inline-flex items-center gap-2 bg-foreground px-5 py-3 text-[10px] text-background transition-colors hover:bg-primary">Explorar a coleção <ArrowRight className="size-3" /></Link>
      </section>

      <section id="privacidade" className="mx-auto max-w-4xl px-5 py-14 md:px-8 md:py-16">
        <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Seus dados</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-foreground md:text-4xl">Privacidade na encomenda</h2>
        <p className="mt-4 max-w-3xl text-[11px] leading-6 text-muted-foreground md:text-xs">Nome, contato, endereço e detalhes do pedido são usados pela PapeLemi para atender a solicitação. Os dados ficam no ambiente próprio da loja e são acessíveis somente à equipe autorizada. Para solicitar acesso ou exclusão, use o canal oficial da marca. Nenhum pagamento é coletado nesta etapa de solicitação.</p>
      </section>

      <section id="faq" className="mx-auto max-w-4xl px-5 pb-16 md:px-8 md:pb-20">
        <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Antes de encomendar</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-foreground md:text-4xl">Dúvidas frequentes</h2>
        <div className="mt-6 divide-y divide-border border-y border-border">
          <details className="group py-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground">Os produtos são personalizados?<span className="text-primary transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Muitos produtos permitem inserir nome ou escolher detalhes. Informe o que deseja na encomenda; a PapeLemi confirmará as possibilidades.</p></details>
          <details className="group py-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground">Qual é o prazo de produção?<span className="text-primary transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">O prazo varia conforme o produto e a agenda de produção. Os itens desta vitrine têm prazos de referência; o prazo e a entrega serão confirmados na resposta à encomenda.</p></details>
          <details className="group py-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground">Como funciona a compra?<span className="text-primary transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Escolha os produtos e registre uma solicitação nesta loja. A PapeLemi confirmará disponibilidade, personalização, frete e pagamento antes da produção.</p></details>
        </div>
      </section>
    </>
  );
}
