BEGIN;
SELECT plan(6);

CREATE TEMP TABLE _papelemi_test_admin (id uuid PRIMARY KEY);
INSERT INTO _papelemi_test_admin (id) VALUES (gen_random_uuid());

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  id,
  'authenticated',
  'authenticated',
  'papelemi-engine-admin-test@example.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"PapeLemi Admin Test"}'::jsonb,
  now(),
  now()
FROM _papelemi_test_admin;

INSERT INTO public.user_roles (user_id, role, store_key)
SELECT id, 'admin'::public.app_role, 'papelemi'
FROM _papelemi_test_admin;

SELECT ok(NOT has_function_privilege('anon', 'papelemi_engine.sync_papelemi_admin_roles()', 'EXECUTE'),
  'anonymous users cannot run the admin bootstrap');
SELECT ok(NOT has_function_privilege('authenticated', 'papelemi_engine.sync_papelemi_admin_roles()', 'EXECUTE'),
  'authenticated users cannot run the admin bootstrap');
SELECT ok(has_function_privilege('service_role', 'papelemi_engine.sync_papelemi_admin_roles()', 'EXECUTE'),
  'server service role can run the admin bootstrap');
SELECT is(papelemi_engine.sync_papelemi_admin_roles(), 1,
  'only the PapeLemi admin role is copied into the engine');
SELECT ok(EXISTS (
  SELECT 1
  FROM papelemi_engine.profiles p
  JOIN _papelemi_test_admin t ON t.id = p.id
  WHERE p.email = 'papelemi-engine-admin-test@example.invalid'
), 'the existing PapeLemi auth identity receives an engine profile');
SELECT ok(EXISTS (
  SELECT 1
  FROM papelemi_engine.user_roles r
  JOIN _papelemi_test_admin t ON t.id = r.user_id
  WHERE r.role = 'admin'::papelemi_engine.app_role
), 'the existing PapeLemi admin receives engine admin access');

SELECT * FROM finish();
ROLLBACK;
