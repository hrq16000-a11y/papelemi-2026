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
  { id: "dia-dos-professores", label: "Dia dos Professores", hint: "Reconhecimento e carinho", icon: "GraduationCap" },
  { id: "amizade", label: "Amizade", hint: "Quem está sempre perto", icon: "HeartHandshake" },
  { id: "formatura", label: "Formatura", hint: "Conquista e novos começos", icon: "GraduationCap" },
  { id: "agradecimento", label: "Agradecimento", hint: "Dizer obrigado com carinho", icon: "Heart" },
  { id: "presente-especial", label: "Presente especial", hint: "Só porque sim", icon: "Sparkles" },
  { id: "uso-pessoal", label: "Uso pessoal", hint: "Uma frase para você", icon: "PenLine" },
  { id: "corporativo", label: "Eventos corporativos", hint: "Equipes e clientes", icon: "Briefcase" },
] as const;

type Profile = { theme: string; guidance: string; defaultStyle: StyleId; suggestedOccasions: string[] };
const BY_CATEGORY: Record<string, Profile> = {
  cadernetas: {
    theme: "Cadernetas de saúde e bebê",
    guidance: "mensagens afetivas sobre nascimento, maternidade, chegada e primeiros cuidados",
    defaultStyle: "delicado",
    suggestedOccasions: ["nascimento", "cha-de-bebe", "batizado"],
  },
  "planners-blocos": {
    theme: "Planners & blocos",
    guidance: "frases pessoais e inspiradoras para organizar, registrar ideias e celebrar pessoas",
    defaultStyle: "inspirador",
    suggestedOccasions: ["uso-pessoal", "dia-dos-pais", "presente-especial"],
  },
  "mimos-lembrancas": {
    theme: "Mimos & lembranças",
    guidance: "mensagens curtas e afetuosas para pequenos presentes, lembranças e agradecimentos",
    defaultStyle: "afetuoso",
    suggestedOccasions: ["dia-dos-professores", "agradecimento", "presente-especial"],
  },
  "brindes-personalizados": {
    theme: "Brindes personalizados",
    guidance: "mensagens curtas e acolhedoras para acompanhar presentes e pequenas celebrações",
    defaultStyle: "afetuoso",
    suggestedOccasions: ["dia-dos-professores", "agradecimento", "presente-especial"],
  },
};

export function getAiProfile(p: Pick<Product, "slug" | "category">): Profile {
  return BY_CATEGORY[p.category] ?? BY_CATEGORY["mimos-lembrancas"]!;
}
export const LENGTH_OPTIONS = [60, 100, 140, 180, 220];
