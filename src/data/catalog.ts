// DADOS DEMONSTRATIVOS — substituir pela importação do catálogo real da PapeLemi.
// Preços, estoques e prazos abaixo NÃO são reais.
export const img = (id: string, w = 900) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&q=75&auto=format&fit=crop`;

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
  stock: number;
  published: boolean;
  bestSeller?: boolean;
  personalizable: boolean;
  personalization: PersonalizationOption[];
  minQty?: number;
};

export const categories: Category[] = [
  { slug: "agendas-e-planners", name: "Agendas e planners", description: "Para organizar dias com intenção e beleza.", image: img("1517842645767-c639042777db") },
  { slug: "cadernos", name: "Cadernos", description: "Páginas prontas para ideias, memórias e listas.", image: img("1531346878377-a5be20888e57") },
  { slug: "lembrancas", name: "Lembranças", description: "Pequenos mimos que guardam grandes momentos.", image: img("1513201099705-a9746e1e201f") },
  { slug: "kits", name: "Kits", description: "Combinações pensadas para presentear com afeto.", image: img("1549465220-1a8b9238cd48") },
  { slug: "brindes-corporativos", name: "Brindes corporativos", description: "Sua marca lembrada com delicadeza e cuidado.", image: img("1456735190827-d1262f71b8a3") },
];

const nameAndPhrase: PersonalizationOption[] = [
  { type: "text", key: "nome", label: "Nome na capa", maxLength: 30 },
  { type: "text", key: "frase", label: "Frase ou dedicatória", maxLength: 140, ai: true },
];
const notes: PersonalizationOption = { type: "notes", key: "obs", label: "Observações para a produção" };

export const products: Product[] = [
  { slug: "agenda-afeto-2027", name: "Agenda Afeto 2027", category: "agendas-e-planners", description: "Agenda diária com capa dura, miolo pólen 90g e páginas de reflexão mensal. Personalizada com nome e frase.", images: [img("1517842645767-c639042777db"), img("1531346878377-a5be20888e57")], price: 129.9, promoPrice: 114.9, colors: ["Rosa quartzo", "Creme", "Verde sálvia"], sizes: ["A5", "B5"], finishes: ["Hot stamping dourado", "Impressão fosca"], productionDays: "7 a 10 dias úteis", stock: 24, published: true, bestSeller: true, personalizable: true, personalization: [...nameAndPhrase, { type: "choice", key: "tema", label: "Estampa da capa", options: ["Floral aquarela", "Liso minimalista", "Poá delicado"] }, notes] },
  { slug: "planner-semanal-respiro", name: "Planner Semanal Respiro", category: "agendas-e-planners", description: "Planner sem datas, com visão semanal, hábitos e metas. Encadernação wire-o.", images: [img("1531346878377-a5be20888e57")], price: 89.9, colors: ["Rosa", "Off-white"], sizes: ["A5"], finishes: ["Wire-o dourado", "Wire-o branco"], productionDays: "5 a 7 dias úteis", stock: 18, published: true, personalizable: true, personalization: [...nameAndPhrase, notes] },
  { slug: "caderno-memorias", name: "Caderno Memórias", category: "cadernos", description: "Caderno pautado com capa em tecido e marcador de cetim. Ideal para diários e registros afetivos.", images: [img("1531346878377-a5be20888e57"), img("1527239441953-caffd968d952")], price: 69.9, colors: ["Linho", "Rosa antigo"], sizes: ["A5", "A6"], finishes: ["Capa em tecido", "Capa laminada"], productionDays: "5 a 7 dias úteis", stock: 30, published: true, bestSeller: true, personalizable: true, personalization: [...nameAndPhrase, notes] },
  { slug: "caderneta-de-receitas", name: "Caderneta de Receitas de Família", category: "cadernos", description: "Caderneta com páginas guiadas para registrar receitas e as histórias por trás delas.", images: [img("1527239441953-caffd968d952")], price: 79.9, colors: ["Creme", "Terracota"], sizes: ["A5"], finishes: ["Costura aparente"], productionDays: "7 dias úteis", stock: 12, published: true, personalizable: true, personalization: [...nameAndPhrase, notes] },
  { slug: "caderneta-de-saude-bebe", name: "Caderneta de Saúde do Bebê", category: "cadernos", description: "Capa personalizada para caderneta de saúde, com nome do bebê e espaço para fotos.", images: [img("1519337265831-281ec6cc8514")], price: 59.9, colors: ["Rosa", "Azul névoa", "Areia"], sizes: ["Padrão"], finishes: ["Laminação soft touch"], productionDays: "5 dias úteis", stock: 20, published: true, bestSeller: true, personalizable: true, personalization: [{ type: "text", key: "nome", label: "Nome do bebê", maxLength: 30 }, { type: "text", key: "frase", label: "Mensagem de boas-vindas", maxLength: 140, ai: true }, notes] },
  { slug: "tag-lembranca-maternidade", name: "Tags de Lembrança Maternidade", category: "lembrancas", description: "Tags impressas em papel algodão com cordão de juta, para mimos de maternidade.", images: [img("1513201099705-a9746e1e201f")], price: 2.9, colors: ["Rosa", "Verde sálvia"], sizes: ["5x8 cm"], finishes: ["Papel algodão 300g"], productionDays: "5 dias úteis", stock: 500, published: true, personalizable: true, minQty: 20, personalization: [...nameAndPhrase, notes] },
  { slug: "cartao-dedicatoria", name: "Cartão Dedicatória", category: "lembrancas", description: "Cartão dobrado com envelope colorido, para acompanhar presentes com uma mensagem especial.", images: [img("1586075010923-2dd4570fb338")], price: 12.9, colors: ["Rosa", "Creme", "Lavanda"], sizes: ["10x15 cm"], finishes: ["Relevo seco"], productionDays: "3 dias úteis", stock: 80, published: true, personalizable: true, personalization: [{ type: "text", key: "frase", label: "Mensagem do cartão", maxLength: 220, ai: true }, notes] },
  { slug: "kit-professora-querida", name: "Kit Professora Querida", category: "kits", description: "Caderno, bloco de notas, marcador e cartão em caixa presenteável. Perfeito para fim de ano letivo.", images: [img("1549465220-1a8b9238cd48"), img("1512909006721-3d6018887383")], price: 149.9, colors: ["Rosa", "Off-white"], sizes: ["Único"], finishes: ["Caixa rígida com laço"], productionDays: "10 dias úteis", stock: 10, published: true, bestSeller: true, personalizable: true, personalization: [{ type: "text", key: "nome", label: "Nome da professora", maxLength: 30 }, { type: "text", key: "frase", label: "Dedicatória", maxLength: 180, ai: true }, notes] },
  { slug: "kit-boas-vindas-bebe", name: "Kit Boas-vindas Bebê", category: "kits", description: "Caderneta de saúde, álbum de memórias e tags personalizadas em uma caixa delicada.", images: [img("1512909006721-3d6018887383")], price: 219.9, colors: ["Rosa", "Areia"], sizes: ["Único"], finishes: ["Caixa com visor"], productionDays: "10 a 12 dias úteis", stock: 6, published: true, personalizable: true, personalization: [{ type: "text", key: "nome", label: "Nome do bebê", maxLength: 30 }, { type: "text", key: "frase", label: "Mensagem", maxLength: 180, ai: true }, notes] },
  { slug: "kit-onboarding-empresa", name: "Kit Onboarding Empresa", category: "brindes-corporativos", description: "Caderno, caneta e cartão de boas-vindas com a identidade da sua empresa.", images: [img("1456735190827-d1262f71b8a3")], price: 98.9, colors: ["Cores da marca"], sizes: ["Único"], finishes: ["Hot stamping", "Impressão digital"], productionDays: "15 dias úteis", stock: 100, published: true, personalizable: true, minQty: 10, personalization: [{ type: "text", key: "nome", label: "Nome da empresa", maxLength: 40 }, { type: "text", key: "frase", label: "Mensagem de boas-vindas", maxLength: 180, ai: true }, notes] },
  { slug: "bloco-de-notas-marca", name: "Bloco de Notas com Marca", category: "brindes-corporativos", description: "Bloco de notas 50 folhas com logotipo e paleta da empresa.", images: [img("1452860606245-08befc0ff44b")], price: 18.9, colors: ["Cores da marca"], sizes: ["A6", "A5"], finishes: ["Colado no topo"], productionDays: "10 dias úteis", stock: 300, published: true, personalizable: true, minQty: 30, personalization: [{ type: "text", key: "nome", label: "Nome da empresa", maxLength: 40 }, { type: "text", key: "frase", label: "Slogan ou frase", maxLength: 80, ai: true }, notes] },
  { slug: "calendario-de-mesa-afeto", name: "Calendário de Mesa Afeto", category: "agendas-e-planners", description: "Calendário 2027 com base em kraft e frases inspiradoras mês a mês.", images: [img("1509909756405-be0199881695")], price: 39.9, colors: ["Rosa", "Kraft"], sizes: ["15x20 cm"], finishes: ["Wire-o"], productionDays: "5 dias úteis", stock: 40, published: true, personalizable: true, personalization: [...nameAndPhrase, notes] },
];

export const publishedProducts = products.filter((p) => p.published);
export const getProduct = (slug: string) => publishedProducts.find((p) => p.slug === slug);
export const getCategory = (slug: string) => categories.find((c) => c.slug === slug);
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const finalPrice = (p: Product) => p.promoPrice ?? p.price;
