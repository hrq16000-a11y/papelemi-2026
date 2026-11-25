import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  product: z.string().max(120),
  field: z.string().max(60),
  occasion: z.string().max(80),
  recipient: z.string().max(80),
  tone: z.string().max(40),
  details: z.string().max(300),
  maxLength: z.number().int().min(20).max(400),
});

export const suggestPhrases = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    try {
      const res = await generateResponse({
        model: "openai/gpt-6.1-sol",
        instructions:
          "Você é redatora da PapeLemi, papelaria afetiva brasileira. Escreva em português do Brasil, com delicadeza, calor humano e elegância, sem clichês exagerados nem emojis. Responda SOMENTE com JSON no formato {\"sugestoes\":[\"...\",\"...\",\"...\",\"...\"]}.",
        input: `Produto: ${data.product}\nCampo: ${data.field}\nOcasião: ${data.occasion || "não informada"}\nPara quem: ${data.recipient || "não informado"}\nTom: ${data.tone}\nDetalhes: ${data.details || "nenhum"}\nCrie 4 sugestões diferentes, cada uma com no máximo ${data.maxLength} caracteres.`,
      });
      const r = res as unknown as { output_text?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
      const text = r.output_text ?? (r.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { sugestoes?: unknown };
      const list = Array.isArray(json.sugestoes) ? json.sugestoes.filter((s): s is string => typeof s === "string") : [];
      return { suggestions: list.map((s) => s.slice(0, data.maxLength)).slice(0, 4), error: null as string | null };
    } catch (e) {
      console.error(e);
      const msg = e instanceof GatewayError && e.httpStatus === 429 ? "Muitos pedidos agora. Tente em instantes." : e instanceof GatewayError && e.httpStatus === 402 ? "Assistente indisponível no momento (créditos de IA)." : "Não consegui gerar sugestões agora. Tente novamente.";
      return { suggestions: [] as string[], error: msg };
    }
  });
