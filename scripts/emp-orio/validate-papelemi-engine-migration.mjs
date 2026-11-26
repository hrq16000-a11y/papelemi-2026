import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/20261126000000_create_papelemi_engine_schema.sql");
const clientPath = path.join(root, "src/emp-orio/integrations/supabase/client.ts");
const typesPath = path.join(root, "src/emp-orio/integrations/supabase/types.ts");
const testPath = path.join(root, "supabase/tests/papelemi_engine_schema.test.sql");
const bootstrapMigrationPath = path.join(root, "supabase/migrations/20261126010000_bootstrap_papelemi_engine_admin.sql");
const bootstrapTestPath = path.join(root, "supabase/tests/papelemi_engine_admin_bootstrap.test.sql");
const sourceProjectRef = "xfqffqxqiuqauefrrcxn";
const targetProjectRef = "gpdpfoxpbferjwbppcmb";
const oldDomain = "emporiolelecute.com.br";
const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, passed: Boolean(condition), detail });
}
function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}
async function walkFiles(dir) {
  const out = [];
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const migration = await fs.readFile(migrationPath, "utf8");
const client = await fs.readFile(clientPath, "utf8");
const types = await fs.readFile(typesPath, "utf8");
const tests = await fs.readFile(testPath, "utf8");
const bootstrapMigration = await fs.readFile(bootstrapMigrationPath, "utf8");
const bootstrapTests = await fs.readFile(bootstrapTestPath, "utf8");
const searchPaths = [...migration.matchAll(/SET "search_path" TO ((?:'[^']+'(?:,\s*)?)+)/g)].map(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
const safeSearchPaths = searchPaths.filter(parts => parts[0] === "papelemi_engine" && parts[1] === "pg_catalog" && parts[2] === "public" && parts.at(-1) === "pg_temp");
const withoutDollarBodies = migration.replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " ");
const topLevelInserts = [...withoutDollarBodies.matchAll(/^\s*INSERT\s+INTO\s+([^\s(]+)/gim)].map(m => m[1].replaceAll('"', "").replaceAll(" ", "").toLowerCase());
const allowedInserts = new Set(["papelemi_engine.user_roles", "storage.buckets"]);
const disallowedInserts = topLevelInserts.filter(target => !allowedInserts.has(target));
const dmlLines = withoutDollarBodies.split("\n").filter(line => /^\s*(UPDATE|DELETE|COPY|TRUNCATE)\b/i.test(line));
const grantAnon = migration.split("\n").filter(line => /^\s*GRANT\b/i.test(line) && /\bTO\s+(?:"anon"|anon)\b/i.test(line));
const unsafeAuthenticatedGrants = migration.split("\n").filter(line => /^\s*GRANT\b/i.test(line) && /ON TABLE/i.test(line) && /TO\s+(?:"authenticated"|authenticated)\b/i.test(line) && /\b(TRUNCATE|TRIGGER|REFERENCES)\b/i.test(line));
const dropStatements = withoutDollarBodies.split("\n").filter(line => /^\s*DROP\s+(TABLE|SCHEMA|TYPE|FUNCTION|POLICY|TRIGGER)\b/i.test(line));
const truncateStatements = withoutDollarBodies.split("\n").filter(line => /^\s*TRUNCATE\b/i.test(line));

check("144 tables", count(migration, /CREATE TABLE IF NOT EXISTS "papelemi_engine"\./g) === 144);
check("84 functions", count(migration, /CREATE OR REPLACE FUNCTION "papelemi_engine"\./g) === 84);
check("94 triggers", count(migration, /CREATE OR REPLACE TRIGGER /g) === 94);
check("238 total policies", count(migration, /CREATE POLICY /g) === 238);
check("144 RLS enable statements", count(migration, /ENABLE ROW LEVEL SECURITY/g) === 144);
check("4 views", count(migration, /CREATE OR REPLACE VIEW /g) === 4);
check("306 indexes", count(migration, /CREATE (?:UNIQUE )?INDEX /g) === 306);
check("5 enum types", count(migration, /CREATE TYPE "papelemi_engine"\./g) === 5);
check("84 safe search paths", searchPaths.length === 84 && safeSearchPaths.length === 84, JSON.stringify({ total: searchPaths.length, safe: safeSearchPaths.length }));
check("only PapeLemi role and empty bucket inserts", disallowedInserts.length === 0, JSON.stringify({ allowed: topLevelInserts, disallowed: disallowedInserts }));
check("no top-level update/delete/copy/truncate", dmlLines.length === 0, dmlLines.slice(0, 12).join("\n"));
check("no DROP statements", dropStatements.length === 0, dropStatements.join("\n"));
check("no TRUNCATE statements", truncateStatements.length === 0, truncateStatements.join("\n"));
check("no anonymous grants", grantAnon.length === 0, grantAnon.slice(0, 5).join("\n"));
check("no unsafe authenticated table grants", unsafeAuthenticatedGrants.length === 0, unsafeAuthenticatedGrants.slice(0, 5).join("\n"));
check("source project reference removed from migration", !migration.includes(sourceProjectRef));
check("source domain removed from migration", !migration.toLowerCase().includes(oldDomain));
check("PapeLemi project reference used by migration", migration.includes(targetProjectRef));
check("bucket creation is guarded and non-overwriting", migration.includes("DO $papelemi_bucket_guard$") && migration.includes("$papelemi_bucket_guard$;") && migration.includes("Existing product-images bucket configuration differs") && migration.includes("ON CONFLICT (id) DO NOTHING;"));
check("schema remains isolated and private", migration.includes("GRANT USAGE ON SCHEMA papelemi_engine TO authenticated, service_role;") && migration.includes("REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA papelemi_engine FROM PUBLIC, anon;"));
check("admin client routes data/RPC through engine", client.includes('.schema("papelemi_engine")') && client.includes('property === "from"') && client.includes('property === "rpc"'));
check("generated admin types use engine schema", (types.match(/\n  papelemi_engine: \{/g) || []).length === 2 && (types.match(/\n  public: \{/g) || []).length === 0 && !types.includes('["public"]') && !types.includes("['public']"));
check("generated type references use engine enums", !/Database\[(["'])public\1\]/.test(types) && types.includes('Database["papelemi_engine"]'));
check("database contract test plan remains 25", /SELECT plan\(25\);/.test(tests));

const sourceReferences = [];
const directSupabaseClientImports = [];
const explicitPublicSchemaReferences = [];
let engineClientImports = 0;
const engineHelperPath = path.join(root, "supabase/functions/_shared/createEngineClient.ts");
let engineHelper = "";
try { engineHelper = await fs.readFile(engineHelperPath, "utf8"); } catch {}
for (const dir of ["src/emp-orio", "supabase/functions"]) {
  for (const file of await walkFiles(path.join(root, dir))) {
    const ext = path.extname(file).toLowerCase();
    if (![".ts", ".tsx", ".js", ".jsx", ".json", ".sql", ".md"].includes(ext)) continue;
    const text = await fs.readFile(file, "utf8");
    if (text.includes(sourceProjectRef) || text.toLowerCase().includes(oldDomain) || /emporioPapeLemi\.com\.br/i.test(text)) {
      sourceReferences.push(path.relative(root, file));
    }
    if (file !== engineHelperPath && /import\s*\{[^}]*\bcreateClient\b[^}]*\}\s*from\s*["'](?:https:\/\/esm\.sh\/@supabase\/supabase-js|npm:@supabase\/supabase-js|@supabase\/supabase-js)/.test(text)) {
      directSupabaseClientImports.push(path.relative(root, file));
    }
    if (/\.schema\(\s*(['"])public\1\s*\)/.test(text)) {
      explicitPublicSchemaReferences.push(path.relative(root, file));
    }
    engineClientImports += (text.match(/createEngineClient\s+as\s+createClient/g) || []).length;
  }
}
const sourceEdgeFunctionFiles = (await walkFiles(path.join(root, "supabase/functions")))
  .filter(file => file !== engineHelperPath).length;
check("no source project/domain references in admin or Edge Functions", sourceReferences.length === 0, sourceReferences.join(", "));
check("75 source Edge Function files are present", sourceEdgeFunctionFiles === 75, String(sourceEdgeFunctionFiles));
check("Edge Functions route Supabase clients to papelemi_engine", engineHelper.includes('schema: "papelemi_engine"') && directSupabaseClientImports.length === 0 && explicitPublicSchemaReferences.length === 0 && engineClientImports > 0, JSON.stringify({ directSupabaseClientImports, explicitPublicSchemaReferences, engineClientImports, helperPresent: Boolean(engineHelper) }));

const failed = checks.filter(item => !item.passed);
console.log(JSON.stringify({ passed: checks.length - failed.length, total: checks.length, checks }, null, 2));
if (failed.length) process.exitCode = 1;