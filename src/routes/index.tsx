import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Heart, Package, PenLine } from "lucide-react";
import { img, publishedProducts } from "@/data/catalog";
import { ProductGrid } from "@/components/store/ProductCard";

const hero = img("1519337265831-281ec6cc8514", 1600);
const storyImage = img("1527239441953-caffd968d952", 1400);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PapeLemi — Papelaria personalizada com afeto" },
      { name: "description", content: "Cadernetas, planners, mimos e brindes feitos para contar a sua história." },
      { property: "og:title", content: "PapeLemi — Papelaria personalizada com afeto" },
      { property: "og:description", content: "Detalhes que viram memórias. Papelaria personalizada para celebrar pessoas e dar vida às suas ideias." },
      { property: "og:image", content: hero },
      { name: "twitter:image", content: hero },
    ],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "PapeLemi",
        description: "Papelaria personalizada com afeto",
        sameAs: ["https://www.instagram.com/papelemi.personalizados/"],
      }),
    }],
  }),
  component: Home,
});

function SectionHeading({
  eyebrow,
  title,
  description,
  link,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  link?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 md:mb-9">
      <div>
        <p className="text-[9px] uppercase tracking-[0.22em] text-primary md:text-[10px]">{eyebrow}</p>
        <h2 className="mt-1 font-display text-3xl leading-tight tracking-tight text-foreground md:text-[2.65rem]">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-xs leading-6 text-muted-foreground md:text-sm">{description}</p>}
      </div>
      {link}
    </div>
  );
}

function Home() {
  const collections = [
    { slug: "cadernetas", title: "Cadernetas", subtitle: "Para guardar cada fase", image: publishedProducts[0]?.images[0] ?? hero },
    { slug: "planners-blocos", title: "Planners & blocos", subtitle: "Ideias para o dia a dia", image: publishedProducts[3]?.images[0] ?? storyImage },
    { slug: "mimos-lembrancas", title: "Mimos & lembranças", subtitle: "Pequenos grandes gestos", image: publishedProducts[5]?.images[0] ?? storyImage },
    { slug: "brindes-personalizados", title: "Brindes personalizados", subtitle: "Sua marca com afeto", image: publishedProducts[7]?.images[0] ?? storyImage },
  ];

  return (
    <>
      <section className="grid min-h-[440px] grid-cols-1 md:min-h-[500px] md:grid-cols-2">
        <div className="flex items-center bg-secondary px-6 py-14 sm:px-10 md:px-12 lg:px-16 xl:px-[max(4rem,calc((100vw-1280px)/2))]">
          <div className="mx-auto w-full max-w-xl">
            <p className="text-[9px] font-medium uppercase tracking-[0.24em] text-primary md:text-[10px]">
              Papelaria personalizada com afeto
            </p>
            <h1 className="mt-4 max-w-[560px] font-display text-[2.8rem] font-semibold leading-[0.98] tracking-tight text-foreground sm:text-5xl lg:text-[4.35rem]">
              Detalhes que viram <em className="font-medium text-primary">memórias.</em>
            </h1>
            <p className="mt-5 max-w-md text-xs leading-6 text-muted-foreground md:text-[13px]">
              Cadernetas, planners, mimos e brindes feitos para contar a sua história, celebrar pessoas e dar vida às suas ideias.
            </p>
            <Link
              to="/loja"
              className="mt-7 inline-flex items-center gap-2 bg-foreground px-5 py-3 text-[10px] font-medium text-background transition-colors hover:bg-primary"
            >
              Descobrir a coleção <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
        <div className="relative min-h-[340px] overflow-hidden bg-cream md:min-h-[500px]">
          <img src={hero} alt="Papelaria personalizada da PapeLemi" className="absolute inset-0 size-full object-cover" fetchPriority="high" />
          <div className="absolute bottom-6 right-6 grid size-[76px] place-items-center rounded-full border border-white/70 bg-background/90 text-center font-display text-sm italic leading-tight text-primary shadow-soft">
            feito<br />pra você
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl grid-cols-1 border-b border-border/70 px-5 py-5 sm:grid-cols-3 md:px-8">
        <div className="flex items-center gap-3 border-b border-border/60 py-3 sm:border-b-0 sm:border-r sm:py-1 sm:pr-5">
          <Heart className="size-4 shrink-0 text-primary" />
          <div>
            <p className="text-[10px] font-semibold text-foreground">Feito com carinho</p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">Peças que acompanham a sua história</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-b border-border/60 py-3 sm:border-b-0 sm:border-r sm:px-5 sm:py-1">
          <PenLine className="size-4 shrink-0 text-primary" />
          <div>
            <p className="text-[10px] font-semibold text-foreground">Seu toque pessoal</p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">Escolha detalhes no seu pedido</p>
          </div>
        </div>
        <div className="flex items-center gap-3 py-3 sm:pl-5 sm:py-1">
          <Package className="size-4 shrink-0 text-primary" />
          <div>
            <p className="text-[10px] font-semibold text-foreground">Para todo o Brasil</p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">Consulte prazo e entrega no pedido</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-16">
        <SectionHeading
          eyebrow="Encontre o seu detalhe"
          title="Escolha por coleção"
          link={<Link to="/loja" className="inline-flex items-center gap-1 text-[10px] text-foreground hover:text-primary">Ver todos os produtos <ArrowRight className="size-3" /></Link>}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {collections.map((c) => (
            <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} className="group relative aspect-[4/4.5] overflow-hidden bg-muted">
              <img src={c.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/75 via-foreground/5 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 text-background md:p-4">
                <p className="text-[8px] uppercase tracking-[0.15em] text-background/80 md:text-[9px]">{c.subtitle}</p>
                <h3 className="mt-1 font-display text-lg font-semibold leading-tight md:text-2xl">{c.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-muted/55">
        <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-16">
          <SectionHeading
            eyebrow="Seleção PapeLemi"
            title="Peças para se apaixonar"
            description="Ideias reais do catálogo para celebrar, organizar e presentear."
            link={<Link to="/loja" className="inline-flex items-center gap-1 text-[10px] text-foreground hover:text-primary">Explorar catálogo <ArrowRight className="size-3" /></Link>}
          />
          <ProductGrid items={publishedProducts} />
          <p className="mt-8 text-[9px] leading-5 text-muted-foreground">
            * Prazos e valores de referência. A PapeLemi confirmará disponibilidade, personalização e entrega antes da produção.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 md:min-h-[430px] md:grid-cols-2">
        <div className="min-h-[320px] overflow-hidden bg-cream md:min-h-[430px]">
          <img src={storyImage} alt="Caderno artesanal e papelaria feita com cuidado" loading="lazy" className="size-full min-h-[320px] object-cover md:min-h-[430px]" />
        </div>
        <div className="flex items-center bg-[oklch(0.93_0.01_115)] px-6 py-14 sm:px-10 md:px-12 lg:px-16">
          <div className="mx-auto max-w-lg">
            <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Muito além do papel</p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.02] tracking-tight text-foreground md:text-5xl">
              Seu jeito de guardar o mundo.
            </h2>
            <p className="mt-5 text-xs leading-6 text-muted-foreground md:text-[13px]">
              Uma caderneta para os primeiros passos. Um planner para recomeçar. Um pequeno presente para dizer muito. Cada peça pode carregar um nome, uma ocasião e um sentimento.
            </p>
            <Link to="/sobre" className="mt-7 inline-flex items-center gap-2 border border-foreground/30 bg-background/80 px-4 py-2.5 text-[10px] text-foreground transition-colors hover:border-primary hover:text-primary">
              Conheça a PapeLemi <ArrowRight className="size-3" />
            </Link>
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
            ].map((step) => (
              <div key={step.n} className="border-t border-border pt-4">
                <p className="font-display text-2xl italic text-primary">{step.n}</p>
                <h3 className="mt-2 font-display text-xl font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-accent px-5 py-12 text-center md:py-16">
        <p className="text-[9px] uppercase tracking-[0.22em] text-accent-foreground/75">Feito para ser seu</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-foreground md:text-4xl">Uma ideia bonita começa aqui.</h2>
        <p className="mx-auto mt-3 max-w-xl text-[11px] leading-5 text-muted-foreground">
          Conheça a coleção completa da PapeLemi e encontre a peça certa para o seu momento.
        </p>
        <Link to="/loja" className="mt-6 inline-flex items-center gap-2 bg-foreground px-5 py-3 text-[10px] text-background transition-colors hover:bg-primary">
          Explorar a coleção <ArrowRight className="size-3" />
        </Link>
      </section>

      <section id="privacidade" className="mx-auto max-w-4xl px-5 py-14 md:px-8 md:py-16">
        <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Seus dados</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-foreground md:text-4xl">Privacidade na encomenda</h2>
        <p className="mt-4 max-w-3xl text-[11px] leading-6 text-muted-foreground md:text-xs">
          Nome, contato, endereço e detalhes do pedido são usados pela PapeLemi para atender a solicitação. Os dados ficam no ambiente próprio da loja e são acessíveis somente ao administrador autorizado. Para solicitar acesso ou exclusão, use o canal oficial da marca. Nenhum pagamento é coletado nesta etapa.
        </p>
      </section>

      <section id="faq" className="mx-auto max-w-4xl px-5 pb-16 md:px-8 md:pb-20">
        <p className="text-[9px] uppercase tracking-[0.22em] text-primary">Antes de encomendar</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-foreground md:text-4xl">Dúvidas frequentes</h2>
        <div className="mt-6 divide-y divide-border border-y border-border">
          <details className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-xs font-medium text-foreground">
              Os produtos são personalizados?
              <span className="text-primary transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-3xl text-[11px] leading-5 text-muted-foreground">
              Muitos produtos permitem inserir nome ou escolher detalhes. Informe o que deseja na encomenda; a PapeLemi confirmará as possibilidades.
            </p>
          </details>
          <details className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-xs font-medium text-foreground">
              Qual é o prazo de produção?
              <span className="text-primary transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-3xl text-[11px] leading-5 text-muted-foreground">
              O prazo varia conforme o produto e a agenda de produção. Os itens desta vitrine têm prazos de referência de 6 a 10 dias úteis; o prazo e a entrega serão confirmados na resposta à encomenda.
            </p>
          </details>
          <details className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-xs font-medium text-foreground">
              Como funciona a compra?
              <span className="text-primary transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-3xl text-[11px] leading-5 text-muted-foreground">
              Escolha os produtos e registre uma solicitação nesta loja. A PapeLemi confirmará disponibilidade, personalização, frete e pagamento antes da produção.
            </p>
          </details>
        </div>
      </section>
    </>
  );
}
