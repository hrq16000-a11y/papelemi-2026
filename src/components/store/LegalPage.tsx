import type { ReactNode } from "react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-primary">Transparência</p>
      <h1 className="mt-2 text-5xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última atualização: {updated} · texto provisório, sujeito a revisão jurídica</p>
      <div className="mt-10 space-y-6 leading-relaxed [&_h2]:mt-10 [&_h2]:text-2xl [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
    </article>
  );
}
