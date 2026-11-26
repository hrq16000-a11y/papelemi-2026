#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

const EXPECTED_SOURCE_COMMIT = "d01d843c266b5a32d03af22eeaac6eda4a7fcf0f";
const sourceRoot = resolve(process.argv[2] || "");
const targetRoot = resolve(process.argv[3] || "");
if (!process.argv[2] || !process.argv[3] || !existsSync(sourceRoot) || !existsSync(targetRoot)) {
  throw new Error("Uso: node scripts/replicate-emporio-source.mjs <source-checkout> <papelemi-checkout>");
}

const actualSourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
if (actualSourceCommit !== EXPECTED_SOURCE_COMMIT) {
  throw new Error("Checkout Empório inesperado: " + actualSourceCommit);
}

const snapshotRoot = join(targetRoot, "apps", "emporio-admin", "source");
const mappings = [
  "src/pages/admin",
  "src/components",
  "src/hooks",
  "src/lib",
  "src/stores",
  "src/contexts",
  "src/integrations/supabase",
  "src/App.tsx",
  "src/main.tsx",
  "src/index.css",
  "src/ai-gateway.types.ts",
  "supabase/migrations",
  "supabase/functions",
  "drizzle/migrations",
  "drizzle/schema.ts",
  "drizzle.config.ts",
  "package.json",
  "bun.lock",
  "index.html",
  "vite.config.ts",
  "tailwind.config.ts",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "postcss.config.js",
  "components.json",
  "eslint.config.js",
  "vitest.config.ts",
  "playwright.config.ts",
  "vercel.json",
  "README.md",
  "AGENTS.md",
  "roadmap.md",
];

const excluded = [
  ".env and .env.*",
  "public/** (storefront assets and media)",
  "src/assets/** (brand and product media)",
  "src/data/** (Empório commercial catalog/content data)",
  "supabase/seed.sql (commercial seed data)",
  "supabase/config.toml (source project binding)",
  ".tmp-ig/** (Instagram media)",
  ".lovable/** and .agents/** (source workspace metadata)",
  "node_modules/** and .git/**",
];

function shouldCopy(absPath) {
  const rel = relative(sourceRoot, absPath).split(sep).join("/");
  if (/(^|\/)\.env($|\.)/.test(rel)) return false;
  if (/^(public|src\/assets|src\/data|node_modules|\.git|\.tmp-ig|\.lovable|\.agents)(\/|$)/.test(rel)) return false;
  if (rel === "supabase/seed.sql" || rel === "supabase/config.toml") return false;
  if (/\.(png|jpe?g|webp|gif|avif|mp4|mov|woff2?|ttf|ico)$/i.test(rel)) return false;
  return true;
}

for (const rel of mappings) {
  const from = join(sourceRoot, rel);
  if (!existsSync(from)) throw new Error("Origem não encontrada: " + rel);
  const to = join(snapshotRoot, rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, filter: shouldCopy });
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

const files = walk(snapshotRoot).map((path) => {
  const bytes = readFileSync(path);
  return {
    path: relative(snapshotRoot, path).split(sep).join("/"),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}).sort((a, b) => a.path.localeCompare(b.path));

const prefixes = [
  "src/pages/admin/",
  "src/components/admin/",
  "src/components/ui/",
  "src/hooks/",
  "src/lib/",
  "src/stores/",
  "src/contexts/",
  "src/integrations/supabase/",
  "supabase/migrations/",
  "supabase/functions/",
  "supabase/tests/",
  "drizzle/migrations/",
];
const counts = Object.fromEntries(prefixes.map((prefix) => [
  prefix,
  files.filter((file) => file.path.startsWith(prefix)).length,
]));

writeFileSync(join(snapshotRoot, "source-manifest.json"), JSON.stringify({
  source_repository: "hrq16000-a11y/emporiolelecute-2026",
  source_branch: "main",
  source_commit: EXPECTED_SOURCE_COMMIT,
  destination_repository: "hrq16000-a11y/papelemi-2026",
  snapshot_path: "apps/emporio-admin/source",
  file_count: files.length,
  counts,
  exclusions: excluded,
  files,
}, null, 2) + "\n");

writeFileSync(join(targetRoot, "apps", "emporio-admin", "README.md"), [
  "# Empório admin engine — source snapshot",
  "",
  "Snapshot versionado e imutável do código-fonte de referência, preparado para a transferência do painel administrativo e dos módulos comerciais à PapeLemi.",
  "",
  "- Origem: hrq16000-a11y/emporiolelecute-2026",
  "- Branch de origem: main",
  "- Commit fixado: " + EXPECTED_SOURCE_COMMIT,
  "- Manifesto e SHA-256 por arquivo: apps/emporio-admin/source/source-manifest.json",
  "",
  "Este lote preserva os módulos de código originais em conjunto. Ainda não é o painel conectado/operacional: a próxima etapa adapta roteamento, identidade PapeLemi, autenticação, contratos de dados e isolamento de tenant.",
  "",
  "Não foram copiados .env, .env.example, supabase/config.toml, supabase/seed.sql, src/data, src/assets, public ou mídia comercial da Empório.",
  "",
  "A pasta source é referência vendorizada; não importar suas migrations diretamente em Production. O schema será reconciliado de forma aditiva com o banco PapeLemi e homologado isoladamente.",
  "",
  "## Contagens transferidas",
  "",
  ...Object.entries(counts).map(([name, count]) => "- " + name + ": " + count),
  "- Arquivos totais: " + files.length,
  "",
].join("\n"));

console.log(JSON.stringify({ sourceCommit: actualSourceCommit, snapshotRoot, fileCount: files.length, counts }));
