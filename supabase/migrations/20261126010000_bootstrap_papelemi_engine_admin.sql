-- Bootstrap only PapeLemi's existing administrators into the imported engine.
-- No Emporio users, customers, orders, payment records, or credentials are copied.
CREATE OR REPLACE FUNCTION papelemi_engine.sync_papelemi_admin_roles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, papelemi_engine, public, auth, pg_temp
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO papelemi_engine.profiles (id, email, full_name)
  SELECT
    u.id,
    COALESCE(NULLIF(btrim(u.email), ''), u.id::text),
    NULLIF(btrim(COALESCE(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name'
    )), '')
  FROM auth.users AS u
  JOIN public.user_roles AS r ON r.user_id = u.id
  WHERE r.store_key = 'papelemi'
    AND r.role::text = 'admin'
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, papelemi_engine.profiles.full_name),
        updated_at = now();

  INSERT INTO papelemi_engine.user_roles (user_id, role)
  SELECT DISTINCT
    r.user_id,
    'admin'::papelemi_engine.app_role
  FROM public.user_roles AS r
  JOIN auth.users AS u ON u.id = r.user_id
  WHERE r.store_key = 'papelemi'
    AND r.role::text = 'admin'
  ON CONFLICT (user_id, role) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION papelemi_engine.sync_papelemi_admin_roles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION papelemi_engine.sync_papelemi_admin_roles() TO service_role;

-- Idempotent: reuse the existing PapeLemi Auth identity without changing its credentials.
SELECT papelemi_engine.sync_papelemi_admin_roles();
