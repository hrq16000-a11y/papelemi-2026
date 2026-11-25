import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/contato")({
  head: () => ({ meta: [
    { title: "Atendimento — PapeLemi" }, { name: "description", content: "Fale com a PapeLemi para encomendas, orçamentos e brindes corporativos." },
    { property: "og:title", content: "Atendimento — PapeLemi" }, { property: "og:description", content: "Encomendas, orçamentos e dúvidas." },
  ] }),
  component: Contact,
});

function Contact() {
  const f = "w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus:border-ring";
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-5xl">Vamos conversar?</h1>
      <p className="mt-3 text-muted-foreground">Encomendas especiais, orçamentos para eventos ou brindes corporativos. Respondemos com carinho.</p>
      <form onSubmit={(e) => { e.preventDefault(); toast("Formulário demonstrativo", { description: "O envio será ativado na próxima etapa." }); }} className="mt-8 grid gap-4">
        <input required placeholder="Seu nome" aria-label="Nome" className={f} />
        <input required type="email" placeholder="E-mail" aria-label="E-mail" className={f} />
        <select aria-label="Assunto" className={f}><option>Encomenda personalizada</option><option>Brindes corporativos</option><option>Dúvida sobre pedido</option><option>Outro</option></select>
        <textarea required rows={5} placeholder="Conte um pouco sobre o que você imagina" aria-label="Mensagem" className={f} />
        <button className="rounded-full bg-primary px-7 py-3.5 text-sm text-primary-foreground">Enviar mensagem</button>
      </form>
    </div>
  );
}
