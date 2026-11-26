BEGIN;
SELECT plan(24);
SELECT ok(to_regnamespace('papelemi_engine') IS NOT NULL, 'isolated Emporio engine schema exists');
SELECT is((SELECT count(*)::int FROM pg_tables WHERE schemaname='papelemi_engine'), 144, 'all 144 source tables are present');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='papelemi_engine' AND p.prokind='f'), 84, 'all 84 source functions are present');
SELECT is((SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='papelemi_engine' AND NOT t.tgisinternal), 94, 'all 94 source triggers are present');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='papelemi_engine'), 234, 'all 234 source RLS policies are present');
SELECT is((SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='papelemi_engine' AND c.relkind='r' AND c.relrowsecurity), 144, 'RLS is enabled on every engine table');
SELECT is((SELECT count(*)::int FROM pg_views WHERE schemaname='papelemi_engine'), 4, 'all 4 source views are present');
SELECT is((
  SELECT count(*)::int
  FROM pg_class idx
  JOIN pg_namespace ns ON ns.oid = idx.relnamespace
  JOIN pg_index i ON i.indexrelid = idx.oid
  LEFT JOIN pg_constraint con ON con.conindid = idx.oid
  WHERE ns.nspname = 'papelemi_engine' AND con.oid IS NULL
), 306, 'all 306 explicit source indexes are present, excluding constraint-backed indexes');
SELECT is((SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='papelemi_engine' AND t.typtype='e'), 5, 'all 5 source enum types are present');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='papelemi_engine' AND coalesce(array_to_string(p.proconfig, ','),'') LIKE '%search_path=papelemi_engine%pg_catalog%public%pg_temp%'), 84, 'all engine functions use a fixed engine-first search path');
SELECT ok(has_schema_privilege('authenticated','papelemi_engine','USAGE'), 'authenticated role can access the engine schema');
SELECT ok(has_schema_privilege('service_role','papelemi_engine','USAGE'), 'service role can access the engine schema');
SELECT ok(NOT has_schema_privilege('anon','papelemi_engine','USAGE'), 'anonymous role cannot access the engine schema');
SELECT ok(has_table_privilege('authenticated','papelemi_engine.products','SELECT'), 'authenticated admins can read engine products');
SELECT ok(has_function_privilege('authenticated','papelemi_engine.has_role(uuid,papelemi_engine.app_role)','EXECUTE'), 'authenticated admins can verify engine roles');
SELECT ok(NOT has_function_privilege('anon','papelemi_engine.has_role(uuid,papelemi_engine.app_role)','EXECUTE'), 'anonymous users cannot call engine role RPC');
SELECT ok(NOT has_table_privilege('authenticated','papelemi_engine.image_processing_jobs','TRUNCATE'), 'authenticated users cannot truncate engine tables');
SELECT ok(NOT has_table_privilege('anon','papelemi_engine.image_processing_jobs','TRUNCATE'), 'anonymous users cannot truncate engine tables');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee IN ('anon','authenticated') AND table_schema='papelemi_engine' AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')), 'no unsafe table privileges are granted to API roles');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='papelemi_engine'), 'anonymous users have no direct engine table grants');
SELECT ok(NOT EXISTS (SELECT 1 FROM information_schema.role_routine_grants WHERE grantee='anon' AND specific_schema='papelemi_engine'), 'anonymous users have no engine RPC grants');
SELECT has_table('public','products','existing PapeLemi public products table remains intact');
SELECT has_table('public','categories','existing PapeLemi public categories table remains intact');
SELECT ok(EXISTS (SELECT 1 FROM storage.buckets WHERE id='product-images' AND public IS TRUE), 'PapeLemi product image bucket exists');
SELECT * FROM finish();
ROLLBACK;