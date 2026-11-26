import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE = path.resolve(process.env.EMPORIO_SOURCE_DIR || "/tmp/emporio-source");
const SOURCE_SHA = process.env.EMPORIO_SOURCE_SHA || "unknown";
const counts = { reused: 0, bytes: 0, skippedMedia: 0, byArea: {} };
const binaryExtensions = new Set([".png",".jpg",".jpeg",".webp",".gif",".ico",".avif",".bmp",".woff",".woff2",".ttf",".otf",".mp4",".mp3",".wav",".glb",".gltf",".pdf",".zip",".psd",".ai"]);

function transformText(text, namespaced = false, brand = false) {
  if (namespaced) {
    text = text.replace(/(["'])@\/assets\/[^"']+\1/g, '$1@/emp-orio/assets/papelemi-mark.svg$1');
    text = text.replace(/(["'])(?:\.\.\/)+assets\/[^"']+\1/g, '$1@/emp-orio/assets/papelemi-mark.svg$1');
    text = text.replace(/@\/(?!emp-orio\/)/g, "@/emp-orio/");
    text = text.replace(/(["'])date-fns\1/g, '$1date-fns-v3$1');
    text = text.replace(/(["'])react-day-picker\1/g, '$1react-day-picker-v8$1');
    text = text.replace(/(["'])react-resizable-panels\1/g, '$1react-resizable-panels-v2$1');
    text = text.replaceAll('"/acesso-restrito"', '"/admin/acesso-restrito"');
    text = text.replaceAll("'/acesso-restrito'", "'/admin/acesso-restrito'");
    brand = true;
  }
  if (brand) {
    text = text.replaceAll("LeleCute", "PapeLemi");
    text = text.replaceAll("Empório LeleCute", "PapeLemi");
    text = text.replace(/https?:\/\/(?:www\.)?lelecute\.com\.br/gi, "https://www.papelemi.com.br");
  }
  return text;
}

async function copyTree(sourceRel, targetRel, area, options = {}) {
  const fromRoot = path.join(SOURCE, sourceRel);
  const toRoot = path.join(ROOT, targetRel);
  await fs.mkdir(toRoot, { recursive: true });
  async function walk(from, to) {
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      const fromPath = path.join(from, entry.name);
      const toPath = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(toPath, { recursive: true });
        await walk(fromPath, toPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (binaryExtensions.has(ext)) { counts.skippedMedia++; continue; }
        let content;
        try { content = await fs.readFile(fromPath, "utf8"); }
        catch { counts.skippedMedia++; continue; }
        if (content.includes(String.fromCharCode(0))) { counts.skippedMedia++; continue; }
        if (options.transform !== false) content = transformText(content, !!options.namespaced, !!options.brand);
        await fs.mkdir(path.dirname(toPath), { recursive: true });
        await fs.writeFile(toPath, content, "utf8");
        counts.reused++;
        counts.bytes += Buffer.byteLength(content);
        counts.byArea[area] = (counts.byArea[area] || 0) + 1;
      }
    }
  }
  await walk(fromRoot, toRoot);
}

async function copyFile(sourceRel, targetRel, options = {}) {
  let content = await fs.readFile(path.join(SOURCE, sourceRel), "utf8");
  if (options.transform !== false) content = transformText(content, !!options.namespaced, !!options.brand);
  const target = path.join(ROOT, targetRel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  counts.reused++;
  counts.bytes += Buffer.byteLength(content);
  const area = options.area || "single";
  counts.byArea[area] = (counts.byArea[area] || 0) + 1;
}

function scopedAdminTheme() {
  return [
    ".emp-orio-admin {",
    "  --background: 40 40% 97%; --foreground: 220 15% 25%; --card: 0 0% 100%; --card-foreground: 220 15% 25%;",
    "  --popover: 0 0% 100%; --popover-foreground: 220 15% 25%; --primary: 340 36% 68%; --primary-foreground: 0 0% 100%;",
    "  --secondary: 30 30% 94%; --secondary-foreground: 220 12% 38%; --muted: 38 25% 93%; --muted-foreground: 220 9% 46%;",
    "  --accent: 340 35% 94%; --accent-foreground: 340 32% 40%; --destructive: 0 72% 54%; --destructive-foreground: 0 0% 100%;",
    "  --border: 35 20% 87%; --input: 35 20% 89%; --ring: 340 36% 68%; --coral: 340 36% 68%; --coral-light: 340 45% 94%; --coral-dark: 340 38% 51%;",
    "  --warm-gray: 220 12% 38%; --soft-gray: 220 8% 70%; --cream: 40 40% 97%; --success: 145 35% 45%; --success-foreground: 0 0% 100%;",
    "  --success-light: 145 40% 92%; --success-dark: 145 40% 38%; --sidebar-background: 0 0% 99%; --sidebar-foreground: 220 15% 25%;",
    "  --sidebar-primary: 340 36% 68%; --sidebar-primary-foreground: 0 0% 100%; --sidebar-accent: 340 35% 94%; --sidebar-accent-foreground: 340 32% 40%;",
    "  --sidebar-border: 35 20% 87%; --sidebar-ring: 340 36% 68%;",
    "  --color-background: hsl(var(--background)); --color-foreground: hsl(var(--foreground)); --color-card: hsl(var(--card)); --color-card-foreground: hsl(var(--card-foreground));",
    "  --color-popover: hsl(var(--popover)); --color-popover-foreground: hsl(var(--popover-foreground)); --color-primary: hsl(var(--primary)); --color-primary-foreground: hsl(var(--primary-foreground));",
    "  --color-secondary: hsl(var(--secondary)); --color-secondary-foreground: hsl(var(--secondary-foreground)); --color-muted: hsl(var(--muted)); --color-muted-foreground: hsl(var(--muted-foreground));",
    "  --color-accent: hsl(var(--accent)); --color-accent-foreground: hsl(var(--accent-foreground)); --color-destructive: hsl(var(--destructive)); --color-destructive-foreground: hsl(var(--destructive-foreground));",
    "  --color-border: hsl(var(--border)); --color-input: hsl(var(--input)); --color-ring: hsl(var(--ring));",
    "  --color-coral: hsl(var(--coral)); --color-coral-light: hsl(var(--coral-light)); --color-coral-dark: hsl(var(--coral-dark));",
    "  --color-warm-gray: hsl(var(--warm-gray)); --color-soft-gray: hsl(var(--soft-gray)); --color-cream: hsl(var(--cream));",
    "  --color-success: hsl(var(--success)); --color-success-foreground: hsl(var(--success-foreground)); --color-success-light: hsl(var(--success-light)); --color-success-dark: hsl(var(--success-dark));",
    "  --color-sidebar: hsl(var(--sidebar-background)); --color-sidebar-foreground: hsl(var(--sidebar-foreground)); --color-sidebar-primary: hsl(var(--sidebar-primary));",
    "  --color-sidebar-primary-foreground: hsl(var(--sidebar-primary-foreground)); --color-sidebar-accent: hsl(var(--sidebar-accent)); --color-sidebar-accent-foreground: hsl(var(--sidebar-accent-foreground));",
    "  --color-sidebar-border: hsl(var(--sidebar-border)); --color-sidebar-ring: hsl(var(--sidebar-ring));",
    '  --font-display: "DM Serif Display", Georgia, serif; --font-body: "DM Sans", system-ui, sans-serif;',
    '  min-height: 100%; background: hsl(var(--background)); color: hsl(var(--foreground)); font-family: "DM Sans", system-ui, sans-serif;',
    "}",
    ".emp-orio-admin * { border-color: hsl(var(--border)); }",
    '.emp-orio-admin h1, .emp-orio-admin h2, .emp-orio-admin h3, .emp-orio-admin h4, .emp-orio-admin h5, .emp-orio-admin h6 { font-family: "DM Serif Display", Georgia, serif; }',
    ".emp-orio-admin .scrollbar-thin { scrollbar-width: thin; }",
    ".emp-orio-admin .scrollbar-thumb-border { scrollbar-color: hsl(var(--border)) transparent; }",
    ".emp-orio-admin .bg-dotted-pattern { background-image: radial-gradient(circle, hsl(var(--coral) / .15) 1px, transparent 1px); background-size: 24px 24px; }",
    ".emp-orio-admin .bg-hearts-pattern { background-image: radial-gradient(circle, hsl(var(--primary) / .12) 1px, transparent 1px); background-size: 32px 32px; }",
    ".emp-orio-admin .border-dashed-coral { border: 2px dashed hsl(var(--coral) / .4); border-radius: 50%; }",
    '.emp-orio-admin .font-script { font-family: "DM Serif Display", Georgia, serif; font-style: italic; }',
    "@media (prefers-reduced-motion: reduce) { .emp-orio-admin *, .emp-orio-admin *::before, .emp-orio-admin *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; } }"
  ].join("\n");
}

async function writeDataAdapters() {
  const productsSource = await fs.readFile(path.join(SOURCE, "src/data/products.ts"), "utf8");
  const productsIndex = productsSource.indexOf("export const products");
  if (productsIndex < 0) throw new Error("Original product interface not found.");
  let productTypes = productsSource.slice(0, productsIndex);
  productTypes = productTypes.replace('category: "sabonetes" | "velas" | "kits" | "outros";', "category: string;");
  productTypes = productTypes.replace('occasions: ("maternidade" | "cha-bebe" | "batizado" | "casamento" | "aniversario" | "corporativo")[];', "occasions: string[];");
  const productsAdapter = productTypes + "\n" + [
    'import { categories as papeCategories, products as papeProducts } from "@/data/catalog";',
    "",
    "export const products: Product[] = papeProducts.map((product) => ({",
    "  id: product.slug, slug: product.slug, name: product.name, description: product.description,",
    "  price: Number(product.price).toFixed(2), priceValue: Number(product.price),",
    "  originalPrice: product.promoPrice == null ? undefined : Number(product.promoPrice).toFixed(2),",
    '  image: product.images[0] ?? "", images: product.images, link: "/produto/" + product.slug,',
    '  badge: product.bestSeller ? "Destaque" : undefined, rating: 0, category: product.category,',
    "  occasions: [], keywords: [], min_quantity: product.minQty, production_days: null,",
    "  production_speed: null, personalization_enabled: product.personalizable, featured_weight: product.bestSeller ? 1 : 0,",
    "}));",
    'export const categories = papeCategories.map((category) => ({ id: category.slug, name: category.name, icon: "✦" }));',
    "export const occasions: { id: string; name: string; icon: string }[] = [];",
    'export const states = ["Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"];',
    "export const getProductBySlug = (slug: string): Product | undefined => products.find((product) => product.slug === slug);"
  ].join("\n");
  const productsPath = path.join(ROOT, "src/emp-orio/data/products.ts");
  await fs.mkdir(path.dirname(productsPath), { recursive: true });
  await fs.writeFile(productsPath, productsAdapter, "utf8");

  const blogRaw = await fs.readFile(path.join(SOURCE, "src/data/blog.ts"), "utf8");
  const blogStart = blogRaw.indexOf("export const BLOG_POSTS");
  const blogTypesStart = blogRaw.indexOf("export interface BlogFAQ");
  const blogFunctions = blogRaw.indexOf("export const getPublishedPosts");
  if (blogStart < 0 || blogTypesStart < 0 || blogFunctions < 0) throw new Error("Original blog contract changed.");
  const blogNoData = blogRaw.slice(blogTypesStart, blogStart) + "export const BLOG_POSTS: BlogPost[] = [];\n" + blogRaw.slice(blogFunctions);
  const blogPath = path.join(ROOT, "src/emp-orio/data/blog.ts");
  await fs.mkdir(path.dirname(blogPath), { recursive: true });
  await fs.writeFile(blogPath, transformText(blogNoData, true, true), "utf8");

  const landRaw = await fs.readFile(path.join(SOURCE, "src/data/lembrancinhasLandings.ts"), "utf8");
  const landStart = landRaw.indexOf("export const LEMBRANCINHAS_LANDINGS");
  const landTypesStart = landRaw.indexOf("export interface LandingFAQ");
  const landGetter = landRaw.indexOf("export const getLandingByRouteSlug");
  if (landStart < 0 || landTypesStart < 0 || landGetter < 0) throw new Error("Original landing contract changed.");
  const landNoData = landRaw.slice(landTypesStart, landStart) + "export const LEMBRANCINHAS_LANDINGS: LembrancinhasLandingConfig[] = [];\n" + landRaw.slice(landGetter);
  const landPath = path.join(ROOT, "src/emp-orio/data/lembrancinhasLandings.ts");
  await fs.writeFile(landPath, transformText(landNoData, true, true), "utf8");
  counts.reused += 3;
  counts.byArea["papelemi-data-adapters"] = 3;
}

async function writeSupabaseAdapters() {
  const client = [
    'import { createClient } from "@supabase/supabase-js";',
    'import type { Database } from "./types";',
    "function getEnvironment(name: string): string | undefined {",
    '  const viteValue = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];',
    "  if (viteValue) return viteValue;",
    '  if (typeof process !== "undefined") return process.env[name];',
    "  return undefined;",
    "}",
    "function createPapeLemiClient() {",
    '  const url = getEnvironment("VITE_SUPABASE_URL") || getEnvironment("SUPABASE_URL");',
    '  const key = getEnvironment("VITE_SUPABASE_PUBLISHABLE_KEY") || getEnvironment("SUPABASE_PUBLISHABLE_KEY");',
    '  if (!url || !key) throw new Error("PapeLemi Supabase environment is not configured.");',
    "  return createClient<Database>(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });",
    "}",
    "let instance: ReturnType<typeof createPapeLemiClient> | undefined;",
    "export const supabase = new Proxy({} as ReturnType<typeof createPapeLemiClient>, {",
    "  get(_target, property, receiver) { if (!instance) instance = createPapeLemiClient(); return Reflect.get(instance, property, receiver); },",
    "});"
  ].join("\n");
  const clientPath = path.join(ROOT, "src/emp-orio/integrations/supabase/client.ts");
  await fs.mkdir(path.dirname(clientPath), { recursive: true });
  await fs.writeFile(clientPath, client, "utf8");

  const lovableAdapter = [
    'import { supabase } from "../supabase/client";',
    "type SignInOptions = { redirect_uri?: string; extraParams?: Record<string, string> };",
    "export const lovable = {",
    "  auth: {",
    '    signInWithOAuth: async (provider: "google" | "apple" | "microsoft" | "lovable", options?: SignInOptions) => {',
    '      if (provider !== "google") return { error: new Error("Este provedor não está habilitado na autenticação da PapeLemi.") };',
    '      const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: options?.redirect_uri } });',
    "      return { redirected: Boolean(data?.url), error: error ?? null };",
    "    },",
    "  },",
    "};"
  ].join("\n");
  const lovablePath = path.join(ROOT, "src/emp-orio/integrations/lovable/index.ts");
  await fs.mkdir(path.dirname(lovablePath), { recursive: true });
  await fs.writeFile(lovablePath, lovableAdapter, "utf8");
}

async function writeEmporioAdminApp() {
  const app = await fs.readFile(path.join(SOURCE, "src/App.tsx"), "utf8");
  const start = app.indexOf('<Route path="/admin/login"');
  const end = app.indexOf('<Route path="/loja"', start);
  if (start < 0 || end < 0) throw new Error("Could not extract the original Empório admin route group.");
  let routes = app.slice(start, end);
  const accessStart = routes.indexOf('<Route path="/acesso-restrito"');
  if (accessStart >= 0) {
    const accessEnd = routes.indexOf("} />", accessStart);
    if (accessEnd < 0) throw new Error("Could not isolate the access-denied route.");
    routes = routes.slice(0, accessStart) + '<Route path="/admin/acesso-restrito" element={<AccessDenied />} />\n' + routes.slice(accessEnd + 4);
  }
  routes = routes.replace(/<AcessoRestrito\s*\/>/g, "<AccessDenied />");
  routes = routes.replaceAll('path="/acesso-restrito"', 'path="/admin/acesso-restrito"');

  const declarations = app.split("\n").filter((line) =>
    /^const\s+\w+\s*=\s*(?:lazyWithRetry|lazy)\(\(\)\s*=>\s*import\("\.\/pages\/admin\//.test(line)
  ).join("\n");
  const declarationNames = new Set([...declarations.matchAll(/const\s+(\w+)\s*=/g)].map((m) => m[1]));
  const routeNames = [...routes.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1]);
  const builtins = new Set(["Route", "Suspense", "AdminErrorBoundary", "RequireAdmin", "AccessDenied", "AdminSkeleton", "PageSkeleton", "Navigate"]);
  const missing = [...new Set(routeNames.filter((name) => !declarationNames.has(name) && !builtins.has(name)))];
  if (missing.length) throw new Error("Original admin route components missing declarations: " + missing.join(", "));
  const adminPageImports = [...declarations.matchAll(/import\("\.\/pages\/admin\/([^"]+)"\)/g)].map((m) => m[1]);

  const appCode = [
    'import { QueryClient, QueryClientProvider } from "@tanstack/react-query";',
    'import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";',
    'import { lazy, Suspense, useEffect } from "react";',
    'import { HelmetProvider } from "react-helmet-async";',
    'import { TooltipProvider } from "./components/ui/tooltip";',
    'import { Toaster } from "./components/ui/toaster";',
    'import { Toaster as Sonner } from "./components/ui/sonner";',
    'import RouteTransition, { GlobalProgressBar } from "./components/RouteTransition";',
    'import { AdminSkeleton, PageSkeleton } from "./components/ui/skeleton-loading";',
    'import RequireAdmin from "./components/RequireAdmin";',
    'import AdminErrorBoundary from "./components/AdminErrorBoundary";',
    'import { lazyWithRetry } from "./lib/lazyWithRetry";',
    "",
    "const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 300000, gcTime: 1800000, refetchOnWindowFocus: false, retry: 1 } } });",
    "",
    declarations,
    "",
    "function AccessDenied() {",
    '  return <div className="mx-auto max-w-md px-4 py-24 text-center"><h1 className="text-3xl font-semibold">Acesso restrito</h1><p className="mt-3 text-sm text-muted-foreground">Esta conta não possui permissões administrativas na PapeLemi.</p><Link to="/admin/login" className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">Voltar ao login</Link></div>;',
    "}",
    'function PapeLemiHomeRedirect() { useEffect(() => { window.location.replace("/"); }, []); return null; }',
    "",
    "export default function EmporioAdminApp() {",
    "  return <QueryClientProvider client={queryClient}><HelmetProvider><TooltipProvider><Toaster /><Sonner /><BrowserRouter><GlobalProgressBar /><RouteTransition><Routes>",
    routes,
    '<Route path="/" element={<PapeLemiHomeRedirect />} />',
    '<Route path="*" element={<Navigate to="/admin" replace />} />',
    "</Routes></RouteTransition></BrowserRouter></TooltipProvider></HelmetProvider></QueryClientProvider>;",
    "}"
  ].join("\n");
  const appPath = path.join(ROOT, "src/emp-orio/EmporioAdminApp.tsx");
  await fs.mkdir(path.dirname(appPath), { recursive: true });
  await fs.writeFile(appPath, appCode, "utf8");
  return { adminRoutes: (routes.match(/<Route path=/g) || []).length, adminPageImports: [...new Set(adminPageImports)].length };
}

async function writeDestinationFiles() {
  const packagePath = path.join(ROOT, "package.json");
  const targetPackage = JSON.parse(await fs.readFile(packagePath, "utf8"));
  const sourcePackage = JSON.parse(await fs.readFile(path.join(SOURCE, "package.json"), "utf8"));
  targetPackage.dependencies ||= {};
  targetPackage.devDependencies ||= {};
  for (const [name, version] of Object.entries(sourcePackage.dependencies || {})) {
    if (!(name in targetPackage.dependencies)) targetPackage.dependencies[name] = version;
  }
  const excludedDev = new Set(["@vitejs/plugin-react-swc", "autoprefixer", "lovable-tagger", "postcss", "tailwindcss"]);
  for (const [name, version] of Object.entries(sourcePackage.devDependencies || {})) {
    if (!excludedDev.has(name) && !(name in targetPackage.devDependencies)) targetPackage.devDependencies[name] = version;
  }
  Object.assign(targetPackage.dependencies, {
    "date-fns-v3": "npm:date-fns@^3.6.0",
    "react-day-picker-v8": "npm:react-day-picker@^8.10.1",
    "react-resizable-panels-v2": "npm:react-resizable-panels@^2.1.9"
  });
  targetPackage.devDependencies["@tailwindcss/typography"] ||= "^0.5.16";
  targetPackage.devDependencies["@playwright/test"] ||= "1.59.0";
  await fs.writeFile(packagePath, JSON.stringify(targetPackage, null, 2) + "\n", "utf8");

  const stylesPath = path.join(ROOT, "src/styles.css");
  let styles = await fs.readFile(stylesPath, "utf8");
  if (!styles.includes('@plugin "@tailwindcss/typography";')) {
    styles = styles.replace('@import "tw-animate-css";', '@import "tw-animate-css";\n@plugin "@tailwindcss/typography";');
  }
  if (!styles.includes("--color-coral:")) {
    const tokens = [
      "  --color-coral: var(--coral);", "  --color-coral-light: var(--coral-light);", "  --color-coral-dark: var(--coral-dark);",
      "  --color-warm-gray: var(--warm-gray);", "  --color-soft-gray: var(--soft-gray);",
      "  --color-success: var(--success);", "  --color-success-foreground: var(--success-foreground);",
      "  --color-success-light: var(--success-light);", "  --color-success-dark: var(--success-dark);",
      '  --font-body: "DM Sans", system-ui, sans-serif;'
    ].join("\n");
    styles = styles.replace("@theme inline {", "@theme inline {\n" + tokens);
  }
  await fs.writeFile(stylesPath, styles, "utf8");

  const rootPath = path.join(ROOT, "src/routes/__root.tsx");
  let root = await fs.readFile(rootPath, "utf8");
  if (!root.includes("useRouterState")) root = 'import { useRouterState } from "@tanstack/react-router";\n' + root;
  root = root.replace(
    "function RootComponent() {\n  const { queryClient } = Route.useRouteContext();",
    'function RootComponent() {\n  const { queryClient } = Route.useRouteContext();\n  const pathname = useRouterState({ select: (state) => state.location.pathname });\n  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");'
  );
  root = root.replace(
    '<Header />\n            <main className="flex-1"><Outlet /></main>\n            <Footer />',
    '{!isAdminRoute && <Header />}\n            <main className="flex-1"><Outlet /></main>\n            {!isAdminRoute && <Footer />}'
  );
  if (!root.includes("isAdminRoute")) throw new Error("Could not hide the PapeLemi storefront chrome on /admin.");
  await fs.writeFile(rootPath, root, "utf8");

  const adminRoute = [
    'import { createFileRoute } from "@tanstack/react-router";',
    'import EmporioAdminApp from "@/emp-orio/EmporioAdminApp";',
    'import "@/emp-orio/admin-theme.css";',
    "",
    'export const Route = createFileRoute("/admin")({',
    '  head: () => ({ meta: [{ title: "Painel administrativo — PapeLemi" }, { name: "description", content: "Gestão operacional da PapeLemi." }, { name: "robots", content: "noindex, nofollow" }] }),',
    '  component: () => <div className="emp-orio-admin"><EmporioAdminApp /></div>,',
    "});"
  ].join("\n");
  await fs.writeFile(path.join(ROOT, "src/routes/admin.tsx"), adminRoute, "utf8");

  const splatRoute = [
    'import { createFileRoute } from "@tanstack/react-router";',
    "",
    'export const Route = createFileRoute("/admin/$")({',
    '  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),',
    "  component: () => null,",
    "});"
  ].join("\n");
  await fs.writeFile(path.join(ROOT, "src/routes/admin.$.tsx"), splatRoute, "utf8");
}

async function writeBrandAndLocalProject() {
  const assetPath = path.join(ROOT, "src/emp-orio/assets/papelemi-mark.svg");
  await fs.mkdir(path.dirname(assetPath), { recursive: true });
  await fs.writeFile(assetPath, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="PapeLemi"><rect width="128" height="128" rx="36" fill="#f6e9ef"/><path d="M40 96V31h27c19 0 30 10 30 26S86 84 67 84H57v12H40zm17-27h10c9 0 14-4 14-12s-5-12-14-12H57v24z" fill="#b77f9a"/></svg>', "utf8");
  await fs.writeFile(path.join(ROOT, "src/emp-orio/admin-theme.css"), scopedAdminTheme(), "utf8");

  const sourceConfig = await fs.readFile(path.join(SOURCE, "supabase/config.toml"), "utf8");
  let localConfig = sourceConfig.replace(/^project_id\s*=.*$/m, 'project_id = "papelemi-emp-orio-local"');
  localConfig = localConfig
    .replace("[studio]\nenabled = true", "[studio]\nenabled = false")
    .replace("[inbucket]\nenabled = true", "[inbucket]\nenabled = false")
    .replace("[edge_runtime]\nenabled = true", "[edge_runtime]\nenabled = false");
  if (!localConfig.includes("[db.seed]")) localConfig += "\n[db.seed]\nenabled = false\n";
  const localDir = path.join(ROOT, "tools/emp-orio-supabase/supabase");
  await fs.mkdir(localDir, { recursive: true });
  await fs.writeFile(path.join(localDir, "config.toml"), localConfig, "utf8");
  await fs.writeFile(path.join(ROOT, "tools/emp-orio-supabase/README.md"), [
    "# Empório source schema — isolated local replay",
    "",
    "Disposable local Supabase project for replaying the original Empório migrations.",
    "The project_id is intentionally different from both hosted projects. Never link or push this folder to a hosted project.",
    "No source .env, seed.sql, customers, orders, payments, addresses, credentials, or media are copied.",
    "PapeLemi's root supabase/migrations history remains untouched.",
    ""
  ].join("\n"), "utf8");

  const rootConfigPath = path.join(ROOT, "supabase/config.toml");
  let rootConfig = await fs.readFile(rootConfigPath, "utf8");
  const sections = [];
  let current = [];
  for (const line of sourceConfig.split("\n")) {
    if (/^\[functions\.[^\]]+\]/.test(line)) {
      if (current.length) sections.push(current.join("\n"));
      current = [line];
    } else if (current.length && /^\[/.test(line)) {
      sections.push(current.join("\n"));
      current = [];
    } else if (current.length) current.push(line);
  }
  if (current.length) sections.push(current.join("\n"));
  for (const section of sections) {
    const name = section.split("\n")[0];
    if (!rootConfig.includes(name)) rootConfig += "\n" + section + "\n";
  }
  await fs.writeFile(rootConfigPath, rootConfig, "utf8");
}

async function main() {
  const stat = await fs.stat(SOURCE);
  if (!stat.isDirectory()) throw new Error("Pinned Empório source checkout not found: " + SOURCE);

  await copyTree("src/components", "src/emp-orio/components", "components", { namespaced: true });
  await copyTree("src/contexts", "src/emp-orio/contexts", "contexts", { namespaced: true });
  await copyTree("src/hooks", "src/emp-orio/hooks", "hooks", { namespaced: true });
  await copyTree("src/lib", "src/emp-orio/lib", "lib", { namespaced: true });
  await copyTree("src/pages/admin", "src/emp-orio/pages/admin", "admin-pages", { namespaced: true });
  await copyTree("src/stores", "src/emp-orio/stores", "stores", { namespaced: true });
  await copyTree("src/generated", "src/emp-orio/generated", "generated", { namespaced: true });
  await copyFile("src/ai-gateway.types.ts", "src/emp-orio/ai-gateway.types.ts", { namespaced: true, area: "types" });
  await copyFile("src/integrations/supabase/types.ts", "src/emp-orio/integrations/supabase/types.ts", { transform: false, area: "database-types" });

  await copyTree("supabase/functions", "supabase/functions", "edge-functions", { brand: true });
  await copyTree("supabase/migrations", "tools/emp-orio-supabase/supabase/migrations", "source-migrations", { transform: false });
  await copyTree("drizzle", "drizzle/emp-orio", "drizzle-reference", { transform: false });
  await copyTree("scripts", "scripts/emp-orio/source", "source-scripts", { transform: false });
  await copyTree("e2e", "e2e/emp-orio", "source-e2e", { transform: false });
  await copyTree(".agents/skills", ".agents/skills/emp-orio", "source-skills", { transform: false });

  await writeDataAdapters();
  await writeSupabaseAdapters();
  const appInfo = await writeEmporioAdminApp();
  await writeDestinationFiles();
  await writeBrandAndLocalProject();

  const manifest = {
    sourceRepository: "hrq16000-a11y/emporiolelecute-2026",
    sourceSha: SOURCE_SHA,
    destinationBranch: process.env.PAPELEMI_BRANCH || "feat/catalog-admin-parity-01-20261125",
    strategy: "original admin route group mounted inside the existing TanStack /admin route",
    reusedFiles: counts.reused,
    reusedBytes: counts.bytes,
    skippedSourceMediaFiles: counts.skippedMedia,
    byArea: counts.byArea,
    originalAdminRouteEntries: appInfo.adminRoutes,
    adminPageModulesImportedByOriginalRoute: appInfo.adminPageImports,
    originalAdminPageFilesCopied: counts.byArea["admin-pages"] || 0,
    sourceEdgeFunctionFilesCopied: counts.byArea["edge-functions"] || 0,
    sourceMigrationFilesCopiedToIsolatedLocalProject: counts.byArea["source-migrations"] || 0,
    dataPolicy: "Empório catalog/blog/landing records and all source media excluded; static adapters read PapeLemi catalog only.",
    safety: "No source .env, seed.sql, hosted project id, service-role value, or hosted migration applied."
  };
  await fs.mkdir(path.join(ROOT, "src/emp-orio"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "src/emp-orio/TRANSFER_MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
