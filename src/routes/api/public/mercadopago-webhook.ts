import { createFileRoute } from "@tanstack/react-router";
import { confirmPaymentById, mpConfigured } from "@/lib/mp";

// Notificação do Mercado Pago: serve apenas de gatilho; o status é lido do pagamento buscado.
const handle = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (type !== "payment" || !id || !/^\d+$/.test(id) || !mpConfigured()) {
    return Response.json({ ok: true });
  }
  try {
    await confirmPaymentById(id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("Falha no webhook do Mercado Pago:", e);
    return Response.json({ ok: false }, { status: 500 });
  }
};

export const Route = createFileRoute("/api/public/mercadopago-webhook")({
  server: { handlers: { GET: handle, POST: handle } },
});
