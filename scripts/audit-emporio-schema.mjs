import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "apps/emporio-admin/source");
const migrationsRoot = path.join(sourceRoot, "supabase/migrations");
const sourceTypesPath = path.join(sourceRoot, "src/integrations/supabase/types.ts");
const destinationTypesPath = path.join(root, "src/integrations/supabase/types.ts");
const manifestPath = path.join(sourceRoot, "source-manifest.json");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function unique(values) {
  return [...new Set(values)].sort();
}
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}
function capture(sql, regex, group = 1) {
  return [...sql.matchAll(regex)].map((match) => match[group]).filter(Boolean);
}
function publicTypeTables(file) {
  const text = fs.readFileSync(file, "utf8");
  const start = text.indexOf("Tables: {");
  const end = text.indexOf("Views: {", start);
  const block = text.slice(start, end > start ? end : undefined);
  return unique(capture(block, /^\s{6}([A-Za-z0-9_]+):\s*\{$/gm));
}

const migrationFiles = walk(migrationsRoot).filter((file) => file.endsWith(".sql")).sort();
const sqlByFile = migrationFiles.map((file) => ({
  file: path.relative(sourceRoot, file).replaceAll(path.sep, "/"),
  sql: stripComments(fs.readFileSync(file, "utf8")),
}));
const allSql = sqlByFile.map((item) => item.sql).join("\n");
const tableCreates = unique(capture(allSql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\s*)\.\s*"?([A-Za-z0-9_]+)"?/gi));
const functions = unique(capture(allSql, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\s*)\.\s*"?([A-Za-z0-9_]+)"?/gi));
const views = unique(capture(allSql, /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:"?public"?\s*)\.\s*"?([A-Za-z0-9_]+)"?/gi));
const enums = unique(capture(allSql, /CREATE\s+TYPE\s+(?:"?public"?\s*)\.\s*"?([A-Za-z0-9_]+)"?/gi));
const triggers = unique(capture(allSql, /CREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+"?([A-Za-z0-9_]+)"?\s+[\s\S]{0,500}?\s+ON\s+(?:"?public"?\s*)\.\s*"?([A-Za-z0-9_]+)"?/gi, 1));
const policies = unique(capture(allSql, /CREATE\s+POLICY\s+"?([^"\n]+?)"?\s+ON\s+(?:"?public"?\s*)\.\s*"?([A-Za-z0-9_]+)"?/gi, 1));
const storagePolicies = unique(capture(allSql, /CREATE\s+POLICY\s+"?([^"\n]+?)"?\s+ON\s+storage\.objects/gi, 1));
const extensions = unique(capture(allSql, /CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([A-Za-z0-9_-]+)["']?/gi));
const storageBucketFiles = sqlByFile.filter((item) => /storage\.buckets/i.test(item.sql)).map((item) => item.file);
const storageBuckets = unique(capture(allSql, /INSERT\s+INTO\s+storage\.buckets[\s\S]{0,800}?VALUES\s*\(\s*'([^']+)'/gi, 1));

const sourceTables = publicTypeTables(sourceTypesPath);
const destinationTables = publicTypeTables(destinationTypesPath);
const commonTables = sourceTables.filter((name) => destinationTables.includes(name));
const sourceOnlyTables = sourceTables.filter((name) => !destinationTables.includes(name));
const destinationOnlyTables = destinationTables.filter((name) => !sourceTables.includes(name));
const sourceTablesWithoutCreate = sourceTables.filter((name) => !tableCreates.includes(name));
const createsMissingTypes = tableCreates.filter((name) => !sourceTables.includes(name));
const sourceManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const edgeFunctionFiles = walk(path.join(sourceRoot, "supabase/functions")).filter((file) => path.basename(file) === "index.ts");
const drizzleMigrationFiles = walk(path.join(sourceRoot, "drizzle/migrations")).filter((file) => file.endsWith(".sql"));
const documentedCount = 155;

const result = {
  generatedAt: new Date().toISOString(),
  source: {
    repository: sourceManifest.source_repository,
    commit: sourceManifest.source_commit,
    snapshotFiles: sourceManifest.file_count,
    supabaseMigrations: migrationFiles.length,
    drizzleMigrations: drizzleMigrationFiles.length,
    edgeFunctions: edgeFunctionFiles.length,
    sqlCreatedPublicTables: tableCreates.length,
    generatedTypePublicTables: sourceTables.length,
    generatedTypeFunctions: functions.length,
    generatedTypeViews: views.length,
    enums: enums.length,
    triggers: triggers.length,
    publicPolicies: policies.length,
    storageObjectPolicies: storagePolicies.length,
    extensions: extensions.length,
    storageBuckets: storageBuckets.length ? storageBuckets : storageBucketFiles,
  },
  destination: { generatedTypePublicTables: destinationTables.length },
  comparison: {
    commonTables,
    sourceOnlyTables,
    destinationOnlyTables,
    sourceTablesWithoutCreate,
    createsMissingTypes,
    previousDocumentedEmporioTableCount: documentedCount,
    documentedVsGeneratedTypeDifference: documentedCount - sourceTables.length,
  },
  inventories: { tableCreates, functions, views, enums, triggers, policies, storagePolicies, extensions, edgeFunctionDirectories: edgeFunctionFiles.map((file) => path.basename(path.dirname(file))).sort() },
};

const jsonPath = path.join(sourceRoot, "schema-manifest.json");
fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2) + "\n");
const lines = [
  "# PapeLemi — inventário do schema original Empório",
  "",
  "Origem: " + result.source.repository + " @ " + result.source.commit,
  "",
  "## Contagens",
  "",
  "| Item | Empório | PapeLemi |",
  "|---|---:|---:|",
  "| Migrations Supabase | " + result.source.supabaseMigrations + " | — |",
  "| Migrations Drizzle | " + result.source.drizzleMigrations + " | — |",
  "| Edge Functions | " + result.source.edgeFunctions + " | — |",
  "| Tabelas criadas em SQL | " + result.source.sqlCreatedPublicTables + " | — |",
  "| Tabelas em types.ts | " + result.source.generatedTypePublicTables + " | " + result.destination.generatedTypePublicTables + " |",
  "| Funções SQL/RPC em migrations | " + result.source.generatedTypeFunctions + " | — |",
  "| Views em migrations | " + result.source.generatedTypeViews + " | — |",
  "| Enums | " + result.source.enums + " | — |",
  "| Triggers | " + result.source.triggers + " | — |",
  "| Policies public | " + result.source.publicPolicies + " | — |",
  "| Policies Storage | " + result.source.storageObjectPolicies + " | — |",
  "| Extensões | " + result.source.extensions + " | — |",
  "",
  "## Reconciliação de tabelas",
  "",
  "Nomes coincidentes: " + commonTables.length + ". Somente Empório: " + sourceOnlyTables.length + ". Somente PapeLemi: " + destinationOnlyTables.length + ".",
  "",
  "A documentação anterior informava " + documentedCount + " tabelas Empório; o types.ts versionado contém " + sourceTables.length + ". Diferença: " + (documentedCount - sourceTables.length) + ". A contagem SQL e o replay local ajudam a identificar a origem da divergência.",
  "",
  "### Tabelas presentes apenas no tipo Empório",
  "",
  sourceOnlyTables.length ? sourceOnlyTables.map((name) => "- " + name).join("\n") : "- Nenhuma",
  "",
  "### Tabelas próprias do tipo PapeLemi",
  "",
  destinationOnlyTables.length ? destinationOnlyTables.map((name) => "- " + name).join("\n") : "- Nenhuma",
  "",
  "### Tabelas tipadas sem CREATE TABLE localizado nas migrations",
  "",
  sourceTablesWithoutCreate.length ? sourceTablesWithoutCreate.map((name) => "- " + name).join("\n") : "- Nenhuma",
  "",
  "### CREATE TABLE sem entrada no types.ts original",
  "",
  createsMissingTypes.length ? createsMissingTypes.map((name) => "- " + name).join("\n") : "- Nenhuma",
  "",
  "## Inventário SQL",
  "",
  "### Tabelas",
  "",
  tableCreates.map((name) => "- " + name).join("\n"),
  "",
  "### Funções",
  "",
  functions.map((name) => "- " + name).join("\n"),
  "",
  "### Views",
  "",
  views.map((name) => "- " + name).join("\n"),
  "",
  "### Enums",
  "",
  enums.map((name) => "- " + name).join("\n"),
  "",
  "### Buckets",
  "",
  storageBuckets.map((name) => "- " + name).join("\n") || storageBucketFiles.map((name) => "- Referência em " + name).join("\n"),
  "",
  "## Limites",
  "",
  "- Este relatório analisa arquivos versionados; não consulta o Supabase hospedado da Empório.",
  "- O replay das migrations é executado em Supabase local isolado, com project_id emporio-local, sem seed e sem credenciais de produção.",
  "- Nenhum dado comercial, cliente, pedido, arquivo ou credencial é importado.",
  "- A contagem de funções, triggers, policies e buckets é inventário textual das migrations; não substitui a inspeção do catálogo PostgreSQL após o replay.",
  "",
];
const mdPath = path.join(root, "docs/operations/PAPELEMI_EMPÓRIO_SCHEMA_MANIFEST_2026-11-26.md");
fs.writeFileSync(mdPath, lines.join("\n"));
console.log(JSON.stringify({ jsonPath: path.relative(root, jsonPath), mdPath: path.relative(root, mdPath), sourceTables: sourceTables.length, destinationTables: destinationTables.length, sqlTableCreates: tableCreates.length, migrationCount: migrationFiles.length, edgeFunctions: edgeFunctionFiles.length }, null, 2));
