import { createFileRoute, Link } from "@tanstack/react-router";
import { img } from "@/data/catalog";

export const Route = createFileRoute("/sobre")({
  head: () => ({ meta: [
    { title: "Nossa história — PapeLemi" }, { name: "description", content: "Conheça a PapeLemi, papelaria afetiva que transforma papel em memórias." },
    { property: "og:title", content: "Nossa história — PapeLemi" }, { property: "og:description", content: "Papelaria com afeto, feita à mão." },
  ] }),
  component: () => (
    <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:px-8">
      <img src={img("1527239441953-caffd968d952", 1200)} alt="Bancada de papelaria artesanal" className="aspect-[4/5] w-full rounded-[2rem] object-cover" />
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Nossa história</p>
        <h1 className="mt-2 text-5xl md:text-6xl">Papel, tempo e carinho.</h1>
        <div className="mt-6 space-y-4 text-lg text-muted-foreground">
          <p>A PapeLemi nasceu do desejo de transformar objetos do dia a dia em lembranças que ficam. Cada agenda, caderno ou kit é pensado para carregar um pedaço de quem presenteia.</p>
          <p>Trabalhamos com produção cuidadosa, papéis selecionados e acabamentos delicados — do primeiro rascunho ao laço final.</p>
          <p className="text-sm">Texto provisório — será substituído pela história oficial da marca.</p>
        </div>
        <Link to="/loja" className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm text-primary-foreground">Conhecer a loja</Link>
      </div>
    </div>
  ),
});
