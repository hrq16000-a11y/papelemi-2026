// This old combined-schema strategy is intentionally disabled.
// It would move existing PapeLemi public tables and replay raw Emporio migrations
// containing commercial DML. Use the isolated schema-only engine migration instead.
console.error(
  "Deprecated and blocked: raw Emporio migrations contain commercial INSERT statements, " +
  "and the old combined workspace would move existing PapeLemi public tables. " +
  "Use supabase/migrations/20261126000000_create_papelemi_engine_schema.sql instead."
);
process.exitCode = 1;
