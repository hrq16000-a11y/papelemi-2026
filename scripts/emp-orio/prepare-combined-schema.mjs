import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.resolve(process.env.EMPORIO_SOURCE_DIR || "/tmp/emporio-source");
const originalMigrationsDir = path.join(root, "tools/emp-orio-supabase/supabase/migrations");
const combinedDir = path.join(root, "tools/papelemi-combined-supabase");
const supabaseDir = path.join(combinedDir, "supabase");
const targetMigrationsDir = path.join(supabaseDir, "migrations");

const legacyTables = [
  "categories", "coupons", "customers", "order_items", "orders", "products",
  "shipping_audit_logs", "shipping_providers", "shipping_quote_cache",
  "shipping_rules", "shipping_settings", "user_roles"
];

const preserveMigration = [
  "CREATE SCHEMA IF NOT EXISTS papelemi_legacy;",
  "REVOKE ALL ON SCHEMA papelemi_legacy FROM PUBLIC, anon, authenticated;",
  "GRANT USAGE ON SCHEMA papelemi_legacy TO postgres, service_role;",
  "",
  "-- Preserve the destination's existing schema objects before installing the original engine.",
  "DO $$",
  "DECLARE",
  "  r record;",
  "BEGIN",
  "  FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP",
  "    EXECUTE format('ALTER VIEW public.%I SET SCHEMA papelemi_legacy', r.viewname);",
  "  END LOOP;",
  "",
  "  FOR r IN SELECT matviewname FROM pg_matviews WHERE schemaname = 'public' LOOP",
  "    EXECUTE format('ALTER MATERIALIZED VIEW public.%I SET SCHEMA papelemi_legacy', r.matviewname);",
  "  END LOOP;",
  "",
  "  FOR r IN",
  "    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS identity_args",
  "    FROM pg_proc p",
  "    JOIN pg_namespace n ON n.oid = p.pronamespace",
  "    WHERE n.nspname = 'public' AND p.proname = 'has_role'",
  "  LOOP",
  "    EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA papelemi_legacy', r.proname, r.identity_args);",
  "  END LOOP;",
  "",
  "  FOR r IN",
  "    SELECT t.typname",
  "    FROM pg_type t",
  "    JOIN pg_namespace n ON n.oid = t.typnamespace",
  "    WHERE n.nspname = 'public' AND t.typtype = 'e'",
  "  LOOP",
  "    EXECUTE format('ALTER TYPE public.%I SET SCHEMA papelemi_legacy', r.typname);",
  "  END LOOP;",
  "",
  "  FOR r IN",
  "    SELECT tablename",
  "    FROM pg_tables",
  "    WHERE schemaname = 'public'",
  "      AND tablename = ANY (ARRAY[",
  "        'categories', 'coupons', 'customers', 'order_items', 'orders', 'products',",
  "        'shipping_audit_logs', 'shipping_providers', 'shipping_quote_cache',",
  "        'shipping_rules', 'shipping_settings', 'user_roles'",
  "      ]::text[])",
  "  LOOP",
  "    EXECUTE format('ALTER TABLE public.%I SET SCHEMA papelemi_legacy', r.tablename);",
  "  END LOOP;",
  "END;",
  "$$;",
  ""
].join("\n");

async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function main() {
  await fs.rm(combinedDir, { recursive: true, force: true });
  await fs.mkdir(targetMigrationsDir, { recursive: true });

  const targetMigrationFiles = (await fs.readdir(path.join(root, "supabase/migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of targetMigrationFiles) {
    await copyFile(path.join(root, "supabase/migrations", name), path.join(targetMigrationsDir, name));
  }

  const sourceMigrationFiles = (await fs.readdir(originalMigrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (sourceMigrationFiles.length !== 199) {
    throw new Error("Expected 199 original source migrations, found " + sourceMigrationFiles.length);
  }

  const seedPattern = /^\s*INSERT\s+INTO\s+(?:public\.)?(products|categories|orders|customers|coupons)\b/gim;
  const potentialCommercialSeeds = [];
  for (const name of sourceMigrationFiles) {
    const contents = await fs.readFile(path.join(sourceDir, "supabase/migrations", name), "utf8");
    for (const match of contents.matchAll(seedPattern)) {
      const line = contents.slice(0, match.index).split("\n").length;
      potentialCommercialSeeds.push({ file: name, line, table: match[1].toLowerCase() });
    }
  }
  console.log("Potential source commercial seed statements: " + JSON.stringify(potentialCommercialSeeds));
  if (potentialCommercialSeeds.length) {
    throw new Error("Source migration seed audit found potential Emporio commercial data. Inspect before copying into PapeLemi.");
  }

  const preserveName = "20261126000000_preserve_papelemi_legacy_schema.sql";
  await fs.writeFile(path.join(targetMigrationsDir, preserveName), preserveMigration, "utf8");

  const sourceManifest = [];
  for (let i = 0; i < sourceMigrationFiles.length; i++) {
    const originalName = sourceMigrationFiles[i];
    const originalTimestamp = originalName.slice(0, 14);
    const suffix = originalName.slice(15);
    const version = (BigInt("20261127000000") + BigInt(i)).toString();
    const targetName = version + "_emp-orio_" + suffix;
    const contents = await fs.readFile(path.join(originalMigrationsDir, originalName), "utf8");
    const localized = contents.replaceAll("https://xfqffqxqiuqauefrrcxn.supabase.co", "http://127.0.0.1:54321");
    await fs.writeFile(
      path.join(targetMigrationsDir, targetName),
      "-- Original Emporio migration: " + originalName + "\n" + localized,
      "utf8"
    );
    sourceManifest.push({ original: originalName, version, combined: targetName, originalTimestamp });
  }

  let config = await fs.readFile(path.join(root, "supabase/config.toml"), "utf8");
  config = config
    .replace(/^project_id\s*=.*$/m, 'project_id = "papelemi-combined-local"')
    .replace(/^\[inbucket\]/m, "[local_smtp]");
  if (/^\[db\.seed\]/m.test(config)) {
    config = config.replace(/(\[db\.seed\][\s\S]*?enabled\s*=\s*)true/m, "$1false");
  } else {
    config += "\n[db.seed]\nenabled = false\n";
  }
  await fs.writeFile(path.join(supabaseDir, "config.toml"), config, "utf8");

  const functionsSource = path.join(root, "supabase/functions");
  try {
    await fs.cp(functionsSource, path.join(supabaseDir, "functions"), { recursive: true });
  } catch {
    // Schema replay does not invoke Edge Functions; absence is not a migration blocker.
  }

  const manifest = {
    purpose: "Disposable local schema compatibility replay only. Never link or push this workspace to hosted Supabase.",
    sourceRepository: "hrq16000-a11y/emporiolelecute-2026",
    sourceSha: process.env.EMPORIO_SOURCE_SHA || "unknown",
    targetRepository: "hrq16000-a11y/papelemi-2026",
    targetMigrationCount: targetMigrationFiles.length,
    preserveMigration: preserveName,
    preservedLegacyTables: legacyTables,
    sourceMigrationCount: sourceManifest.length,
    sourceMigrationVersionRange: [sourceManifest[0]?.version, sourceManifest.at(-1)?.version],
    sourceMigrationMapping: sourceManifest
  };
  await fs.writeFile(path.join(combinedDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(combinedDir, "README.md"), [
    "# PapeLemi + Emporio combined schema replay",
    "",
    "Disposable local Supabase workspace generated by scripts/emp-orio/prepare-combined-schema.mjs.",
    "It replays the existing PapeLemi migrations, moves only the overlapping PapeLemi tables into a private legacy schema, then replays the 199 original Emporio migrations in their original order.",
    "No hosted project is linked. No production migration is executed. No Emporio customer, order, payment, address, credential, or media data is copied.",
    ""
  ].join("\n"), "utf8");

  console.log(JSON.stringify({
    targetMigrations: targetMigrationFiles.length,
    preserveMigration: preserveName,
    sourceMigrations: sourceManifest.length,
    sourceVersions: manifest.sourceMigrationVersionRange,
    legacyTables: legacyTables.length,
    commercialSeedStatements: potentialCommercialSeeds.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
