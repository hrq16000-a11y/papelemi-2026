export interface LandingFAQ {
  question: string;
  answer: string;
}

export interface LembrancinhasLandingConfig {
  /** Slug da URL — `/lembrancinhas-<routeSlug>` */
  routeSlug: string;
  /** Slug da ocasião no banco (occasions.slug) usado para filtrar produtos */
  occasionSlug: string;
  /** <title> e og:title (até 60 chars) */
  seoTitle: string;
  /** <meta description> (até 160 chars) */
  seoDescription: string;
  /** H1 visível */
  h1: string;
  /** Frase de apoio sob o H1 */
  heroSubtitle: string;
  /** Selo / badge no topo do hero */
  heroBadge: string;
  /** Cor de destaque (Tailwind class para gradient suave) */
  themeAccent: string;
  /** Texto longo de SEO (~150-200 palavras) renderizado abaixo do grid */
  seoCopy: string;
  /** Mensagem pré-preenchida do WhatsApp */
  whatsappMessage: string;
  /** FAQs específicas da ocasião */
  faqs: LandingFAQ[];
  /** Slugs de outras landings para "Você também pode gostar" */
  relatedRouteSlugs: string[];
  /** URLs de fotos reais (sem stock). Quando vazio, a seção de galeria não é renderizada. */
  gallery?: (string | { src: string; alt?: string })[];
  /** Depoimentos curados para prova social. Quando vazio, a seção não é renderizada. */
  testimonials?: { name: string; location?: string; text: string; rating?: number }[];
  /** Estatísticas curtas para reforçar prova social (ex: "+2.000 famílias atendidas"). */
  socialProofStats?: { value: string; label: string }[];
  /** Imagem Open Graph específica desta landing (sobrescreve a global). */
  ogImage?: string;
  /** Texto alternativo da imagem OG. */
  ogImageAlt?: string;
}

export const LEMBRANCINHAS_LANDINGS: LembrancinhasLandingConfig[] = [];
export const getLandingByRouteSlug = (
  routeSlug: string
): LembrancinhasLandingConfig | undefined =>
  LEMBRANCINHAS_LANDINGS.find((l) => l.routeSlug === routeSlug);
