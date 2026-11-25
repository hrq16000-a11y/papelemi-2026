// Configuração do Assistente de Personalização (compartilhada entre navegador e servidor).
import type { Product } from "./catalog";

export const STYLES = [
  { id: "afetuoso", label: "Afetuoso", hint: "Caloroso e próximo" },
  { id: "delicado", label: "Delicado", hint: "Suave e gentil" },
  { id: "emocionante", label: "Emocionante", hint: "Toca o coração" },
  { id: "inspirador", label: "Inspirador", hint: "Motiva e eleva" },
  { id: "divertido", label: "Divertido", hint: "Leve e bem-humorado" },
  { id: "elegante", label: "Elegante", hint: "Refinado e sóbrio" },
  { id: "religioso", label: "Religioso", hint: "Com fé — só se desejar" },
  { id: "profissional", label: "Profissional", hint: "Institucional e cordial" },
  { id: "minimalista", label: "Minimalista", hint: "Poucas palavras" },
] as const;
export type StyleId = (typeof STYLES)[number]["id"];

export const OCCASIONS = [
  { id: "nascimento", label: "Nascimento", hint: "Boas-vindas a uma nova vida", icon: "Baby" },
  { id: "cha-de-bebe", label: "Chá de bebê", hint: "Espera cheia de amor", icon: "Gift" },
  { id: "batizado", label: "Batizado", hint: "Um momento de bênção", icon: "Sun" },
  { id: "aniversario", label: "Aniversário", hint: "Mais um ano especial", icon: "Cake" },
  { id: "casamento", label: "Casamento", hint: "Amor que se celebra", icon: "Gem" },
  { id: "dia-das-maes", label: "Dia das Mães", hint: "Para quem cuida", icon: "Flower2" },
  { id: "dia-dos-pais", label: "Dia dos Pais", hint: "Gratidão e parceria", icon: "Coffee" },
  { id: "amizade", label: "Amizade", hint: "Quem está sempre perto", icon: "HeartHandshake" },
  { id: "formatura", label: "Formatura", hint: "Conquista e novos começos", icon: "GraduationCap" },
  { id: "agradecimento", label: "Agradecimento", hint: "Dizer obrigado com carinho", icon: "Heart" },
  { id: "presente-especial", label: "Presente especial", hint: "Só porque sim", icon: "Sparkles" },
  { id: "uso-pessoal", label: "Uso pessoal", hint: "Uma frase para você", icon: "PenLine" },
  { id: "corporativo", label: "Eventos corporativos", hint: "Equipes e clientes", icon: "Briefcase" },
] as const;

type Profile = { theme: string; guidance: string; defaultStyle: StyleId; suggestedOccasions: string[] };
const BY_CATEGORY: Record<string, Profile> = {
  "agendas-e-planners": { theme: "Agendas e planners", guidance: "frases motivacionais sobre organização, propósito, constância e bons dias", defaultStyle: "inspirador", suggestedOccasions: ["uso-pessoal", "presente-especial", "aniversario"] },
  cadernos: { theme: "Cadernos e diários", guidance: "reflexões, inspiração e mensagens pessoais para registrar ideias e memórias", defaultStyle: "delicado", suggestedOccasions: ["uso-pessoal", "amizade", "presente-especial"] },
  lembrancas: { theme: "Lembranças", guidance: "mensagens curtas e marcantes para eventos, fáceis de ler em tags e cartões", defaultStyle: "afetuoso", suggestedOccasions: ["nascimento", "casamento", "agradecimento"] },
  kits: { theme: "Kits e presentes personalizados", guidance: "dedicatórias para pessoas especiais e mensagens curtas para eventos", defaultStyle: "afetuoso", suggestedOccasions: ["presente-especial", "agradecimento", "aniversario"] },
  "brindes-corporativos": { theme: "Brindes corporativos", guidance: "mensagens institucionais, profissionais e cordiais, sem intimidade excessiva", defaultStyle: "profissional", suggestedOccasions: ["corporativo", "agradecimento"] },
};
const BABY: Profile = { theme: "Cadernetas de saúde e bebê", guidance: "mensagens afetivas sobre nascimento, maternidade, chegada e primeiros cuidados", defaultStyle: "delicado", suggestedOccasions: ["nascimento", "cha-de-bebe", "batizado"] };

export function getAiProfile(p: Pick<Product, "slug" | "category">): Profile {
  if (/bebe|saude|maternidade/.test(p.slug)) return BABY;
  return BY_CATEGORY[p.category] ?? BY_CATEGORY["kits"]!;
}
export const LENGTH_OPTIONS = [60, 100, 140, 180, 220];
