import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { brl } from "@/data/catalog";
import { getOrderStatus } from "@/lib/shop.functions";

export const Route = createFileRoute("/pedido/$id")({
  head: () => ({ meta: [
    { title: "Acompanhar pedido — PapeLemi" },
    { name: "description", content: "Situação do seu pedido PapeLemi." },
    { property: "og:title", content: "Acompanhar pedido — PapeLemi" },
    { name: "robots", content: "noindex" },
  ] }),
  component: OrderPage,
});

const LABELS: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pagamento confirmado",
  shipped: "Pedido enviado",
  delivered: "Pedido entregue",
  cancelled: "Pedido cancelado",
};

function OrderPage() {
  const { id } = Route.useParams();
  const [state, setState] = useState<{ status: string; total: number } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await getOrderStatus({ data: { orderId: id } });
        setState(r);
        if (r.status === "pending" && ++tries < 24) timer = setTimeout(tick, 5000);
      } catch { setError(true); }
    };
    tick();
    return () => clearTimeout(timer);
  }, [id]);

  if (error) return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-4xl">Pedido não encontrado</h1>
      <p className="mt-3 text-muted-foreground">Confira o link recebido ou fale com a gente.</p>
      <Link to="/contato" className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm text-primary-foreground">Falar com a PapeLemi</Link>
    </div>
  );

  if (!state) return (
    <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>
  );

  const icon = state.status === "paid" || state.status === "delivered" || state.status === "shipped"
    ? <CheckCircle2 className="mx-auto size-12 text-primary" />
    : state.status === "cancelled"
      ? <XCircle className="mx-auto size-12 text-destructive" />
      : <Clock className="mx-auto size-12 text-primary" />;

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      {icon}
      <h1 className="mt-4 text-4xl">{LABELS[state.status] ?? state.status}</h1>
      <p className="mt-3 text-muted-foreground">Pedido <span className="font-medium text-foreground">{id.slice(0, 8)}</span> · Total {brl(state.total)}</p>
      {state.status === "pending" && (
        <p className="mt-2 text-sm text-muted-foreground">Se você já pagou, a confirmação pode levar alguns instantes. Esta página atualiza sozinha.</p>
      )}
      {state.status === "paid" && (
        <p className="mt-2 text-sm text-muted-foreground">Obrigada! Vamos preparar tudo com carinho e avisar quando enviar.</p>
      )}
      <Link to="/loja" className="mt-8 inline-block rounded-full border border-border px-7 py-3 text-sm hover:border-primary">Voltar à loja</Link>
    </div>
  );
}
