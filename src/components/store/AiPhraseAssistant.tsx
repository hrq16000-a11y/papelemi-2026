import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { suggestPhrases } from "@/lib/ai.functions";

const tones = ["Afetuoso", "Divertido", "Elegante", "Inspirador", "Profissional"];
const occasions = ["Aniversário", "Dia dos Professores", "Maternidade", "Formatura", "Casamento", "Natal", "Boas-vindas na empresa", "Só porque sim"];

export function AiPhraseAssistant({ product, field, maxLength, onPick }: { product: string; field: string; maxLength: number; onPick: (s: string) => void }) {
  const run = useServerFn(suggestPhrases);
  const [open, setOpen] = useState(false);
  const [occasion, setOccasion] = useState("");
  const [recipient, setRecipient] = useState("");
  const [tone, setTone] = useState("Afetuoso");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const r = await run({ data: { product, field, occasion, recipient, tone, details, maxLength } });
      setList(r.suggestions); setError(r.error ?? (r.suggestions.length ? null : "Nenhuma sugestão desta vez. Tente de novo."));
    } catch { setError("Não consegui gerar sugestões agora."); }
    setLoading(false);
  };

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
      <Sparkles className="size-4" /> Me ajude a escrever com afeto
    </button>
  );

  const input = "w-full rounded-lg border border-input bg-card px-3 py-2 text-base md:text-sm outline-none focus:border-ring";
  return (
    <div className="mt-3 rounded-2xl border border-accent bg-secondary/50 p-4">
      <p className="flex items-center gap-2 font-display text-lg"><Sparkles className="size-4 text-primary" /> Assistente de dedicatórias</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <select value={occasion} onChange={(e) => setOccasion(e.target.value)} className={input} aria-label="Ocasião">
          <option value="">Ocasião…</option>{occasions.map((o) => <option key={o}>{o}</option>)}
        </select>
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Para quem? (ex.: minha mãe)" className={input} maxLength={80} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {tones.map((t) => (
          <button type="button" key={t} onClick={() => setTone(t)} className={`rounded-full border px-3 py-1 text-xs transition-colors ${tone === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}>{t}</button>
        ))}
      </div>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Algum detalhe especial? (opcional)" className={`${input} mt-3`} rows={2} maxLength={300} />
      <button type="button" onClick={generate} disabled={loading} className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {list.length ? "Gerar outras" : "Sugerir frases"}
      </button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {list.length > 0 && (
        <ul className="mt-4 space-y-2">
          {list.map((s) => (
            <li key={s}>
              <button type="button" onClick={() => onPick(s)} className="w-full rounded-xl border border-border bg-card p-3 text-left font-display text-lg italic leading-snug transition-colors hover:border-primary">“{s}”<span className="mt-1 block font-sans text-xs not-italic text-primary">Usar esta frase</span></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
