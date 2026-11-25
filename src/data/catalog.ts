// Catálogo fiel à vitrine original da PapeLemi.
// Preços e prazos são referências exibidas na vitrine; a loja confirma disponibilidade,
// personalização, frete e pagamento antes da produção.
// Fotografias originais recuperadas do HTML integral da vitrine PapeLemi.
const ASSET_BY_SOURCE_ID: Record<string, string> = {
  "1519337265831-281ec6cc8514": "/images/papelemi/caderneta-ursinho-clean.jpg",
  "1531346878377-a5be20888e57": "/images/papelemi/caderneta-astronauta-luxo.jpg",
  "1517842645767-c639042777db": "/images/papelemi/caderneta-raio-de-sol.jpg",
  "1527239441953-caffd968d952": "/images/papelemi/planner-devocional-masculino.jpg",
  "1452860606245-08befc0ff44b": "/images/papelemi/bloco-anotacoes-capa-dura.jpg",
  "1586075010923-2dd4570fb338": "/images/papelemi/bloco-notas-9x11.jpg",
  "1513201099705-a9746e1e201f": "/images/papelemi/marca-pagina-magnetico.jpg",
  "1549465220-1a8b9238cd48": "/images/papelemi/caixa-porta-chocolate.jpg",
};
export const img = (id: string, _width = 900) =>
  ASSET_BY_SOURCE_ID[id] ?? "/images/papelemi/caderneta-ursinho-clean.jpg";

export type Category = { slug: string; name: string; description: string; image: string };
export type PersonalizationOption =
  | { type: "text"; key: string; label: string; maxLength: number; ai?: boolean }
  | { type: "choice"; key: string; label: string; options: string[] }
  | { type: "notes"; key: string; label: string };

export type Product = {
  slug: string;
  name: string;
  category: string;
  description: string;
  images: string[];
  price: number;
  promoPrice?: number;
  colors: string[];
  sizes: string[];
  finishes: string[];
  productionDays: string;
  stock?: number;
  published: boolean;
  bestSeller?: boolean;
  personalizable: boolean;
  personalization: PersonalizationOption[];
  minQty?: number;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  requiresShipping?: boolean;
};

export const categories: Category[] = [
  { slug: "cadernetas", name: "Cadernetas", description: "Para guardar cada fase.", image: img("1519337265831-281ec6cc8514") },
  { slug: "planners-blocos", name: "Planners & blocos", description: "Ideias para o dia a dia.", image: img("1527239441953-caffd968d952") },
  { slug: "mimos-lembrancas", name: "Mimos & lembranças", description: "Pequenos grandes gestos.", image: img("1513201099705-a9746e1e201f") },
  { slug: "brindes-personalizados", name: "Brindes personalizados", description: "Sua marca com afeto.", image: img("1549465220-1a8b9238cd48") },
];

const notes: PersonalizationOption = { type: "notes", key: "observacoes", label: "Observações para a encomenda" };
const nameAndDedication: PersonalizationOption[] = [
  { type: "text", key: "nome", label: "Nome", maxLength: 40 },
  { type: "text", key: "frase", label: "Mensagem ou dedicatória", maxLength: 140, ai: true },
];
const dedicationOnly: PersonalizationOption[] = [
  { type: "text", key: "frase", label: "Mensagem ou dedicatória", maxLength: 140, ai: true },
];
const referenceCopy = "Produto feito sob encomenda. A PapeLemi confirma os detalhes, a disponibilidade e o prazo antes da produção.";

export const products: Product[] = [
  {
    slug: "caderneta-saude-ursinho-clean",
    name: "Caderneta de Saúde · Ursinho Clean",
    category: "cadernetas",
    description: "Caderneta de Saúde com a arte Ursinho Clean. " + referenceCopy,
    images: [img("1519337265831-281ec6cc8514")],
    price: 59.9,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "10 dias úteis",
    published: true,
    personalizable: true,
    personalization: [...nameAndDedication, notes],
  },
  {
    slug: "caderneta-saude-astronauta-luxo",
    name: "Caderneta de Saúde · Astronauta Luxo",
    category: "cadernetas",
    description: "Caderneta de Saúde com a arte Astronauta Luxo. " + referenceCopy,
    images: [img("1531346878377-a5be20888e57")],
    price: 59.9,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "10 dias úteis",
    published: true,
    personalizable: true,
    personalization: [...nameAndDedication, notes],
  },
  {
    slug: "caderneta-saude-raio-de-sol",
    name: "Caderneta de Saúde · Raio de Sol",
    category: "cadernetas",
    description: "Caderneta de Saúde com a arte Raio de Sol. " + referenceCopy,
    images: [img("1517842645767-c639042777db")],
    price: 59.9,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "10 dias úteis",
    published: true,
    personalizable: true,
    personalization: [...nameAndDedication, notes],
  },
  {
    slug: "planner-devocional-masculino",
    name: "Planner Devocional Masculino Personalizado",
    category: "planners-blocos",
    description: "Planner Devocional Masculino personalizado. " + referenceCopy,
    images: [img("1527239441953-caffd968d952")],
    price: 64.8,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "10 dias úteis",
    published: true,
    personalizable: true,
    personalization: [...nameAndDedication, notes],
  },
  {
    slug: "bloco-anotacoes-dia-dos-pais-capa-dura",
    name: "Bloco de Anotações Dia dos Pais · Capa Dura",
    category: "planners-blocos",
    description: "Bloco de Anotações Dia dos Pais com capa dura. " + referenceCopy,
    images: [img("1452860606245-08befc0ff44b")],
    price: 24.9,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "10 dias úteis",
    published: true,
    personalizable: true,
    personalization: [...dedicationOnly, notes],
  },
  {
    slug: "bloco-notas-9x11-mimo-dia-dos-pais",
    name: "Bloco de Notas 9×11 · Mimo Dia dos Pais",
    category: "mimos-lembrancas",
    description: "Bloco de Notas 9×11 da coleção Mimo Dia dos Pais. " + referenceCopy,
    images: [img("1586075010923-2dd4570fb338")],
    price: 6.59,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "10 dias úteis",
    published: true,
    personalizable: true,
    personalization: [...dedicationOnly, notes],
  },
  {
    slug: "marca-pagina-magnetico-dia-dos-professores",
    name: "Marca Página Magnético · Dia dos Professores",
    category: "mimos-lembrancas",
    description: "Marca Página Magnético da coleção Dia dos Professores. " + referenceCopy,
    images: [img("1513201099705-a9746e1e201f")],
    price: 2.6,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "8 dias úteis",
    published: true,
    personalizable: true,
    personalization: [...dedicationOnly, notes],
  },
  {
    slug: "caixa-porta-chocolate-dia-dos-professores",
    name: "Caixa Porta Chocolate · Dia dos Professores",
    category: "brindes-personalizados",
    description: "Caixa Porta Chocolate da coleção Dia dos Professores. " + referenceCopy,
    images: [img("1549465220-1a8b9238cd48")],
    price: 3.5,
    colors: [],
    sizes: [],
    finishes: [],
    productionDays: "6 dias úteis",
    published: true,
    personalizable: true,
    personalization: [...dedicationOnly, notes],
  },
];

export const publishedProducts = products.filter((p) => p.published);
export const getProduct = (slug: string) => publishedProducts.find((p) => p.slug === slug);
export const getCategory = (slug: string) => categories.find((c) => c.slug === slug);
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const finalPrice = (p: Product) => p.promoPrice ?? p.price;

export const PRODUCT_ORDER = [
  "caderneta-saude-ursinho-clean",
  "caderneta-saude-astronauta-luxo",
  "caderneta-saude-raio-de-sol",
  "planner-devocional-masculino",
  "bloco-anotacoes-dia-dos-pais-capa-dura",
  "bloco-notas-9x11-mimo-dia-dos-pais",
  "marca-pagina-magnetico-dia-dos-professores",
  "caixa-porta-chocolate-dia-dos-professores",
] as const;
export function sortProducts(items: Product[]) {
  const order = new Map<string, number>(PRODUCT_ORDER.map((slug, index) => [slug, index]));
  return [...items].sort((a, b) => (order.get(a.slug) ?? 999) - (order.get(b.slug) ?? 999));
}
