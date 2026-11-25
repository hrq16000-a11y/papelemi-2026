import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Heart, PenLine, Package, Sparkles } from "lucide-react";
import { categories, img, publishedProducts } from "@/data/catalog";
import { ProductGrid } from "@/components/store/ProductCard";

const hero = img("1517842645767-c639042777db", 1600);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PapeLemi — Papelaria afetiva e personalizados" },
      { name: "description", content: "Agendas, cadernos, lembranças, kits e brindes personalizados com carinho. Transformamos papel em memórias." },
      { property: "og:title", content: "PapeLemi — Papelaria afetiva e personalizados" },
      { property: "og:description", content: "Agendas, cadernos, lembranças, kits e brindes personalizados com carinho." },
      { property: "og:image", content: hero },
      { name: "twitter:image", content: hero },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "PapeLemi", description: "Papelaria personalizada e presentes afetivos" }) }],
  }),
  component: Home,
});

const Section = ({ eyebrow, title, children, link }: { eyebrow: string; title: string; children: React.ReactNode; link?: React.ReactNode }) => (
  <section className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p><h2 className="mt-2 text-4xl md:text-5xl">{title}</h2></div>
      {link}
    </div>
    {children}
  </section>
);
const SeeAll = ({ to, label }: { to: "/loja" | "/personalizados"; label: string }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm hover:text-primary">{label} <ArrowRight className="size-4" /></Link>
);

function Home() {
  const best = publishedProducts.filter((p) => p.bestSeller);
  const kits = publishedProducts.filter((p) => p.category === "kits" || p.category === "lembrancas");
  const custom = publishedProducts.filter((p) => p.personalization.some((o) => o.type === "text" && o.ai)).slice(0, 4);
  return (
    <>
      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 md:grid-cols-2 md:px-8 md:pt-16">
        <div className="order-2 md:order-1">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Papelaria com afeto</p>
          <h1 className="mt-4 text-5xl leading-[1.02] md:text-7xl">Transformamos papel em <em className="text-primary">memórias</em>.</h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">Agendas, cadernos, lembranças e kits personalizados à mão, com nome, frase e cada detalhe pensado para quem você ama.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/loja" className="rounded-full bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground shadow-soft transition-transform hover:-translate-y-0.5">Conhecer a loja</Link>
            <Link to="/personalizados" className="rounded-full border border-foreground/20 px-7 py-3.5 text-sm transition-colors hover:border-primary hover:text-primary">Criar um personalizado</Link>
          </div>
        </div>
        <div className="relative order-1 md:order-2">
          <img src={hero} alt="Agenda personalizada sobre mesa clara" className="aspect-[4/5] w-full rounded-[2rem] object-cover md:aspect-[5/6]" />
          <div className="absolute -bottom-5 left-4 max-w-[15rem] rounded-2xl bg-card p-4 shadow-soft md:-left-8">
            <p className="font-display text-xl italic">“Para você nunca esquecer o quanto é especial.”</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-primary"><Sparkles className="size-3" /> Frase sugerida pela nossa assistente</p>
          </div>
        </div>
      </section>

      <Section eyebrow="Explore" title="Categorias em destaque">
        <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
          {categories.map((c) => (
            <Link key={c.slug} to="/categoria/$slug" params={{ slug: c.slug }} className="group w-44 shrink-0 snap-start md:w-auto">
              <div className="aspect-square overflow-hidden rounded-full bg-muted"><img src={c.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-110" /></div>
              <p className="mt-3 text-center font-display text-xl group-hover:text-primary">{c.name}</p>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Queridinhos" title="Mais vendidos" link={<SeeAll to="/loja" label="Ver toda a loja" />}><ProductGrid items={best} /></Section>

      <section className="bg-secondary/60">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
          <img src={img("1586075010923-2dd4570fb338", 1200)} alt="Cartões e papéis delicados" loading="lazy" className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Novidade</p>
            <h2 className="mt-2 text-4xl md:text-5xl">Não sabe o que escrever? A gente te ajuda.</h2>
            <p className="mt-4 text-muted-foreground">Em cada produto personalizável, nossa assistente sugere frases, mensagens e dedicatórias no tom certo — afetuoso, divertido ou elegante. Você escolhe, ajusta e a gente imprime com carinho.</p>
            <Link to="/personalizados" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground"><Sparkles className="size-4" /> Experimentar agora</Link>
          </div>
        </div>
      </section>

      <Section eyebrow="Feitos para você" title="Produtos personalizados" link={<SeeAll to="/personalizados" label="Ver personalizados" />}><ProductGrid items={custom} /></Section>
      <Section eyebrow="Para presentear" title="Kits e lembranças"><ProductGrid items={kits} /></Section>

      <section className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="relative overflow-hidden rounded-[2rem]">
          <img src={img("1512909006721-3d6018887383", 1600)} alt="" loading="lazy" className="h-80 w-full object-cover md:h-96" />
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-foreground/70 to-transparent p-8 text-background md:p-12">
            <p className="text-xs uppercase tracking-[0.2em]">Coleção sazonal</p>
            <h2 className="mt-2 max-w-lg text-4xl md:text-5xl">Fim de ano com afeto: mimos para professores e equipes</h2>
            <Link to="/categoria/$slug" params={{ slug: "kits" }} className="mt-5 w-fit rounded-full bg-background px-6 py-3 text-sm text-foreground">Ver coleção</Link>
          </div>
        </div>
      </section>

      <Section eyebrow="Como funciona" title="Papelaria com afeto, do início ao laço">
        <div className="grid gap-8 md:grid-cols-3">
          {[{ i: Heart, t: "Você escolhe", d: "Selecione o produto, cores, estampa e acabamento." }, { i: PenLine, t: "Personalizamos", d: "Nome, frase e detalhes — com ajuda da assistente se quiser." }, { i: Package, t: "Produzimos e enviamos", d: "Cada peça é feita com cuidado e embalada para presentear." }].map(({ i: Icon, t, d }, n) => (
            <div key={t} className="border-t border-border pt-6">
              <p className="font-display text-5xl italic text-accent">0{n + 1}</p>
              <p className="mt-3 flex items-center gap-2 text-xl font-display"><Icon className="size-5 text-primary" /> {t}</p>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      <section className="mx-auto max-w-7xl px-4 md:px-8">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-primary">@papelemi no Instagram</p>
        <div className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-6">
          {["1531346878377-a5be20888e57", "1513201099705-a9746e1e201f", "1527239441953-caffd968d952", "1549465220-1a8b9238cd48", "1452860606245-08befc0ff44b", "1509909756405-be0199881695"].map((id) => (
            <img key={id} src={img(id, 400)} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">Depoimentos de clientes serão exibidos aqui quando disponibilizados.</p>
      </section>

      <section className="mx-auto mt-20 max-w-3xl px-4 text-center">
        <h2 className="text-4xl">Cartinhas da PapeLemi</h2>
        <p className="mt-3 text-muted-foreground">Receba novidades, pré-vendas e inspirações. Sem excessos, só afeto.</p>
        <form onSubmit={(e) => e.preventDefault()} className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row">
          <input type="email" required placeholder="Seu e-mail" aria-label="Seu e-mail" className="flex-1 rounded-full border border-input bg-card px-5 py-3 text-base outline-none focus:border-ring" />
          <button className="rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground">Quero receber</button>
        </form>
      </section>
    </>
  );
}
