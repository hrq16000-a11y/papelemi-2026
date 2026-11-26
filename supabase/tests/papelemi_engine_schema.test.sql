BEGIN;
SELECT plan(41);
SELECT ok(to_regnamespace('papelemi_engine') IS NOT NULL, 'isolated Emporio engine schema exists');
SELECT is((SELECT count(*)::int FROM pg_tables WHERE schemaname='papelemi_engine'), 150, 'all 150 Supabase + Drizzle source tables are present');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='papelemi_engine' AND p.prokind='f' AND p.proname <> 'sync_papelemi_admin_roles'), 88, 'all 88 source functions are present, excluding the PapeLemi bootstrap helper');
SELECT is((SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='papelemi_engine' AND NOT t.tgisinternal), 95, 'all 95 source triggers are present');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname='papelemi_engine'), 246, 'all 246 engine RLS policies are present');
SELECT is((SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='papelemi_engine' AND c.relkind='r' AND c.relrowsecurity), 150, 'RLS is enabled on every engine table');
SELECT is((SELECT count(*)::int FROM pg_views WHERE schemaname='papelemi_engine'), 4, 'all 4 source views are present');
SELECT is((
  SELECT count(*)::int
  FROM pg_class idx
  JOIN pg_namespace ns ON ns.oid = idx.relnamespace
  JOIN pg_index i ON i.indexrelid = idx.oid
  LEFT JOIN pg_constraint con ON con.conindid = idx.oid
  WHERE ns.nspname = 'papelemi_engine' AND con.oid IS NULL
), 309, 'all 309 explicit source indexes are present, excluding constraint-backed indexes');
SELECT is((SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='papelemi_engine' AND t.typtype='e'), 5, 'all 5 source enum types are present');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='papelemi_engine' AND coalesce(array_to_string(p.proconfig, ','),'') LIKE '%search_path=papelemi_engine%pg_catalog%public%pg_temp%'), 88, 'all engine functions use a fixed engine-first search path');
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
SELECT ok(NOT EXISTS (
  SELECT 1
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE n.nspname = 'papelemi_engine'
    AND grantee.rolname = 'anon'
), 'anonymous role has no default privileges on future engine objects');
SELECT has_table('papelemi_engine','user_preferences','Drizzle user preferences table exists');
SELECT has_table('papelemi_engine','after_sales_rules','Drizzle after-sales rules table exists');
SELECT has_table('papelemi_engine','after_sales_followups','Drizzle after-sales follow-ups table exists');
SELECT has_table('papelemi_engine','editorial_stories','Drizzle editorial stories table exists');
SELECT has_table('papelemi_engine','support_threads','Drizzle support threads table exists');
SELECT has_table('papelemi_engine','support_messages','Drizzle support messages table exists');
SELECT ok(EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='papelemi_engine'
    AND table_name='review_import_audit'
    AND column_name='decision_reason'
), 'review import audit decision_reason column exists');
SELECT ok(to_regprocedure('papelemi_engine.admin_search_preview_rank(text,integer,uuid,numeric,numeric,integer,jsonb)') IS NOT NULL, 'admin search preview RPC exists');
SELECT ok(has_function_privilege('authenticated','papelemi_engine.admin_search_preview_rank(text,integer,uuid,numeric,numeric,integer,jsonb)','EXECUTE'), 'authenticated admins can run admin search preview');
SELECT ok(to_regprocedure('papelemi_engine.preview_search_boost(jsonb)') IS NOT NULL, 'preview search boost RPC exists');
SELECT ok(has_function_privilege('authenticated','papelemi_engine.preview_search_boost(jsonb)','EXECUTE'), 'authenticated admins can preview search boosts');
SELECT ok(to_regprocedure('papelemi_engine.claim_support_thread(uuid)') IS NOT NULL, 'support thread claim RPC exists');
SELECT ok(has_function_privilege('service_role','papelemi_engine.claim_support_thread(uuid)','EXECUTE'), 'service role can claim support threads');
SELECT ok(NOT has_function_privilege('authenticated','papelemi_engine.claim_support_thread(uuid)','EXECUTE'), 'authenticated clients cannot claim support threads directly');
SELECT ok(
  to_regprocedure('papelemi_engine.validate_followup_schedule()') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='papelemi_engine'
      AND c.relname='after_sales_followups'
      AND t.tgname='validate_followup_schedule'
      AND NOT t.tgisinternal
  ),
  'after-sales schedule validation trigger exists'
);
SELECT ok(
  pg_get_functiondef('papelemi_engine.create_order_with_items(jsonb,jsonb)'::regprocedure) LIKE '%''subtotal''%'
  AND pg_get_functiondef('papelemi_engine.create_order_with_items(jsonb,jsonb)'::regprocedure) LIKE '%''items''%'
  AND (
    pg_get_functiondef('papelemi_engine.create_order_with_items(jsonb,jsonb)'::regprocedure) LIKE '%FROM papelemi_engine.products p%'
    OR pg_get_functiondef('papelemi_engine.create_order_with_items(jsonb,jsonb)'::regprocedure) LIKE '%FROM "papelemi_engine"."products" p%'
  ),
  'checkout returns subtotal and items while keeping server-side catalog price calculation'
);
SELECT * FROM finish();
ROLLBACK;