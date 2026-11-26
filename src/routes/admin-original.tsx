import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin-original")({
  head: () => ({ meta: [
    { title: "Painel original — PapeLemi" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: AdminOriginalPreview,
});

function AdminOriginalPreview() {
  return (
    <iframe
      title="Painel administrativo PapeLemi"
      src="/admin-engine/index.html#/admin"
      className="fixed inset-0 z-[10000] h-screen w-screen border-0 bg-background"
      allow="clipboard-read; clipboard-write"
      referrerPolicy="same-origin"
    />
  );
}
