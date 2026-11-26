export interface BlogFAQ {
  question: string;
  answer: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  /** HTML simples renderizado em <article> (Tailwind `prose`) */
  contentHtml: string;
  coverImage?: string;
  author: string;
  publishedAt: string; // ISO date
  updatedAt?: string;
  /** Tempo estimado de leitura, em minutos */
  readingMinutes: number;
  category: string;
  tags: string[];
  /** SEO */
  seoTitle?: string;
  seoDescription?: string;
  /** Slugs de outros posts relacionados (sugestões de leitura) */
  relatedSlugs?: string[];
  /** FAQs renderizadas no artigo + JSON-LD FAQPage */
  faqs?: BlogFAQ[];
  /** Se false, o post não é renderizado nem incluído no sitemap */
  published: boolean;
}

const AUTHOR = "Empório PapeLemi";

export const BLOG_POSTS: BlogPost[] = [];
export const getPublishedPosts = () =>
  BLOG_POSTS.filter((p) => p.published).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

export const getPostBySlug = (slug: string) =>
  BLOG_POSTS.find((p) => p.slug === slug && p.published);

export const getRelatedPosts = (slug: string, limit = 3) => {
  const current = BLOG_POSTS.find((p) => p.slug === slug);
  if (!current) return [];
  const explicit = (current.relatedSlugs || [])
    .map((s) => BLOG_POSTS.find((p) => p.slug === s && p.published))
    .filter((p): p is BlogPost => Boolean(p));
  if (explicit.length >= limit) return explicit.slice(0, limit);
  const fillers = getPublishedPosts().filter(
    (p) => p.slug !== slug && !explicit.find((e) => e.slug === p.slug),
  );
  return [...explicit, ...fillers].slice(0, limit);
};
