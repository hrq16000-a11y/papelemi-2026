


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'user',
    'editor',
    'customer'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."kit_bundle_type" AS ENUM (
    'suggested',
    'curated',
    'premium'
);


ALTER TYPE "public"."kit_bundle_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'approved',
    'refunded',
    'cancelled'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."shipping_condition_type" AS ENUM (
    'min_cart_value',
    'specific_state',
    'zip_code_range'
);


ALTER TYPE "public"."shipping_condition_type" OWNER TO "postgres";


CREATE TYPE "public"."shipping_discount_type" AS ENUM (
    'free_shipping',
    'fixed_discount',
    'percentage_discount'
);


ALTER TYPE "public"."shipping_discount_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_audit_anomalies"("_window_hours" integer DEFAULT 24, "_threshold" integer DEFAULT 3) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _window_hours IS NULL OR _window_hours <= 0 OR _window_hours > 24*30 THEN
    _window_hours := 24;
  END IF;
  IF _threshold IS NULL OR _threshold < 2 THEN _threshold := 3; END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v FROM (
    SELECT
      target_email,
      target_user_id,
      count(*)                                            AS event_count,
      count(*) FILTER (WHERE status = 'success')          AS approvals,
      count(*) FILTER (WHERE status = 'requested')        AS requests,
      count(*) FILTER (WHERE status IN ('rejected','revoked','error')) AS negatives,
      min(created_at)                                     AS first_event,
      max(created_at)                                     AS last_event
    FROM public.admin_audit_timeline
    WHERE created_at >= now() - make_interval(hours => _window_hours)
      AND target_email IS NOT NULL
      AND status IN ('success','requested','rejected','revoked','error')
    GROUP BY target_email, target_user_id
    HAVING count(*) >= _threshold
    ORDER BY count(*) DESC, max(created_at) DESC
    LIMIT 50
  ) t;

  RETURN jsonb_build_object(
    'window_hours', _window_hours,
    'threshold',    _threshold,
    'items',        v
  );
END $$;


ALTER FUNCTION "public"."admin_audit_anomalies"("_window_hours" integer, "_threshold" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_default_weight"("_default_kg" numeric DEFAULT 0.150) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta operação';
  END IF;
  IF _default_kg IS NULL OR _default_kg <= 0 OR _default_kg > 30 THEN
    RAISE EXCEPTION 'Peso padrão inválido (use entre 0.001 e 30 kg)';
  END IF;

  UPDATE public.products
     SET weight = _default_kg, updated_at = now()
   WHERE is_active = true
     AND (weight IS NULL OR weight = 0);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'updated', v_updated, 'default_kg', _default_kg);
END;
$$;


ALTER FUNCTION "public"."apply_default_weight"("_default_kg" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_catalog_security"("_scan_id" "uuid", "_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF; IF _reason IS NULL OR length(btrim(_reason))<10 THEN RAISE EXCEPTION 'Provide a detailed approval reason'; END IF; IF _scan_id IS NULL OR _scan_id IS DISTINCT FROM public.unresolved_catalog_security_scan() THEN RAISE EXCEPTION 'Blocking scan changed, refresh first'; END IF; INSERT INTO public.catalog_security_approvals(scan_id,approved_by,reason) VALUES(_scan_id,auth.uid(),btrim(_reason)) ON CONFLICT(scan_id) DO NOTHING; END; $$;


ALTER FUNCTION "public"."approve_catalog_security"("_scan_id" "uuid", "_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_home_sections"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.home_section_audit (section_key, action, old_value, new_value, changed_by, changed_by_email)
    VALUES (NEW.section_key, 'created', NULL,
            jsonb_build_object('is_visible', NEW.is_visible, 'position', NEW.position, 'label', NEW.label),
            v_uid, v_email);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.home_section_audit (section_key, action, old_value, new_value, changed_by, changed_by_email)
    VALUES (OLD.section_key, 'deleted',
            jsonb_build_object('is_visible', OLD.is_visible, 'position', OLD.position, 'label', OLD.label),
            NULL, v_uid, v_email);
    RETURN OLD;
  END IF;

  -- UPDATE
  IF NEW.is_visible IS DISTINCT FROM OLD.is_visible THEN
    INSERT INTO public.home_section_audit (section_key, action, old_value, new_value, changed_by, changed_by_email)
    VALUES (NEW.section_key, 'visibility_changed',
            jsonb_build_object('is_visible', OLD.is_visible),
            jsonb_build_object('is_visible', NEW.is_visible),
            v_uid, v_email);
  END IF;

  IF NEW.position IS DISTINCT FROM OLD.position THEN
    INSERT INTO public.home_section_audit (section_key, action, old_value, new_value, changed_by, changed_by_email)
    VALUES (NEW.section_key, 'reordered',
            jsonb_build_object('position', OLD.position),
            jsonb_build_object('position', NEW.position),
            v_uid, v_email);
  END IF;

  IF NEW.label IS DISTINCT FROM OLD.label
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.editable_props IS DISTINCT FROM OLD.editable_props THEN
    INSERT INTO public.home_section_audit (section_key, action, old_value, new_value, changed_by, changed_by_email)
    VALUES (NEW.section_key, 'edited',
            jsonb_build_object('label', OLD.label, 'description', OLD.description, 'editable_props', OLD.editable_props),
            jsonb_build_object('label', NEW.label, 'description', NEW.description, 'editable_props', NEW.editable_props),
            v_uid, v_email);
  END IF;

  RETURN NEW;
END $$;


ALTER FUNCTION "public"."audit_home_sections"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_pdp_sections"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.pdp_section_audit (section_key, action, new_value, changed_by, changed_by_email)
    VALUES (NEW.section_key, 'created',
            jsonb_build_object('is_visible', NEW.is_visible, 'position', NEW.position, 'label', NEW.label),
            v_uid, v_email);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.pdp_section_audit (section_key, action, old_value, changed_by, changed_by_email)
    VALUES (OLD.section_key, 'deleted',
            jsonb_build_object('is_visible', OLD.is_visible, 'position', OLD.position, 'label', OLD.label),
            v_uid, v_email);
    RETURN OLD;
  END IF;

  IF NEW.is_visible IS DISTINCT FROM OLD.is_visible THEN
    INSERT INTO public.pdp_section_audit (section_key, action, old_value, new_value, changed_by, changed_by_email)
    VALUES (NEW.section_key, 'visibility_changed',
            jsonb_build_object('is_visible', OLD.is_visible),
            jsonb_build_object('is_visible', NEW.is_visible),
            v_uid, v_email);
  END IF;

  IF NEW.position IS DISTINCT FROM OLD.position THEN
    INSERT INTO public.pdp_section_audit (section_key, action, old_value, new_value, changed_by, changed_by_email)
    VALUES (NEW.section_key, 'reordered',
            jsonb_build_object('position', OLD.position),
            jsonb_build_object('position', NEW.position),
            v_uid, v_email);
  END IF;

  IF NEW.label IS DISTINCT FROM OLD.label
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.editable_props IS DISTINCT FROM OLD.editable_props THEN
    INSERT INTO public.pdp_section_audit (section_key, action, old_value, new_value, changed_by, changed_by_email)
    VALUES (NEW.section_key, 'edited',
            jsonb_build_object('label', OLD.label, 'description', OLD.description, 'editable_props', OLD.editable_props),
            jsonb_build_object('label', NEW.label, 'description', NEW.description, 'editable_props', NEW.editable_props),
            v_uid, v_email);
  END IF;

  RETURN NEW;
END $$;


ALTER FUNCTION "public"."audit_pdp_sections"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_role_revocation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_target_email text;
BEGIN
  IF OLD.role <> 'admin' THEN
    RETURN OLD;
  END IF;
  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller;
  SELECT email INTO v_target_email FROM public.profiles WHERE id = OLD.user_id;
  INSERT INTO public.role_promotion_audit
    (promoted_by, promoted_by_email, target_user_id, target_email, role, status, message)
  VALUES (v_caller, v_caller_email, OLD.user_id, coalesce(v_target_email, '(desconhecido)'),
          'admin', 'revoked', 'Papel admin removido.');
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."audit_role_revocation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_system_dump"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Tables + RLS status
  v := v || jsonb_build_object('tables', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', schemaname, 'name', tablename, 'rls_enabled', rowsecurity, 'force_rls', forcerowsecurity
    ) ORDER BY tablename), '[]'::jsonb)
    FROM pg_tables WHERE schemaname = 'public'
  ));

  -- Columns
  v := v || jsonb_build_object('columns', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'table', table_name, 'column', column_name, 'type', data_type,
      'nullable', is_nullable, 'default', column_default
    ) ORDER BY table_name, ordinal_position), '[]'::jsonb)
    FROM information_schema.columns WHERE table_schema = 'public'
  ));

  -- RLS policies
  v := v || jsonb_build_object('policies', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', schemaname, 'table', tablename, 'name', policyname,
      'permissive', permissive, 'roles', roles, 'cmd', cmd,
      'using', qual, 'with_check', with_check
    ) ORDER BY tablename, policyname), '[]'::jsonb)
    FROM pg_policies WHERE schemaname = 'public'
  ));

  -- Functions
  v := v || jsonb_build_object('functions', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'language', l.lanname,
      'security_definer', p.prosecdef,
      'returns', pg_get_function_result(p.oid),
      'args', pg_get_function_arguments(p.oid)
    ) ORDER BY p.proname), '[]'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND l.lanname IN ('plpgsql','sql')
  ));

  -- Triggers
  v := v || jsonb_build_object('triggers', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', trigger_name, 'table', event_object_table,
      'event', event_manipulation, 'timing', action_timing, 'action', action_statement
    ) ORDER BY event_object_table, trigger_name), '[]'::jsonb)
    FROM information_schema.triggers WHERE trigger_schema = 'public'
  ));

  -- Indexes
  v := v || jsonb_build_object('indexes', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', indexname, 'definition', indexdef
    ) ORDER BY tablename, indexname), '[]'::jsonb)
    FROM pg_indexes WHERE schemaname = 'public'
  ));

  -- Storage buckets
  v := v || jsonb_build_object('storage_buckets', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'public', public, 'file_size_limit', file_size_limit,
      'allowed_mime_types', allowed_mime_types, 'created_at', created_at
    ) ORDER BY id), '[]'::jsonb)
    FROM storage.buckets
  ));

  -- Cron jobs
  BEGIN
    v := v || jsonb_build_object('cron_jobs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'jobid', jobid, 'jobname', jobname, 'schedule', schedule, 'command', command, 'active', active
      ) ORDER BY jobid), '[]'::jsonb)
      FROM cron.job
    ));
  EXCEPTION WHEN OTHERS THEN
    v := v || jsonb_build_object('cron_jobs', '[]'::jsonb);
  END;

  -- User roles
  v := v || jsonb_build_object('user_roles', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'user_id', ur.user_id, 'role', ur.role, 'email', p.email, 'created_at', ur.created_at
    ) ORDER BY ur.role, p.email), '[]'::jsonb)
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
  ));

  -- Profiles count + sample
  v := v || jsonb_build_object('profiles', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'full_name', full_name, 'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb)
    FROM public.profiles
  ));

  v := v || jsonb_build_object('generated_at', now());
  RETURN v;
END;
$$;


ALTER FUNCTION "public"."audit_system_dump"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_create_redirect_on_slug_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_prefix text;
  v_from text;
  v_to text;
BEGIN
  IF OLD.slug IS NULL OR NEW.slug IS NULL OR OLD.slug = NEW.slug THEN
    RETURN NEW;
  END IF;

  -- Fase 4.1: products migrou para namespace canônico /produto (singular).
  -- Demais taxonomias mantêm seus prefixos atuais.
  v_prefix := CASE TG_TABLE_NAME
    WHEN 'products'   THEN '/produto/'
    WHEN 'categories' THEN '/categoria/'
    WHEN 'tags'       THEN '/tag/'
    WHEN 'occasions'  THEN '/ocasiao/'
    WHEN 'segments'   THEN '/segmento/'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RETURN NEW;
  END IF;

  v_from := v_prefix || OLD.slug;
  v_to   := v_prefix || NEW.slug;

  INSERT INTO public.redirects (from_path, to_path, status_code, is_active, notes)
  VALUES (v_from, v_to, 301, true, 'Auto-gerado: slug alterado em ' || TG_TABLE_NAME)
  ON CONFLICT DO NOTHING;

  -- Flatten: se algum redirect antigo apontava para o slug que acabou de mudar,
  -- repassa o destino para o novo, evitando cadeias A→B→C.
  UPDATE public.redirects SET to_path = v_to, updated_at = now()
   WHERE to_path = v_from AND is_active = true;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_create_redirect_on_slug_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_search_cache_version"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.store_settings (key, value, updated_at)
  VALUES ('search_cache_version', jsonb_build_object('version', extract(epoch from now())::bigint, 'source', TG_TABLE_NAME), now())
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('version', extract(epoch from now())::bigint, 'source', TG_TABLE_NAME),
        updated_at = now();
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."bump_search_cache_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."catalog_security_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE blocked_scan uuid; enabled boolean; BEGIN IF NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; SELECT coalesce(block_catalog,true) INTO enabled FROM public.operational_settings WHERE id=true; blocked_scan:=public.unresolved_catalog_security_scan(); RETURN jsonb_build_object('blocked',coalesce(enabled,true) AND blocked_scan IS NOT NULL,'scan_id',blocked_scan,'approved',false); END; $$;


ALTER FUNCTION "public"."catalog_security_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_resend_email_cooldown"("_order_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_last  timestamptz;
  v_count int;
  v_cooldown_seconds int := 60;
  v_hourly_limit int := 10;
  v_remaining int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem reenviar e-mails';
  END IF;

  SELECT max(created_at) INTO v_last
    FROM public.tracking_email_log
   WHERE order_id = _order_id
     AND email_type = 'resend_status';

  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => v_cooldown_seconds) THEN
    v_remaining := v_cooldown_seconds - extract(epoch FROM (now() - v_last))::int;
    RAISE EXCEPTION 'Aguarde % segundos antes de reenviar este e-mail.', GREATEST(v_remaining,1)
      USING ERRCODE = '23505', HINT = 'cooldown';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.tracking_email_log
   WHERE triggered_by = v_caller
     AND email_type = 'resend_status'
     AND created_at > now() - interval '1 hour';

  IF v_count >= v_hourly_limit THEN
    RAISE EXCEPTION 'Limite de % reenvios por hora atingido. Tente mais tarde.', v_hourly_limit
      USING ERRCODE = '23505', HINT = 'rate_limited';
  END IF;

  RETURN jsonb_build_object('ok', true, 'cooldown_seconds', v_cooldown_seconds, 'hourly_limit', v_hourly_limit);
END;
$$;


ALTER FUNCTION "public"."check_resend_email_cooldown"("_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_taxonomy_slug_unique"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_self text := TG_TABLE_NAME;
  v_conflict text;
  v_kind text;
BEGIN
  -- Apenas valida quando o slug está sendo introduzido ou alterado
  IF TG_OP = 'UPDATE' AND NEW.slug IS NOT DISTINCT FROM OLD.slug THEN
    RETURN NEW;
  END IF;

  IF NEW.slug IS NULL OR length(trim(NEW.slug)) = 0 THEN
    RETURN NEW;
  END IF;

  -- Checa cada uma das outras tabelas; ignora a tabela atual
  IF v_self <> 'categories' AND EXISTS (SELECT 1 FROM public.categories WHERE slug = NEW.slug) THEN
    v_conflict := 'categoria'; v_kind := 'categories';
  ELSIF v_self <> 'occasions' AND EXISTS (SELECT 1 FROM public.occasions WHERE slug = NEW.slug) THEN
    v_conflict := 'ocasião'; v_kind := 'occasions';
  ELSIF v_self <> 'segments' AND EXISTS (SELECT 1 FROM public.segments WHERE slug = NEW.slug) THEN
    v_conflict := 'segmento'; v_kind := 'segments';
  ELSIF v_self <> 'tags' AND EXISTS (SELECT 1 FROM public.tags WHERE slug = NEW.slug) THEN
    v_conflict := 'tag'; v_kind := 'tags';
  END IF;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION
      'O slug "%" já está em uso em outra taxonomia (%). Escolha um slug único entre categorias, ocasiões, segmentos e tags.',
      NEW.slug, v_conflict
      USING ERRCODE = '23505', HINT = v_kind;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_taxonomy_slug_unique"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."image_processing_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket" "text" DEFAULT 'product-images'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "error" "text",
    "source_bytes" bigint,
    "output_bytes" bigint,
    "width" integer,
    "height" integer,
    "placeholder" "text",
    "variants" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "claim_token" "uuid",
    "lease_expires_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."image_processing_jobs" REPLICA IDENTITY FULL;


ALTER TABLE "public"."image_processing_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_image_processing_jobs"("_limit" integer DEFAULT 5) RETURNS SETOF "public"."image_processing_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN UPDATE public.image_processing_jobs SET status='error',error='Processing lease expired; retry required',lease_expires_at=NULL,claim_token=NULL WHERE status='processing' AND coalesce(lease_expires_at,updated_at+interval '10 minutes') < now() AND attempts>=3; RETURN QUERY WITH candidates AS (SELECT id FROM public.image_processing_jobs WHERE attempts<3 AND (status IN ('pending','retry') OR (status='processing' AND coalesce(lease_expires_at,updated_at+interval '10 minutes')<now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(_limit,5))) UPDATE public.image_processing_jobs j SET status='processing',attempts=j.attempts+1,claim_token=gen_random_uuid(),lease_expires_at=now()+interval '10 minutes' FROM candidates c WHERE j.id=c.id RETURNING j.*; END; $$;


ALTER FUNCTION "public"."claim_image_processing_jobs"("_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_pdp_badge_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.pdp_badge_events
   WHERE created_at < now() - interval '180 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_pdp_badge_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_pdp_funnel_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.pdp_funnel_events
   WHERE created_at < now() - interval '180 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_pdp_funnel_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_seo_url_status"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.seo_url_status
  WHERE checked_at < (now() - interval '180 days');
END;
$$;


ALTER FUNCTION "public"."cleanup_seo_url_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stale_bundle_logs"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.stale_bundle_logs
   WHERE occurred_at < now() - interval '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted, 'ran_at', now());
END;
$$;


ALTER FUNCTION "public"."cleanup_stale_bundle_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_web_vitals_history"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE days integer; removed integer; BEGIN SELECT retention_days INTO days FROM public.operational_settings LIMIT 1; IF coalesce(days,0)=0 THEN RETURN 0; END IF; DELETE FROM public.web_vitals_reports WHERE created_at < now()-make_interval(days=>days); GET DIAGNOSTICS removed=ROW_COUNT; RETURN removed; END; $$;


ALTER FUNCTION "public"."cleanup_web_vitals_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_with_items"("_order" "jsonb", "_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  new_order_id uuid;
  new_order_code text;
  item_count int;
  v_coupon_code text;
  v_subtotal numeric;
  v_discount numeric;
  v_total numeric;
  v_shipping numeric;
  v_email text;
  v_item jsonb;
  v_qty int;
  v_price numeric;
  c record;
BEGIN
  IF _order IS NULL OR _items IS NULL THEN
    RAISE EXCEPTION 'Missing order or items';
  END IF;

  item_count := jsonb_array_length(_items);
  IF item_count = 0 OR item_count > 200 THEN
    RAISE EXCEPTION 'Invalid items count';
  END IF;

  IF coalesce(length(_order->>'customer_name'),0) = 0
     OR coalesce(length(_order->>'customer_email'),0) = 0
     OR coalesce(length(_order->>'order_code'),0) = 0 THEN
    RAISE EXCEPTION 'Missing required customer fields';
  END IF;

  IF length(_order->>'customer_name')  > 200
     OR length(_order->>'customer_email') > 320
     OR length(coalesce(_order->>'customer_phone','')) > 40
     OR length(_order->>'order_code') > 32 THEN
    RAISE EXCEPTION 'Field too long';
  END IF;

  v_email := lower(trim(_order->>'customer_email'));
  IF v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  IF (_order->>'order_code') !~ '^[A-Za-z0-9-]{4,32}$' THEN
    RAISE EXCEPTION 'Invalid order_code format';
  END IF;

  v_coupon_code := NULLIF(_order->>'coupon_code','');
  v_subtotal := coalesce((_order->>'subtotal')::numeric, 0);
  v_shipping := coalesce((_order->>'shipping_price')::numeric, 0);

  IF v_subtotal < 0 OR v_shipping < 0 THEN
    RAISE EXCEPTION 'Negative monetary value';
  END IF;
  IF v_subtotal > 1000000 THEN
    RAISE EXCEPTION 'Unrealistic order total';
  END IF;

  -- Per-item validation
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty   := coalesce((v_item->>'quantity')::int, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, -1);
    IF coalesce(length(v_item->>'product_name'),0) = 0
       OR length(v_item->>'product_name') > 300 THEN
      RAISE EXCEPTION 'Invalid product_name on item';
    END IF;
    IF v_qty <= 0 OR v_qty > 10000 THEN
      RAISE EXCEPTION 'Invalid item quantity';
    END IF;
    IF v_price < 0 OR v_price > 1000000 THEN
      RAISE EXCEPTION 'Invalid item unit_price';
    END IF;
    IF coalesce(length(v_item->>'personalization'),0) > 1000 THEN
      RAISE EXCEPTION 'Personalization too long';
    END IF;
  END LOOP;

  -- Validação atômica do cupom com lock + cálculo server-side do desconto
  v_discount := 0;
  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO c FROM public.coupons
      WHERE upper(code) = upper(v_coupon_code)
      FOR UPDATE;
    IF NOT FOUND OR NOT c.is_active THEN
      RAISE EXCEPTION 'Cupom inválido ou inativo';
    END IF;
    IF c.valid_from IS NOT NULL AND now() < c.valid_from THEN
      RAISE EXCEPTION 'Cupom ainda não disponível';
    END IF;
    IF c.valid_until IS NOT NULL AND now() > c.valid_until THEN
      RAISE EXCEPTION 'Cupom expirado';
    END IF;
    IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
      RAISE EXCEPTION 'Cupom esgotado';
    END IF;
    IF v_subtotal < c.min_subtotal THEN
      RAISE EXCEPTION 'Valor mínimo não atingido para o cupom';
    END IF;

    -- CRÍTICO: recalcular o desconto no servidor, ignorando valor do cliente.
    IF c.discount_type = 'percent' THEN
      v_discount := round((v_subtotal * c.discount_value / 100)::numeric, 2);
    ELSE
      v_discount := least(c.discount_value, v_subtotal);
    END IF;
    IF v_discount < 0 THEN v_discount := 0; END IF;
    IF v_discount > v_subtotal THEN v_discount := v_subtotal; END IF;
  END IF;

  -- Total recalculado pelo servidor
  v_total := v_subtotal - v_discount + v_shipping;
  IF v_total < 0 THEN v_total := 0; END IF;

  INSERT INTO public.orders (
    order_code, customer_name, customer_email, customer_phone,
    address_cep, address_street, address_number, address_complement,
    address_neighborhood, address_city, address_state,
    shipping_method, shipping_company, shipping_days, shipping_price,
    subtotal, total, status, coupon_code, discount_amount
  ) VALUES (
    _order->>'order_code',
    _order->>'customer_name',
    v_email,
    _order->>'customer_phone',
    _order->>'address_cep',
    _order->>'address_street',
    _order->>'address_number',
    _order->>'address_complement',
    _order->>'address_neighborhood',
    _order->>'address_city',
    _order->>'address_state',
    coalesce(_order->>'shipping_method','A calcular via WhatsApp'),
    _order->>'shipping_company',
    NULLIF(_order->>'shipping_days','')::int,
    v_shipping,
    v_subtotal,
    v_total,
    coalesce(_order->>'status','pending'),
    v_coupon_code,
    v_discount
  )
  RETURNING id, order_code INTO new_order_id, new_order_code;

  INSERT INTO public.order_items (
    order_id, product_name, product_slug, product_image, quantity, unit_price, personalization
  )
  SELECT
    new_order_id,
    item->>'product_name',
    item->>'product_slug',
    item->>'product_image',
    (item->>'quantity')::int,
    (item->>'unit_price')::numeric,
    item->>'personalization'
  FROM jsonb_array_elements(_items) AS item;

  IF v_coupon_code IS NOT NULL THEN
    INSERT INTO public.coupon_uses (coupon_id, order_id, subtotal, discount_applied)
    VALUES (c.id, new_order_id, v_subtotal, v_discount);

    UPDATE public.coupons SET used_count = used_count + 1, updated_at = now() WHERE id = c.id;
  END IF;

  RETURN jsonb_build_object('id', new_order_id, 'order_code', new_order_code, 'discount_amount', v_discount, 'total', v_total);
END;
$_$;


ALTER FUNCTION "public"."create_order_with_items"("_order" "jsonb", "_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_catalog_security"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF coalesce((SELECT block_catalog FROM public.operational_settings WHERE id=true),true) AND public.unresolved_catalog_security_scan() IS NOT NULL THEN RAISE EXCEPTION 'Catalog blocked: unresolved high security regression. Request approval in Admin Security.' USING ERRCODE='42501'; END IF; RETURN NULL; END; $$;


ALTER FUNCTION "public"."enforce_catalog_security"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_product_category"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'Produto precisa ter uma categoria (category_id) definida.'
      USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_product_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_product_weight_on_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.weight IS NULL OR NEW.weight <= 0) THEN
    RAISE EXCEPTION 'Peso (kg) é obrigatório e deve ser maior que zero para novos produtos.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_product_weight_on_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_external_ref"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.external_ref IS NOT NULL AND length(trim(NEW.external_ref)) > 0 THEN
    RETURN NEW;
  END IF;
  v_prefix := CASE TG_TABLE_NAME
    WHEN 'products'   THEN 'prd'
    WHEN 'categories' THEN 'cat'
    WHEN 'occasions'  THEN 'occ'
    WHEN 'tags'       THEN 'tag'
    WHEN 'kits'       THEN 'kit'
    ELSE 'ref'
  END;
  NEW.external_ref := public.gen_external_ref(v_prefix, NEW.slug, NEW.name);
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."ensure_external_ref"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fill_product_google_category"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF (NEW.google_product_category IS NULL OR btrim(NEW.google_product_category) = '')
     AND NEW.category_id IS NOT NULL THEN
    SELECT c.google_product_category INTO NEW.google_product_category
    FROM public.categories c WHERE c.id = NEW.category_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fill_product_google_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gen_external_ref"("_prefix" "text", "_slug" "text", "_fallback" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT _prefix || '_' || COALESCE(
    NULLIF(public.normalize_slug(_slug), ''),
    NULLIF(public.normalize_slug(_fallback), ''),
    substr(md5(random()::text || clock_timestamp()::text), 1, 10)
  )
$$;


ALTER FUNCTION "public"."gen_external_ref"("_prefix" "text", "_slug" "text", "_fallback" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gen_img_ref"("_prefix" "text", "_hint" "text") RETURNS "text"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT coalesce(nullif(_prefix,''),'file') || '_' ||
         coalesce(nullif(left(public.normalize_slug(_hint), 40), ''), 'img') || '_' ||
         substr(md5(random()::text || clock_timestamp()::text), 1, 6)
$$;


ALTER FUNCTION "public"."gen_img_ref"("_prefix" "text", "_hint" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unified_profile"("_kind" "text", "_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_customer  public.customers%ROWTYPE;
  v_user_email text;
  v_visitor_ids text[] := '{}';
  v_primary   public.visitors%ROWTYPE;
  v_agg       record;
  v_kind      text := lower(coalesce(_kind,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _id IS NULL OR length(_id) = 0 THEN
    RAISE EXCEPTION 'missing_id';
  END IF;

  -- Resolver alvo: descobrir customer + visitor_ids associados.
  IF v_kind = 'user' THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = _id::uuid;
    IF v_user_email IS NOT NULL THEN
      SELECT * INTO v_customer FROM public.customers WHERE lower(email) = lower(v_user_email) LIMIT 1;
    END IF;
  ELSIF v_kind = 'customer' THEN
    SELECT * INTO v_customer FROM public.customers WHERE id = _id::uuid;
  ELSIF v_kind = 'visitor' THEN
    SELECT * INTO v_primary FROM public.visitors WHERE visitor_id = _id LIMIT 1;
    IF v_primary.customer_id IS NOT NULL THEN
      SELECT * INTO v_customer FROM public.customers WHERE id = v_primary.customer_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  -- Coletar TODOS os visitor_ids associados (mata a "amnésia").
  IF v_customer.id IS NOT NULL THEN
    SELECT coalesce(array_agg(visitor_id ORDER BY last_seen_at DESC), '{}')
      INTO v_visitor_ids
      FROM public.visitors WHERE customer_id = v_customer.id;
  END IF;
  IF v_kind = 'visitor' AND NOT (_id = ANY(v_visitor_ids)) THEN
    v_visitor_ids := array_append(v_visitor_ids, _id);
  END IF;

  -- Visitante "primário" (mais recente) para herdar infra/origem.
  IF v_primary.id IS NULL AND array_length(v_visitor_ids,1) > 0 THEN
    SELECT * INTO v_primary FROM public.visitors
     WHERE visitor_id = ANY(v_visitor_ids)
     ORDER BY last_seen_at DESC NULLS LAST LIMIT 1;
  END IF;

  -- Agregados de telemetria somando TODOS os visitor_ids.
  SELECT coalesce(sum(total_pageviews),0)     AS pv,
         coalesce(sum(total_sessions),0)      AS sess,
         coalesce(sum(total_time_seconds),0)  AS tt,
         min(first_seen_at)                   AS first_seen,
         max(last_seen_at)                    AS last_seen
    INTO v_agg
    FROM public.visitors WHERE visitor_id = ANY(v_visitor_ids);

  RETURN jsonb_build_object(
    'kind', v_kind,
    'id', _id,
    'visitor_ids', to_jsonb(v_visitor_ids),
    'identity', jsonb_build_object(
      'name',     coalesce(v_customer.name, NULL),
      'email',    coalesce(v_customer.email, v_user_email),
      'whatsapp', coalesce(v_customer.whatsapp, v_primary.whatsapp_phone),
      'phone',    v_customer.phone,
      'customer_id', v_customer.id,
      'is_bot',   v_primary.is_bot,
      'bot_name', v_primary.bot_name,
      'lead_status', v_primary.lead_status,
      'lead_trigger', v_primary.lead_trigger,
      'lead_promoted_at', v_primary.lead_promoted_at,
      'tags', v_customer.tags,
      'status', v_customer.status
    ),
    'infra', jsonb_build_object(
      'ip', v_primary.ip,
      'ip_country', v_primary.ip_country,
      'ip_region',  v_primary.ip_region,
      'ip_city',    v_primary.ip_city,
      'ip_isp',     v_primary.ip_isp,
      'ip_asn',     v_primary.ip_asn,
      'timezone',   coalesce(v_primary.timezone, v_primary.ip_timezone),
      'device_type',  v_primary.device_type,
      'device_brand', v_primary.device_brand,
      'device_model', v_primary.device_model,
      'os_name',      v_primary.os_name,
      'os_version',   v_primary.os_version,
      'browser_name', v_primary.browser_name,
      'browser_version', v_primary.browser_version,
      'language',  v_primary.language,
      'screen_w',  v_primary.screen_w,
      'screen_h',  v_primary.screen_h,
      'lat', coalesce(v_primary.gps_lat, v_primary.ip_lat),
      'lon', coalesce(v_primary.gps_lon, v_primary.ip_lon),
      'gps_accuracy', v_primary.gps_accuracy
    ),
    'commerce', jsonb_build_object(
      'first_referrer',     v_primary.first_referrer,
      'first_landing_path', v_primary.first_landing_path,
      'utm_source',   v_primary.utm_source,
      'utm_medium',   v_primary.utm_medium,
      'utm_campaign', v_primary.utm_campaign,
      'utm_term',     v_primary.utm_term,
      'utm_content',  v_primary.utm_content,
      'source',       v_customer.source,
      'notes',        v_customer.notes
    ),
    'aggregates', jsonb_build_object(
      'total_pageviews',     v_agg.pv,
      'total_sessions',      v_agg.sess,
      'total_time_seconds',  v_agg.tt,
      'first_seen_at',       v_agg.first_seen,
      'last_seen_at',        v_agg.last_seen
    )
  );
END $$;


ALTER FUNCTION "public"."get_unified_profile"("_kind" "text", "_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unified_timeline"("_visitor_ids" "text"[], "_limit" integer DEFAULT 500) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _visitor_ids IS NULL OR array_length(_visitor_ids,1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  IF _limit IS NULL OR _limit <= 0 OR _limit > 2000 THEN _limit := 500; END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.visitor_id, t.step_index NULLS LAST, t.viewed_at), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT id, visitor_id, session_id, path, title, referrer,
             step_index, from_path, cta_id, event_type,
             time_on_page_seconds, scroll_depth_pct, viewed_at
        FROM public.visitor_pageviews
       WHERE visitor_id = ANY(_visitor_ids)
       ORDER BY visitor_id, step_index NULLS LAST, viewed_at
       LIMIT _limit
    ) t;

  RETURN v_rows;
END $$;


ALTER FUNCTION "public"."get_unified_timeline"("_visitor_ids" "text"[], "_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, cep, city, state)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'cep',
    NEW.raw_user_meta_data ->> 'city',
    NEW.raw_user_meta_data ->> 'state'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        cep = COALESCE(EXCLUDED.cep, public.profiles.cep),
        city = COALESCE(EXCLUDED.city, public.profiles.city),
        state = COALESCE(EXCLUDED.state, public.profiles.state),
        updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_visitor_to_customer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_digits text;
  v_cid uuid;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN RETURN NEW; END IF;
  v_digits := public.normalize_phone_digits(NEW.whatsapp_phone);
  IF v_digits IS NULL OR length(v_digits) < 8 THEN RETURN NEW; END IF;

  SELECT id INTO v_cid FROM public.customers
   WHERE public.normalize_phone_digits(whatsapp) = v_digits
      OR public.normalize_phone_digits(phone)    = v_digits
   ORDER BY created_at ASC LIMIT 1;

  IF v_cid IS NOT NULL THEN NEW.customer_id := v_cid; END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."link_visitor_to_customer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_admin_audit_timeline"("_search" "text" DEFAULT NULL::"text", "_status" "text" DEFAULT NULL::"text", "_source" "text" DEFAULT NULL::"text", "_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "_sort_key" "text" DEFAULT 'created_at'::"text", "_sort_dir" "text" DEFAULT 'desc'::"text", "_limit" integer DEFAULT 25, "_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_order  text;
  v_search text := nullif(trim(coalesce(_search, '')), '');
  v_status text := nullif(_status, 'all');
  v_source text := nullif(_source, 'all');
  v_total  bigint;
  v_rows   jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _limit IS NULL OR _limit <= 0 OR _limit > 200 THEN _limit := 25; END IF;
  IF _offset IS NULL OR _offset < 0 THEN _offset := 0; END IF;

  v_order := CASE lower(coalesce(_sort_key,'created_at'))
    WHEN 'status'        THEN 'status'
    WHEN 'target_email'  THEN 'lower(coalesce(target_email,''''))'
    WHEN 'actor_email'   THEN 'lower(coalesce(actor_email,''''))'
    WHEN 'source'        THEN 'source'
    ELSE 'created_at'
  END || CASE WHEN lower(coalesce(_sort_dir,'desc')) = 'asc'
              THEN ' ASC NULLS LAST'
              ELSE ' DESC NULLS LAST'
         END;

  WITH base AS (
    SELECT *
      FROM public.admin_audit_timeline t
     WHERE (v_status IS NULL OR t.status = v_status)
       AND (v_source IS NULL OR t.source = v_source)
       AND (_from   IS NULL OR t.created_at >= _from)
       AND (_to     IS NULL OR t.created_at <= _to)
       AND (
         v_search IS NULL OR
         lower(coalesce(t.target_email,''))  LIKE '%' || lower(v_search) || '%' OR
         lower(coalesce(t.actor_email,''))   LIKE '%' || lower(v_search) || '%' OR
         lower(coalesce(t.details,''))       LIKE '%' || lower(v_search) || '%'
       )
  )
  SELECT count(*) INTO v_total FROM base;

  EXECUTE format($f$
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT *
          FROM public.admin_audit_timeline t
         WHERE ($1::text        IS NULL OR t.status = $1)
           AND ($2::text        IS NULL OR t.source = $2)
           AND ($3::timestamptz IS NULL OR t.created_at >= $3)
           AND ($4::timestamptz IS NULL OR t.created_at <= $4)
           AND (
             $5::text IS NULL OR
             lower(coalesce(t.target_email,''))  LIKE '%%' || lower($5) || '%%' OR
             lower(coalesce(t.actor_email,''))   LIKE '%%' || lower($5) || '%%' OR
             lower(coalesce(t.details,''))       LIKE '%%' || lower($5) || '%%'
           )
         ORDER BY %s
         LIMIT $6 OFFSET $7
      ) x
  $f$, v_order)
  INTO v_rows
  USING v_status, v_source, _from, _to, v_search, _limit, _offset;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $_$;


ALTER FUNCTION "public"."list_admin_audit_timeline"("_search" "text", "_status" "text", "_source" "text", "_from" timestamp with time zone, "_to" timestamp with time zone, "_sort_key" "text", "_sort_dir" "text", "_limit" integer, "_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_all_users"("_search" "text" DEFAULT NULL::"text", "_role" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_search text := nullif(trim(coalesce(_search,'')), '');
  v_role   text := nullif(_role, 'all');
  v_rows   jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
  -- 1) Usuários autenticados (têm profile em auth.users)
  auth_src AS (
    SELECT
      'auth'::text                              AS source,
      p.id::text                                AS user_id,
      p.email,
      p.full_name,
      NULL::text                                AS whatsapp,
      p.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      coalesce(
        (SELECT array_agg(ur.role::text ORDER BY ur.role::text)
           FROM public.user_roles ur WHERE ur.user_id = p.id),
        '{}'::text[]
      )                                         AS roles,
      (SELECT c.id FROM public.customers c
        WHERE lower(coalesce(c.email,'')) = lower(coalesce(p.email,''))
        LIMIT 1)                                AS linked_customer_id,
      0::bigint                                 AS linked_visitors
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
  ),
  -- 2) Customers do CRM (sem login)
  cust_src AS (
    SELECT
      'customer'::text                          AS source,
      ('customer:' || c.id::text)               AS user_id,
      c.email,
      c.name                                    AS full_name,
      c.whatsapp                                AS whatsapp,
      c.created_at,
      NULL::timestamptz                         AS last_sign_in_at,
      NULL::timestamptz                         AS email_confirmed_at,
      '{}'::text[]                              AS roles,
      c.id                                      AS linked_customer_id,
      0::bigint                                 AS linked_visitors
    FROM public.customers c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE lower(coalesce(p.email,'')) = lower(coalesce(c.email,''))
         AND coalesce(c.email,'') <> ''
    )
  ),
  -- 3) Visitantes anônimos com whatsapp (sem login e sem customer com mesmo whats)
  vis_src AS (
    SELECT
      'visitor'::text                           AS source,
      ('visitor:' || v.id::text)                AS user_id,
      NULL::text                                AS email,
      coalesce(nullif(trim(v.whatsapp_phone),''), 'Visitante ' || left(v.id::text,8)) AS full_name,
      v.whatsapp_phone                          AS whatsapp,
      v.created_at,
      NULL::timestamptz                         AS last_sign_in_at,
      NULL::timestamptz                         AS email_confirmed_at,
      '{}'::text[]                              AS roles,
      v.customer_id                             AS linked_customer_id,
      0::bigint                                 AS linked_visitors
    FROM public.visitors v
    WHERE coalesce(trim(v.whatsapp_phone),'') <> ''
      AND v.customer_id IS NULL
  ),
  -- 4) Contatos vindos de pedidos (sem login e sem customer)
  order_src AS (
    SELECT DISTINCT ON (lower(o.customer_email))
      'order'::text                             AS source,
      ('order:' || lower(o.customer_email))     AS user_id,
      o.customer_email                          AS email,
      o.customer_name                           AS full_name,
      o.customer_phone                          AS whatsapp,
      min(o.created_at) OVER (PARTITION BY lower(o.customer_email)) AS created_at,
      NULL::timestamptz                         AS last_sign_in_at,
      NULL::timestamptz                         AS email_confirmed_at,
      '{}'::text[]                              AS roles,
      NULL::uuid                                AS linked_customer_id,
      0::bigint                                 AS linked_visitors
    FROM public.orders o
    WHERE coalesce(trim(o.customer_email),'') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE lower(coalesce(p.email,'')) = lower(o.customer_email)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customers c
         WHERE lower(coalesce(c.email,'')) = lower(o.customer_email)
      )
    ORDER BY lower(o.customer_email), o.created_at DESC
  ),
  combined AS (
    SELECT * FROM auth_src
    UNION ALL SELECT * FROM cust_src
    UNION ALL SELECT * FROM vis_src
    UNION ALL SELECT * FROM order_src
  )
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_rows
  FROM combined t
  WHERE
    (v_search IS NULL OR
       lower(coalesce(t.email,''))     LIKE '%'||lower(v_search)||'%' OR
       lower(coalesce(t.full_name,'')) LIKE '%'||lower(v_search)||'%' OR
       lower(coalesce(t.whatsapp,''))  LIKE '%'||lower(v_search)||'%')
    AND (
      v_role IS NULL OR
      (v_role = 'none'  AND coalesce(array_length(t.roles,1),0) = 0 AND t.source = 'auth') OR
      (v_role <> 'none' AND v_role = ANY(t.roles))
    );

  RETURN jsonb_build_object('rows', v_rows);
END
$$;


ALTER FUNCTION "public"."list_all_users"("_search" "text", "_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_all_users_paginated"("_search" "text" DEFAULT NULL::"text", "_role" "text" DEFAULT NULL::"text", "_source" "text" DEFAULT NULL::"text", "_whatsapp" "text" DEFAULT NULL::"text", "_ip" "text" DEFAULT NULL::"text", "_sort_key" "text" DEFAULT 'created_at'::"text", "_sort_dir" "text" DEFAULT 'desc'::"text", "_limit" integer DEFAULT 25, "_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_caller uuid := auth.uid();
  v_search text := nullif(trim(coalesce(_search,'')), '');
  v_role   text := nullif(_role,'all');
  v_src    text := nullif(_source,'all');
  v_wa     text := nullif(regexp_replace(coalesce(_whatsapp,''),'\D','','g'), '');
  v_order  text;
  v_total  bigint;
  v_rows   jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _limit IS NULL OR _limit <= 0 OR _limit > 500 THEN _limit := 25; END IF;
  IF _offset IS NULL OR _offset < 0 THEN _offset := 0; END IF;

  v_order := CASE lower(coalesce(_sort_key,'created_at'))
    WHEN 'last_sign_in_at'    THEN 'last_sign_in_at'
    WHEN 'email'              THEN 'lower(coalesce(email,''''))'
    WHEN 'full_name'          THEN 'lower(coalesce(full_name,''''))'
    WHEN 'source'             THEN 'source'
    WHEN 'role'               THEN 'role_rank'
    WHEN 'email_confirmed_at' THEN 'email_confirmed_at'
    ELSE 'created_at'
  END
  || CASE WHEN lower(coalesce(_sort_dir,'desc'))='asc'
          THEN ' ASC NULLS LAST' ELSE ' DESC NULLS LAST' END;

  DROP TABLE IF EXISTS tmp_users_pag;
  CREATE TEMP TABLE tmp_users_pag ON COMMIT DROP AS
  WITH auth_src AS (
    SELECT 'auth'::text source, p.id::text user_id,
           p.email, p.full_name,
           NULL::text whatsapp, NULL::inet last_ip,
           p.created_at, u.last_sign_in_at, u.email_confirmed_at,
           coalesce((SELECT array_agg(ur.role::text ORDER BY ur.role::text)
                       FROM public.user_roles ur WHERE ur.user_id = p.id), '{}'::text[]) roles,
           (SELECT c.id FROM public.customers c
             WHERE lower(coalesce(c.email,'')) = lower(coalesce(p.email,''))
             LIMIT 1) linked_customer_id,
           0::bigint linked_visitors
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
  ),
  cust_src AS (
    SELECT 'customer'::text, ('customer:'||c.id::text),
           c.email, c.name,
           c.whatsapp, NULL::inet,
           c.created_at, NULL::timestamptz, NULL::timestamptz,
           '{}'::text[],
           c.id, 0::bigint
      FROM public.customers c
      WHERE NOT EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE lower(coalesce(p.email,'')) = lower(coalesce(c.email,''))
           AND coalesce(c.email,'') <> ''
      )
  ),
  combined AS (
    SELECT * FROM auth_src
    UNION ALL SELECT * FROM cust_src
  )
  SELECT
    t.source, t.user_id, t.email, t.full_name, t.whatsapp,
    host(t.last_ip) AS last_ip,
    t.created_at, t.last_sign_in_at, t.email_confirmed_at, t.roles,
    t.linked_customer_id, t.linked_visitors,
    (CASE WHEN 'admin' = ANY(t.roles) THEN 3
          WHEN 'editor' = ANY(t.roles) THEN 2
          WHEN coalesce(array_length(t.roles,1),0) > 0 THEN 1
          ELSE 0 END) AS role_rank
  FROM combined t
  WHERE
    (v_search IS NULL OR
       lower(coalesce(t.email,''))     LIKE '%'||lower(v_search)||'%' OR
       lower(coalesce(t.full_name,'')) LIKE '%'||lower(v_search)||'%' OR
       lower(coalesce(t.whatsapp,''))  LIKE '%'||lower(v_search)||'%')
    AND (v_src IS NULL OR t.source = v_src)
    AND (v_wa  IS NULL OR regexp_replace(coalesce(t.whatsapp,''),'\D','','g') LIKE '%'||v_wa||'%')
    AND (
      v_role IS NULL OR
      (v_role = 'none'  AND coalesce(array_length(t.roles,1),0) = 0 AND t.source = 'auth') OR
      (v_role <> 'none' AND v_role = ANY(t.roles))
    );

  SELECT count(*) INTO v_total FROM tmp_users_pag;

  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(x) - ''role_rank''), ''[]''::jsonb)
       FROM (SELECT * FROM tmp_users_pag ORDER BY %s LIMIT $1 OFFSET $2) x',
     v_order)
  INTO v_rows USING _limit, _offset;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $_$;


ALTER FUNCTION "public"."list_all_users_paginated"("_search" "text", "_role" "text", "_source" "text", "_whatsapp" "text", "_ip" "text", "_sort_key" "text", "_sort_dir" "text", "_limit" integer, "_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_contact_migration_audit"("_search" "text" DEFAULT NULL::"text", "_status" "text" DEFAULT NULL::"text", "_kind" "text" DEFAULT NULL::"text", "_limit" integer DEFAULT 100, "_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_search text := nullif(trim(coalesce(_search,'')),'');
  v_status text := nullif(_status,'all');
  v_kind   text := nullif(_kind,'all');
  v_total  bigint;
  v_rows   jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _limit IS NULL OR _limit <= 0 OR _limit > 500 THEN _limit := 100; END IF;
  IF _offset IS NULL OR _offset < 0 THEN _offset := 0; END IF;

  WITH base AS (
    SELECT * FROM public.contact_migration_audit a
     WHERE (v_status IS NULL OR a.status = v_status)
       AND (v_kind   IS NULL OR a.source_kind = v_kind)
       AND (v_search IS NULL OR
            lower(coalesce(a.target_email,''))   LIKE '%'||lower(v_search)||'%' OR
            lower(coalesce(a.target_whatsapp,'')) LIKE '%'||lower(v_search)||'%' OR
            lower(coalesce(a.message,''))        LIKE '%'||lower(v_search)||'%' OR
            lower(coalesce(a.performed_by_email,'')) LIKE '%'||lower(v_search)||'%')
  )
  SELECT count(*) INTO v_total FROM base;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (SELECT * FROM base ORDER BY created_at DESC LIMIT _limit OFFSET _offset) x;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $$;


ALTER FUNCTION "public"."list_contact_migration_audit"("_search" "text", "_status" "text", "_kind" "text", "_limit" integer, "_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_cron_jobs"() RETURNS TABLE("jobid" bigint, "jobname" "text", "schedule" "text", "command" "text", "active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT j.jobid, j.jobname::text, j.schedule::text, j.command::text, j.active
    FROM cron.job j
    ORDER BY j.jobid;
END;
$$;


ALTER FUNCTION "public"."list_cron_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_cron_runs"("p_limit" integer DEFAULT 50) RETURNS TABLE("jobid" bigint, "runid" bigint, "job_pid" integer, "database" "text", "username" "text", "command" "text", "status" "text", "return_message" "text", "start_time" timestamp with time zone, "end_time" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'cron'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT r.jobid, r.runid, r.job_pid, r.database::text, r.username::text,
           r.command::text, r.status::text, r.return_message::text,
           r.start_time, r.end_time
    FROM cron.job_run_details r
    ORDER BY r.start_time DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$$;


ALTER FUNCTION "public"."list_cron_runs"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_user_audit"("_email" "text", "_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "_status" "text" DEFAULT NULL::"text", "_limit" integer DEFAULT 100, "_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_status text := nullif(_status,'all');
  v_total  bigint;
  v_rows   jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _limit IS NULL OR _limit <= 0 OR _limit > 1000 THEN _limit := 100; END IF;
  IF _offset IS NULL OR _offset < 0 THEN _offset := 0; END IF;
  IF coalesce(trim(_email),'') = '' THEN
    RETURN jsonb_build_object('total',0,'rows','[]'::jsonb);
  END IF;

  SELECT count(*) INTO v_total
    FROM public.role_promotion_audit r
   WHERE lower(r.target_email) = lower(_email)
     AND (_from   IS NULL OR r.created_at >= _from)
     AND (_to     IS NULL OR r.created_at <= _to)
     AND (v_status IS NULL OR r.status = v_status);

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY (x->>'created_at') DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT id, promoted_by_email, target_email, role, status, message, created_at
        FROM public.role_promotion_audit r
       WHERE lower(r.target_email) = lower(_email)
         AND (_from   IS NULL OR r.created_at >= _from)
         AND (_to     IS NULL OR r.created_at <= _to)
         AND (v_status IS NULL OR r.status = v_status)
       ORDER BY r.created_at DESC
       LIMIT _limit OFFSET _offset
    ) x;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $$;


ALTER FUNCTION "public"."list_user_audit"("_email" "text", "_from" timestamp with time zone, "_to" timestamp with time zone, "_status" "text", "_limit" integer, "_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_search"("_q" "text", "_result_count" integer, "_suggestion" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_norm   text;
  v_recent int;
BEGIN
  v_norm := trim(regexp_replace(lower(public.unaccent(coalesce(_q, ''))), '\s+', ' ', 'g'));
  IF v_norm = '' OR length(v_norm) < 2 THEN RETURN; END IF;

  SELECT count(*) INTO v_recent
    FROM public.search_query_log
   WHERE created_at > now() - interval '1 minute';
  IF v_recent > 1000 THEN RETURN; END IF;  -- circuit-breaker silencioso

  INSERT INTO public.search_query_log (term_raw, term_normalized, result_count, suggestion)
  VALUES (
    left(coalesce(_q,''), 200),
    left(v_norm, 200),
    greatest(coalesce(_result_count, 0), 0),
    nullif(_suggestion, '')
  );
END;
$$;


ALTER FUNCTION "public"."log_search"("_q" "text", "_result_count" integer, "_suggestion" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_search_config_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_email text;
BEGIN
  BEGIN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  INSERT INTO public.search_audit_log (entity, entity_id, action, actor_id, actor_email, before, after)
  VALUES (
    TG_TABLE_NAME,
    COALESCE((to_jsonb(NEW)->>'id')::uuid, (to_jsonb(OLD)->>'id')::uuid),
    lower(TG_OP),
    auth.uid(),
    v_email,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_search_config_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_sitemap_dirty"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.store_settings (key, value, updated_at)
  VALUES (
    'sitemap_dirty',
    jsonb_build_object('dirty', true, 'marked_at', now(), 'source', TG_TABLE_NAME),
    now()
  )
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object('dirty', true, 'marked_at', now(), 'source', TG_TABLE_NAME),
        updated_at = now();
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."mark_sitemap_dirty"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_visitor_as_lead"("_visitor_id" "uuid", "_trigger" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_row public.visitors%ROWTYPE;
BEGIN
  IF _visitor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_visitor_id');
  END IF;

  SELECT * INTO v_row FROM public.visitors WHERE visitor_id::text = _visitor_id::text;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'visitor_not_found');
  END IF;
  IF v_row.is_bot THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bot_ignored');
  END IF;

  -- Idempotência: já é lead/customer => no-op.
  IF v_row.lead_status IN ('customer','lead') THEN
    RETURN jsonb_build_object('ok', true, 'noop', true, 'status', v_row.lead_status);
  END IF;

  -- Janela de cooldown: se foi marcado nos últimos 30s pelo mesmo trigger, no-op silencioso.
  IF v_row.lead_promoted_at IS NOT NULL
     AND v_row.lead_promoted_at > now() - interval '30 seconds'
     AND coalesce(v_row.lead_trigger,'') = coalesce(_trigger,'') THEN
    RETURN jsonb_build_object('ok', true, 'noop', true, 'reason', 'cooldown');
  END IF;

  UPDATE public.visitors
     SET lead_status = 'lead',
         lead_promoted_at = COALESCE(lead_promoted_at, now()),
         lead_trigger = COALESCE(_trigger, 'unknown')
   WHERE visitor_id::text = _visitor_id::text;

  RETURN jsonb_build_object('ok', true, 'status', 'lead', 'trigger', _trigger);
END $$;


ALTER FUNCTION "public"."mark_visitor_as_lead"("_visitor_id" "uuid", "_trigger" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."media_gc_candidates"("_min_age_days" integer DEFAULT 7) RETURNS TABLE("img_ref" "text", "bucket" "text", "storage_path" "text", "backed_up_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT img_ref, bucket, storage_path, backed_up_at
  FROM public.media_assets
  WHERE status = 'archived'
    AND backed_up_at IS NOT NULL
    AND checksum_sha256 IS NOT NULL
    AND last_verified_at < now() - make_interval(days => greatest(_min_age_days, 1))
$$;


ALTER FUNCTION "public"."media_gc_candidates"("_min_age_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."media_relink_references"("_img_refs" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_updated int := 0;
  v_tmp int;
BEGIN
  -- occasions.image_url
  UPDATE public.occasions o
     SET image_url = m.public_url, image_ref = m.img_ref
    FROM public.media_assets m
   WHERE m.entity_type = 'occasion' AND m.field = 'image_url'
     AND m.entity_id = o.id::text AND m.status = 'active'
     AND (_img_refs IS NULL OR m.img_ref = ANY(_img_refs));
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_updated := v_updated + v_tmp;

  -- hero_slides (3 campos distintos -> 3 linhas no catálogo)
  UPDATE public.hero_slides h
     SET image_url = m.public_url
    FROM public.media_assets m
   WHERE m.entity_type = 'hero_slide' AND m.field = 'image_url'
     AND m.entity_id = h.id::text AND m.status = 'active'
     AND (_img_refs IS NULL OR m.img_ref = ANY(_img_refs));
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_updated := v_updated + v_tmp;

  UPDATE public.hero_slides h
     SET image_desktop_url = m.public_url, image_ref = m.img_ref
    FROM public.media_assets m
   WHERE m.entity_type = 'hero_slide' AND m.field = 'image_desktop_url'
     AND m.entity_id = h.id::text AND m.status = 'active'
     AND (_img_refs IS NULL OR m.img_ref = ANY(_img_refs));
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_updated := v_updated + v_tmp;

  UPDATE public.hero_slides h
     SET image_mobile_url = m.public_url
    FROM public.media_assets m
   WHERE m.entity_type = 'hero_slide' AND m.field = 'image_mobile_url'
     AND m.entity_id = h.id::text AND m.status = 'active'
     AND (_img_refs IS NULL OR m.img_ref = ANY(_img_refs));
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_updated := v_updated + v_tmp;

  -- categories / kits / segments
  UPDATE public.categories c
     SET image_url = m.public_url, image_ref = m.img_ref
    FROM public.media_assets m
   WHERE m.entity_type = 'category' AND m.field = 'image_url'
     AND m.entity_id = c.id::text AND m.status = 'active'
     AND (_img_refs IS NULL OR m.img_ref = ANY(_img_refs));
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_updated := v_updated + v_tmp;

  UPDATE public.kits k
     SET image_url = m.public_url, image_ref = m.img_ref
    FROM public.media_assets m
   WHERE m.entity_type = 'kit' AND m.field = 'image_url'
     AND m.entity_id = k.id::text AND m.status = 'active'
     AND (_img_refs IS NULL OR m.img_ref = ANY(_img_refs));
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_updated := v_updated + v_tmp;

  UPDATE public.segments s
     SET image_url = m.public_url, image_ref = m.img_ref
    FROM public.media_assets m
   WHERE m.entity_type = 'segment' AND m.field = 'image_url'
     AND m.entity_id = s.id::text AND m.status = 'active'
     AND (_img_refs IS NULL OR m.img_ref = ANY(_img_refs));
  GET DIAGNOSTICS v_tmp = ROW_COUNT; v_updated := v_updated + v_tmp;

  RETURN jsonb_build_object('ok', true, 'updated', v_updated);
END;
$$;


ALTER FUNCTION "public"."media_relink_references"("_img_refs" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_customer_to_user_link"("_customer_id" "uuid", "_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email  text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = _user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'usuário sem e-mail'; END IF;

  UPDATE public.customers SET email = v_email, updated_at = now() WHERE id = _customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cliente não encontrado'; END IF;

  RETURN jsonb_build_object('success',true,'email',v_email);
END $$;


ALTER FUNCTION "public"."migrate_customer_to_user_link"("_customer_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_visitor_to_customer"("_visitor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v record;
  v_existing uuid;
  v_new_id uuid;
  v_name text;
  v_notes text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller,'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller;

  SELECT * INTO v FROM public.visitors WHERE id = _visitor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'visitor não encontrado'; END IF;

  IF coalesce(trim(v.whatsapp_phone),'') <> '' THEN
    SELECT id INTO v_existing FROM public.customers
      WHERE regexp_replace(coalesce(whatsapp,''),'\D','','g')
          = regexp_replace(v.whatsapp_phone,'\D','','g')
      LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE public.visitors SET customer_id = v_existing WHERE id = _visitor_id;
    INSERT INTO public.contact_migration_audit
      (source_kind, source_id, target_customer_id, target_whatsapp, status, message, performed_by, performed_by_email)
    VALUES ('visitor', _visitor_id::text, v_existing, v.whatsapp_phone, 'linked',
            'Visitante vinculado a cliente existente', v_caller, v_caller_email);
    RETURN jsonb_build_object('success',true,'customer_id',v_existing,'created',false);
  END IF;

  v_name := coalesce(nullif(trim(v.whatsapp_phone),''), 'Visitante ' || left(v.id::text,8));
  v_notes := concat_ws(E'\n',
    'Migrado de visitante ' || v.id,
    CASE WHEN v.ip IS NOT NULL THEN 'IP: ' || host(v.ip) END,
    CASE WHEN v.ip_city IS NOT NULL THEN 'Origem IP: '||v.ip_city||'/'||coalesce(v.ip_region,'')||' '||coalesce(v.ip_country,'') END
  );

  INSERT INTO public.customers (name, whatsapp, city, state, source, status, notes, created_by)
  VALUES (v_name, v.whatsapp_phone, v.ip_city, v.ip_region, 'visitante', 'lead', v_notes, v_caller)
  RETURNING id INTO v_new_id;

  UPDATE public.visitors SET customer_id = v_new_id WHERE id = _visitor_id;

  INSERT INTO public.contact_migration_audit
    (source_kind, source_id, target_customer_id, target_whatsapp, status, message, performed_by, performed_by_email)
  VALUES ('visitor', _visitor_id::text, v_new_id, v.whatsapp_phone, 'success',
          'Cliente criado a partir de visitante', v_caller, v_caller_email);

  RETURN jsonb_build_object('success',true,'customer_id',v_new_id,'created',true);
END $$;


ALTER FUNCTION "public"."migrate_visitor_to_customer"("_visitor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone_digits"("_v" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT NULLIF(regexp_replace(coalesce(_v,''), '\D', '', 'g'), '')
$$;


ALTER FUNCTION "public"."normalize_phone_digits"("_v" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_search"("_s" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT lower(public.unaccent('unaccent', coalesce(_s, '')))
$$;


ALTER FUNCTION "public"."normalize_search"("_s" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_slug"("_s" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $_$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               lower(public.unaccent('unaccent', coalesce(_s, ''))),
               '[^a-z0-9]+', '-', 'g'
             ),
             '-{2,}', '-', 'g'
           ),
           '(^-+|-+$)', '', 'g'
         )
$_$;


ALTER FUNCTION "public"."normalize_slug"("_s" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_admins_on_access_request"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_url    text;
  v_anon   text;
  v_email  text;
  v_secret text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.user_id;
  SELECT value INTO v_secret FROM public.internal_function_secrets WHERE name = 'notify_admins';

  BEGIN
    v_url  := current_setting('app.supabase_url', true);
    v_anon := current_setting('app.supabase_anon_key', true);
    IF v_url IS NOT NULL AND v_anon IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/notify-admins-new-request',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || v_anon,
          'x-internal-secret', coalesce(v_secret, '')
        ),
        body    := jsonb_build_object(
          'user_id',      NEW.user_id,
          'email',        coalesce(v_email, NEW.user_email_snapshot),
          'requested_at', NEW.requested_at,
          'request_id',   NEW.id
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_admins_on_access_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_order_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_secret FROM public.internal_function_secrets WHERE name = 'notify_order_status';
  IF v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://xfqffqxqiuqauefrrcxn.supabase.co/functions/v1/notify-order-status',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-key', v_secret),
    body := jsonb_build_object(
      'order_code', NEW.order_code,
      'status', NEW.status,
      'previous_status', OLD.status
    )
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_order_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_email text;
  v_url text;
  v_anon text;
BEGIN
  IF NEW.role <> 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.user_id;

  -- Best-effort: invoke notify-role-change edge function via pg_net if available.
  -- Failures are swallowed so role insertion never fails because of mail.
  BEGIN
    v_url := current_setting('app.supabase_url', true);
    v_anon := current_setting('app.supabase_anon_key', true);
    IF v_url IS NOT NULL AND v_anon IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url || '/functions/v1/notify-role-change',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || v_anon
        ),
        body := jsonb_build_object(
          'user_id', NEW.user_id,
          'email', v_email,
          'role', NEW.role::text,
          'event', 'role_granted'
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- ignore: notification is best-effort
    NULL;
  END;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."operational_worker_headers"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE secret text; BEGIN INSERT INTO public.operational_worker_credentials(id) VALUES(true) ON CONFLICT DO NOTHING; SELECT token INTO secret FROM public.operational_worker_credentials WHERE id=true; RETURN jsonb_build_object('Content-Type','application/json','x-operational-secret',secret); END; $$;


ALTER FUNCTION "public"."operational_worker_headers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pdp_badge_stats"("_from" timestamp with time zone DEFAULT ("now"() - '30 days'::interval), "_to" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_impressions int;
  v_clicks int;
  v_top_products jsonb;
  v_by_tone jsonb;
  v_by_position jsonb;
  v_by_source jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*)::int INTO v_impressions
    FROM public.pdp_badge_events
   WHERE event_name = 'impression' AND created_at >= _from AND created_at <= _to;

  SELECT count(*)::int INTO v_clicks
    FROM public.pdp_badge_events
   WHERE event_name = 'click' AND created_at >= _from AND created_at <= _to;

  SELECT coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_top_products
  FROM (
    SELECT product_slug,
           count(*) FILTER (WHERE event_name='impression')::int AS impressions,
           count(*) FILTER (WHERE event_name='click')::int      AS clicks
      FROM public.pdp_badge_events
     WHERE product_slug IS NOT NULL
       AND created_at >= _from AND created_at <= _to
     GROUP BY product_slug
     ORDER BY count(*) FILTER (WHERE event_name='click') DESC, count(*) DESC
     LIMIT 10
  ) p;

  SELECT coalesce(jsonb_object_agg(tone, c), '{}'::jsonb) INTO v_by_tone
  FROM (
    SELECT coalesce(tone,'(none)') AS tone, count(*)::int AS c
      FROM public.pdp_badge_events
     WHERE event_name = 'click' AND created_at >= _from AND created_at <= _to
     GROUP BY tone
  ) t;

  SELECT coalesce(jsonb_object_agg(position, c), '{}'::jsonb) INTO v_by_position
  FROM (
    SELECT coalesce(position,'(none)') AS position, count(*)::int AS c
      FROM public.pdp_badge_events
     WHERE event_name = 'click' AND created_at >= _from AND created_at <= _to
     GROUP BY position
  ) t;

  SELECT coalesce(jsonb_object_agg(source, c), '{}'::jsonb) INTO v_by_source
  FROM (
    SELECT source, count(*)::int AS c
      FROM public.pdp_badge_events
     WHERE event_name = 'click' AND created_at >= _from AND created_at <= _to
     GROUP BY source
  ) t;

  RETURN jsonb_build_object(
    'from', _from,
    'to', _to,
    'impressions', v_impressions,
    'clicks', v_clicks,
    'ctr', CASE WHEN v_impressions > 0 THEN round((v_clicks::numeric / v_impressions::numeric) * 100, 2) ELSE 0 END,
    'top_products', v_top_products,
    'by_tone', v_by_tone,
    'by_position', v_by_position,
    'by_source', v_by_source
  );
END;
$$;


ALTER FUNCTION "public"."pdp_badge_stats"("_from" timestamp with time zone, "_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pdp_funnel_stats"("_from" timestamp with time zone DEFAULT ("now"() - '7 days'::interval), "_to" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_counts jsonb;
  v_by_source jsonb;
  v_by_block_rule jsonb;
  v_top_products jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(jsonb_object_agg(event_name, c), '{}'::jsonb)
    INTO v_counts
  FROM (
    SELECT event_name, count(*)::int AS c
      FROM public.pdp_funnel_events
     WHERE created_at >= _from AND created_at <= _to
     GROUP BY event_name
  ) t;

  SELECT coalesce(jsonb_object_agg(source, c), '{}'::jsonb)
    INTO v_by_source
  FROM (
    SELECT coalesce(source,'(none)') AS source, count(*)::int AS c
      FROM public.pdp_funnel_events
     WHERE event_name = 'pdp_whatsapp_click'
       AND created_at >= _from AND created_at <= _to
     GROUP BY source
  ) t;

  SELECT coalesce(jsonb_object_agg(rule, c), '{}'::jsonb)
    INTO v_by_block_rule
  FROM (
    SELECT coalesce(meta->>'rule','(unknown)') AS rule, count(*)::int AS c
      FROM public.pdp_funnel_events
     WHERE event_name = 'exit_popup_blocked'
       AND created_at >= _from AND created_at <= _to
     GROUP BY rule
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_top_products
  FROM (
    SELECT product_slug, count(*)::int AS clicks
      FROM public.pdp_funnel_events
     WHERE event_name = 'pdp_whatsapp_click'
       AND product_slug IS NOT NULL
       AND created_at >= _from AND created_at <= _to
     GROUP BY product_slug
     ORDER BY clicks DESC
     LIMIT 10
  ) p;

  RETURN jsonb_build_object(
    'from', _from,
    'to', _to,
    'counts', v_counts,
    'by_source', v_by_source,
    'blocked_by_rule', v_by_block_rule,
    'top_products', v_top_products
  );
END;
$$;


ALTER FUNCTION "public"."pdp_funnel_stats"("_from" timestamp with time zone, "_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."product_slugs_normalize"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.slug := lower(trim(coalesce(NEW.slug,'')));
  NEW.slug_normalized := public.normalize_slug(NEW.slug);

  IF NEW.slug_normalized IS NULL OR length(NEW.slug_normalized) = 0 THEN
    RAISE EXCEPTION 'Slug vazio ou inválido após normalização.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = NEW.slug_normalized) THEN
    RAISE EXCEPTION 'Slug "%" é reservado pelo sistema.', NEW.slug_normalized
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."product_slugs_normalize"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."products_refresh_search_text"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.search_text := public.normalize_search(
    concat_ws(' ',
      NEW.name,
      NEW.description,
      NEW.long_description,
      array_to_string(coalesce(NEW.keywords, '{}'::text[]), ' ')
    )
  );
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."products_refresh_search_text"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promote_user_to_admin"("_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_target_id uuid;
  v_already boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem promover usuários';
  END IF;

  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller;
  SELECT id INTO v_target_id FROM public.profiles WHERE lower(email) = lower(_email) LIMIT 1;

  IF v_target_id IS NULL THEN
    INSERT INTO public.role_promotion_audit
      (promoted_by, promoted_by_email, target_email, role, status, message)
    VALUES (v_caller, v_caller_email, _email, 'admin', 'error',
            'Usuário não encontrado. Peça que ele faça login pelo menos uma vez.');
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado. Peça para ele fazer login uma vez antes.');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_target_id AND role = 'admin')
    INTO v_already;

  -- Marca pendente como approved (se houver)
  UPDATE public.admin_access_requests
     SET status = 'approved',
         reviewed_at = now(),
         reviewed_by = v_caller,
         reviewed_by_email = v_caller_email,
         updated_at = now()
   WHERE user_id = v_target_id AND status = 'pending';

  IF v_already THEN
    INSERT INTO public.role_promotion_audit
      (promoted_by, promoted_by_email, target_user_id, target_email, role, status, message)
    VALUES (v_caller, v_caller_email, v_target_id, _email, 'admin', 'noop', 'Usuário já era admin.');
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_target_id, 'admin');

  INSERT INTO public.role_promotion_audit
    (promoted_by, promoted_by_email, target_user_id, target_email, role, status, message)
  VALUES (v_caller, v_caller_email, v_target_id, _email, 'admin', 'success', NULL);

  RETURN jsonb_build_object('success', true, 'user_id', v_target_id);
END;
$$;


ALTER FUNCTION "public"."promote_user_to_admin"("_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebuild_media_inventory"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN public.rebuild_media_inventory_internal();
END;
$$;


ALTER FUNCTION "public"."rebuild_media_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebuild_media_inventory_internal"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage', 'pg_catalog'
    AS $$
DECLARE
  v_base      text := 'https://xfqffqxqiuqauefrrcxn.supabase.co/storage/v1/object/public/';
  v_active    int; v_archived int; v_missing int; v_total int;
BEGIN
  CREATE TEMP TABLE _refs ON COMMIT DROP AS
  WITH refs AS (
    SELECT 'product'::text et, p.id::text eid, 'images'::text fld, img AS url
      FROM public.products p, unnest(p.images) img WHERE img IS NOT NULL
    UNION ALL SELECT 'occasion', o.id::text, 'image_url', o.image_url FROM public.occasions o WHERE o.image_url IS NOT NULL
    UNION ALL SELECT 'category', c.id::text, 'image_url', c.image_url FROM public.categories c WHERE c.image_url IS NOT NULL
    UNION ALL SELECT 'hero_slide', h.id::text, 'image_url', h.image_url FROM public.hero_slides h WHERE h.image_url IS NOT NULL
    UNION ALL SELECT 'hero_slide', h.id::text, 'image_desktop_url', h.image_desktop_url FROM public.hero_slides h WHERE h.image_desktop_url IS NOT NULL
    UNION ALL SELECT 'hero_slide', h.id::text, 'image_mobile_url', h.image_mobile_url FROM public.hero_slides h WHERE h.image_mobile_url IS NOT NULL
    UNION ALL SELECT 'kit', k.id::text, 'image_url', k.image_url FROM public.kits k WHERE k.image_url IS NOT NULL
    UNION ALL SELECT 'segment', s.id::text, 'image_url', s.image_url FROM public.segments s WHERE s.image_url IS NOT NULL
    UNION ALL SELECT 'collection', cl.id::text, 'image_url', cl.image_url FROM public.collections cl WHERE cl.image_url IS NOT NULL
    UNION ALL SELECT 'homepage_block', hb.id::text, 'image_url', hb.image_url FROM public.homepage_blocks hb WHERE hb.image_url IS NOT NULL
    UNION ALL SELECT 'blog_post', bp.id::text, 'cover_image', bp.cover_image FROM public.blog_posts bp WHERE bp.cover_image IS NOT NULL
    UNION ALL SELECT 'theme_hub', th.id::text, 'hero_image_url', th.hero_image_url FROM public.theme_hubs th WHERE th.hero_image_url IS NOT NULL
    UNION ALL SELECT 'product_review', pr.id::text, 'images', img FROM public.product_reviews pr, unnest(pr.images) img WHERE img IS NOT NULL
  )
  SELECT et, eid, fld, url,
    (regexp_match(url, '/storage/v1/object/(?:public|sign)/([^/?]+)/([^?]+)'))[1] AS bucket,
    (regexp_match(url, '/storage/v1/object/(?:public|sign)/([^/?]+)/([^?]+)'))[2] AS path
  FROM refs WHERE url ~ '/storage/v1/object/';

  INSERT INTO public.media_assets AS m
    (img_ref, bucket, storage_path, public_url, content_type, size_bytes,
     entity_type, entity_id, field, ref_count, source, status, last_verified_at)
  SELECT public.gen_img_ref(coalesce(r.et,'file'), o.name), o.bucket_id, o.name,
    v_base || o.bucket_id || '/' || o.name,
    o.metadata->>'mimetype', nullif(o.metadata->>'size','')::bigint,
    r.et, r.eid, r.fld, coalesce(r.cnt,0), 'storage',
    CASE WHEN r.et IS NOT NULL THEN 'active' ELSE 'archived' END, now()
  FROM storage.objects o
  LEFT JOIN LATERAL (SELECT rr.et, rr.eid, rr.fld, count(*) OVER () cnt FROM _refs rr WHERE rr.bucket=o.bucket_id AND rr.path=o.name LIMIT 1) r ON true
  WHERE o.name IS NOT NULL AND o.name <> ''
  ON CONFLICT (bucket, storage_path) DO UPDATE SET
    public_url=excluded.public_url, content_type=excluded.content_type, size_bytes=excluded.size_bytes,
    entity_type=coalesce(excluded.entity_type,m.entity_type), entity_id=coalesce(excluded.entity_id,m.entity_id),
    field=coalesce(excluded.field,m.field), ref_count=excluded.ref_count, source='storage',
    status=CASE WHEN excluded.entity_type IS NOT NULL THEN 'active' ELSE 'archived' END,
    last_verified_at=now(), updated_at=now();

  INSERT INTO public.media_assets AS m
    (img_ref, bucket, storage_path, public_url, entity_type, entity_id, field, source, status, last_verified_at)
  SELECT DISTINCT ON (r.bucket, r.path)
    public.gen_img_ref(coalesce(r.et,'file'), r.path), r.bucket, r.path, r.url, r.et, r.eid, r.fld, 'storage','missing', now()
  FROM _refs r LEFT JOIN storage.objects o ON o.bucket_id=r.bucket AND o.name=r.path
  WHERE o.id IS NULL AND r.bucket IS NOT NULL
  ORDER BY r.bucket, r.path
  ON CONFLICT (bucket, storage_path) DO UPDATE SET status='missing', last_verified_at=now(), updated_at=now();

  SELECT count(*) FILTER (WHERE status='active'), count(*) FILTER (WHERE status='archived'),
         count(*) FILTER (WHERE status='missing'), count(*)
    INTO v_active, v_archived, v_missing, v_total FROM public.media_assets;

  RETURN jsonb_build_object('ok',true,'total',v_total,'active',v_active,'archived',v_archived,'missing',v_missing,'ran_at',now());
END;
$$;


ALTER FUNCTION "public"."rebuild_media_inventory_internal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_coupon_use"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  c record;
  v_discount numeric;
BEGIN
  IF NEW.coupon_code IS NULL OR length(trim(NEW.coupon_code)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(NEW.coupon_code) LIMIT 1;
  IF NOT FOUND OR NOT c.is_active THEN
    RETURN NEW;
  END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN NEW;
  END IF;

  v_discount := COALESCE(NEW.discount_amount, 0);

  INSERT INTO public.coupon_uses (coupon_id, order_id, subtotal, discount_applied)
  VALUES (c.id, NEW.id, NEW.subtotal, v_discount);

  UPDATE public.coupons SET used_count = used_count + 1, updated_at = now() WHERE id = c.id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."record_coupon_use"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_product_slug_hit"("_slug" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.product_slugs
     SET hit_count = hit_count + 1, last_hit_at = now()
   WHERE slug_normalized = public.normalize_slug(_slug)
$$;


ALTER FUNCTION "public"."record_product_slug_hit"("_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_admin_audit_timeline"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem atualizar a auditoria';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_audit_timeline;
  RETURN jsonb_build_object('success', true, 'refreshed_at', now());
EXCEPTION WHEN OTHERS THEN
  -- Fallback to non-concurrent refresh if concurrent fails (e.g. first run)
  REFRESH MATERIALIZED VIEW public.admin_audit_timeline;
  RETURN jsonb_build_object('success', true, 'refreshed_at', now(), 'mode', 'non_concurrent');
END $$;


ALTER FUNCTION "public"."refresh_admin_audit_timeline"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_admin_request"("_user_id" "uuid", "_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_target_email text;
  v_updated int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem reprovar solicitações';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Informe um motivo de pelo menos 3 caracteres';
  END IF;

  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller;
  SELECT email INTO v_target_email FROM public.profiles WHERE id = _user_id;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  UPDATE public.admin_access_requests
     SET status = 'denied',
         reviewed_at = now(),
         reviewed_by = v_caller,
         reviewed_by_email = v_caller_email,
         rejection_reason = trim(_reason),
         updated_at = now()
   WHERE user_id = _user_id AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.role_promotion_audit
    (promoted_by, promoted_by_email, target_user_id, target_email, role, status, message)
  VALUES (v_caller, v_caller_email, _user_id, v_target_email, 'admin', 'rejected',
          'Solicitação reprovada. Motivo: ' || trim(_reason));

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;


ALTER FUNCTION "public"."reject_admin_request"("_user_id" "uuid", "_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_admin_access"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_already_admin boolean;
  v_pending_id uuid;
  v_last timestamptz;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'admin')
    INTO v_already_admin;
  IF v_already_admin THEN
    RETURN jsonb_build_object('success', true, 'already_admin', true);
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;

  SELECT id INTO v_pending_id
    FROM public.admin_access_requests
   WHERE user_id = v_uid AND status = 'pending'
   LIMIT 1;
  IF v_pending_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sua solicitação ainda está em análise pela administração.'
      USING ERRCODE = '23505', HINT = 'pending';
  END IF;

  SELECT max(requested_at) INTO v_last
    FROM public.admin_access_requests
   WHERE user_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Você já solicitou acesso recentemente. Tente novamente em 24 horas.'
      USING ERRCODE = '23505', HINT = 'rate_limited';
  END IF;

  INSERT INTO public.admin_access_requests (user_id, status, requested_at, user_email_snapshot)
  VALUES (v_uid, 'pending', now(), v_email)
  RETURNING id INTO v_new_id;

  INSERT INTO public.role_promotion_audit
    (promoted_by, promoted_by_email, target_user_id, target_email, role, status, message)
  VALUES (v_uid, v_email, v_uid, v_email, 'admin', 'requested',
          'Solicitação de acesso registrada (request_id=' || v_new_id || ').');

  RETURN jsonb_build_object('success', true, 'request_id', v_new_id, 'requested_at', now());
END;
$$;


ALTER FUNCTION "public"."request_admin_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_product_slug"("_slug" "text") RETURNS TABLE("product_id" "uuid", "matched_slug" "text", "primary_slug" "text", "is_primary" boolean, "is_active" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH hit AS (
    SELECT ps.product_id, ps.slug AS matched, ps.is_primary, ps.is_active
      FROM public.product_slugs ps
     WHERE ps.slug_normalized = public.normalize_slug(_slug)
     ORDER BY ps.is_primary DESC, ps.is_active DESC, ps.created_at ASC
     LIMIT 1
  )
  SELECT h.product_id,
         h.matched,
         (SELECT slug FROM public.product_slugs
            WHERE product_id = h.product_id AND is_primary
            ORDER BY updated_at DESC LIMIT 1),
         h.is_primary,
         h.is_active
    FROM hit h
$$;


ALTER FUNCTION "public"."resolve_product_slug"("_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retry_image_processing_job"("_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'editor')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF; UPDATE public.image_processing_jobs SET status='pending',attempts=0,error=NULL,processed_at=NULL WHERE id=_id AND status IN ('error','retry'); IF NOT FOUND THEN RAISE EXCEPTION 'Job is not eligible for retry'; END IF; END; $$;


ALTER FUNCTION "public"."retry_image_processing_job"("_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revert_product_version"("_version_id" "uuid", "_fields" "text"[] DEFAULT NULL::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_row  public.product_versions%ROWTYPE;
  v_snap jsonb;
  v_curr jsonb;
  v_key  text;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'editor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.product_versions WHERE id = _version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Versão não encontrada' USING ERRCODE = 'P0002'; END IF;

  SELECT to_jsonb(p) INTO v_curr FROM public.products p WHERE p.id = v_row.product_id;
  IF v_curr IS NULL THEN RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'P0002'; END IF;

  v_snap := v_curr;
  FOR v_key IN SELECT jsonb_object_keys(v_row.snapshot) LOOP
    IF v_key IN ('id','created_at','updated_at','search_text') THEN CONTINUE; END IF;
    IF _fields IS NOT NULL AND NOT (v_key = ANY(_fields)) THEN CONTINUE; END IF;
    v_snap := jsonb_set(v_snap, ARRAY[v_key], v_row.snapshot->v_key);
  END LOOP;

  UPDATE public.products SET
    name = v_snap->>'name',
    slug = v_snap->>'slug',
    description = v_snap->>'description',
    price = NULLIF(v_snap->>'price','')::numeric,
    images = ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_snap->'images','[]'::jsonb))),
    is_active = COALESCE((v_snap->>'is_active')::boolean, is_active),
    category_id = NULLIF(v_snap->>'category_id','')::uuid,
    updated_at = now()
  WHERE id = v_row.product_id;

  RETURN jsonb_build_object('ok', true, 'product_id', v_row.product_id, 'from_version', v_row.version);
END;
$$;


ALTER FUNCTION "public"."revert_product_version"("_version_id" "uuid", "_fields" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_product_full"("_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_is_admin     boolean;
  v_is_editor    boolean;
  v_id           uuid;
  v_expected     timestamptz;
  v_product      jsonb := coalesce(_payload->'product', '{}'::jsonb);
  v_occ_ids      uuid[] := COALESCE(ARRAY(SELECT (jsonb_array_elements_text(coalesce(_payload->'occasion_ids','[]'::jsonb)))::uuid), '{}'::uuid[]);
  v_tag_ids      uuid[] := COALESCE(ARRAY(SELECT (jsonb_array_elements_text(coalesce(_payload->'tag_ids','[]'::jsonb)))::uuid), '{}'::uuid[]);
  v_seg_ids      uuid[] := COALESCE(ARRAY(SELECT (jsonb_array_elements_text(coalesce(_payload->'segment_ids','[]'::jsonb)))::uuid), '{}'::uuid[]);
  v_row          public.products%ROWTYPE;
  v_req_ship     boolean;
  v_weight       numeric;
  v_len          numeric;
  v_wid          numeric;
  v_hei          numeric;
  v_pers_opts    jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  v_is_admin  := public.has_role(v_uid, 'admin');
  v_is_editor := public.has_role(v_uid, 'editor');
  IF NOT (v_is_admin OR v_is_editor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  IF coalesce(length(v_product->>'name'),0) = 0 THEN RAISE EXCEPTION 'Nome obrigatório' USING ERRCODE = '23514'; END IF;
  IF coalesce(length(v_product->>'slug'),0) = 0 THEN RAISE EXCEPTION 'Slug obrigatório' USING ERRCODE = '23514'; END IF;
  IF (v_product->>'price') IS NULL OR (v_product->>'price')::numeric < 0 THEN RAISE EXCEPTION 'Preço inválido' USING ERRCODE = '23514'; END IF;

  v_req_ship := COALESCE((v_product->>'requires_shipping')::boolean, true);
  v_weight   := NULLIF(v_product->>'weight','')::numeric;
  v_len      := NULLIF(v_product->>'length_cm','')::numeric;
  v_wid      := NULLIF(v_product->>'width_cm','')::numeric;
  v_hei      := NULLIF(v_product->>'height_cm','')::numeric;

  v_pers_opts := CASE
    WHEN jsonb_typeof(v_product->'personalization_options') = 'array'
      THEN v_product->'personalization_options'
    ELSE '[]'::jsonb
  END;

  IF v_req_ship THEN
    IF v_weight IS NULL OR v_weight <= 0
       OR v_len IS NULL OR v_len <= 0
       OR v_wid IS NULL OR v_wid <= 0
       OR v_hei IS NULL OR v_hei <= 0 THEN
      RAISE EXCEPTION 'Produtos com entrega física exigem peso e dimensões (>0)'
        USING ERRCODE = '23514', HINT = 'requires_shipping_dims';
    END IF;
  END IF;

  v_id       := NULLIF(_payload->>'id','')::uuid;
  v_expected := NULLIF(_payload->>'expected_updated_at','')::timestamptz;

  IF v_id IS NULL THEN
    INSERT INTO public.products (
      name, slug, description, long_description, price, original_price,
      min_quantity, pix_discount, production_days, weight, category_id,
      badge, rating, images, features, keywords, is_active,
      personalization_enabled, personalization_label, personalization_placeholder,
      personalization_options,
      google_product_category, editorial_content, featured_weight, production_speed,
      pdp_badge_override, show_quick_summary, show_min_quantity,
      length_cm, width_cm, height_cm, requires_shipping,
      external_ref
    ) VALUES (
      v_product->>'name',
      v_product->>'slug',
      NULLIF(v_product->>'description',''),
      NULLIF(v_product->>'long_description',''),
      (v_product->>'price')::numeric,
      NULLIF(v_product->>'original_price','')::numeric,
      COALESCE((v_product->>'min_quantity')::int, 1),
      COALESCE((v_product->>'pix_discount')::int, 7),
      COALESCE((v_product->>'production_days')::int, 7),
      v_weight,
      NULLIF(v_product->>'category_id','')::uuid,
      NULLIF(v_product->>'badge',''),
      COALESCE((v_product->>'rating')::numeric, 5.0),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_product->'images')), '{}'::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_product->'features')), '{}'::text[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_product->'keywords')), '{}'::text[]),
      COALESCE((v_product->>'is_active')::boolean, true),
      COALESCE((v_product->>'personalization_enabled')::boolean, true),
      NULLIF(v_product->>'personalization_label',''),
      NULLIF(v_product->>'personalization_placeholder',''),
      v_pers_opts,
      NULLIF(v_product->>'google_product_category',''),
      NULLIF(v_product->>'editorial_content',''),
      COALESCE((v_product->>'featured_weight')::int, 0),
      NULLIF(v_product->>'production_speed',''),
      CASE WHEN v_product ? 'pdp_badge_override' AND v_product->'pdp_badge_override' <> 'null'::jsonb
           THEN v_product->'pdp_badge_override' ELSE NULL END,
      COALESCE((v_product->>'show_quick_summary')::boolean, false),
      COALESCE((v_product->>'show_min_quantity')::boolean, false),
      v_len,
      v_wid,
      v_hei,
      v_req_ship,
      ''
    )
    RETURNING * INTO v_row;
  ELSE
    IF v_expected IS NULL THEN RAISE EXCEPTION 'expected_updated_at obrigatório em update' USING ERRCODE = '23514'; END IF;

    UPDATE public.products SET
      name                          = v_product->>'name',
      slug                          = v_product->>'slug',
      description                   = NULLIF(v_product->>'description',''),
      long_description              = NULLIF(v_product->>'long_description',''),
      price                         = (v_product->>'price')::numeric,
      original_price                = NULLIF(v_product->>'original_price','')::numeric,
      min_quantity                  = COALESCE((v_product->>'min_quantity')::int, 1),
      pix_discount                  = COALESCE((v_product->>'pix_discount')::int, 7),
      production_days               = COALESCE((v_product->>'production_days')::int, 7),
      weight                        = v_weight,
      category_id                   = NULLIF(v_product->>'category_id','')::uuid,
      badge                         = NULLIF(v_product->>'badge',''),
      rating                        = COALESCE((v_product->>'rating')::numeric, 5.0),
      images                        = COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_product->'images')), '{}'::text[]),
      features                      = COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_product->'features')), '{}'::text[]),
      keywords                      = COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_product->'keywords')), '{}'::text[]),
      is_active                     = COALESCE((v_product->>'is_active')::boolean, true),
      personalization_enabled       = COALESCE((v_product->>'personalization_enabled')::boolean, true),
      personalization_label         = NULLIF(v_product->>'personalization_label',''),
      personalization_placeholder   = NULLIF(v_product->>'personalization_placeholder',''),
      personalization_options       = v_pers_opts,
      google_product_category       = NULLIF(v_product->>'google_product_category',''),
      editorial_content             = NULLIF(v_product->>'editorial_content',''),
      featured_weight               = COALESCE((v_product->>'featured_weight')::int, 0),
      production_speed              = NULLIF(v_product->>'production_speed',''),
      pdp_badge_override            = CASE WHEN v_product ? 'pdp_badge_override' AND v_product->'pdp_badge_override' <> 'null'::jsonb
                                            THEN v_product->'pdp_badge_override' ELSE NULL END,
      show_quick_summary            = COALESCE((v_product->>'show_quick_summary')::boolean, false),
      show_min_quantity             = COALESCE((v_product->>'show_min_quantity')::boolean, false),
      length_cm                     = v_len,
      width_cm                      = v_wid,
      height_cm                     = v_hei,
      requires_shipping             = v_req_ship
    WHERE id = v_id
      AND updated_at = v_expected
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_id) THEN
        RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = '23503';
      END IF;
      RAISE EXCEPTION 'stale_version' USING ERRCODE = '40001', HINT = 'stale_version';
    END IF;
  END IF;

  DELETE FROM public.product_occasions WHERE product_id = v_row.id AND NOT (occasion_id = ANY(v_occ_ids));
  INSERT INTO public.product_occasions (product_id, occasion_id)
  SELECT v_row.id, x FROM unnest(v_occ_ids) x ON CONFLICT (product_id, occasion_id) DO NOTHING;

  DELETE FROM public.product_tags WHERE product_id = v_row.id AND NOT (tag_id = ANY(v_tag_ids));
  INSERT INTO public.product_tags (product_id, tag_id)
  SELECT v_row.id, x FROM unnest(v_tag_ids) x ON CONFLICT (product_id, tag_id) DO NOTHING;

  DELETE FROM public.product_segments WHERE product_id = v_row.id AND NOT (segment_id = ANY(v_seg_ids));
  INSERT INTO public.product_segments (product_id, segment_id)
  SELECT v_row.id, x FROM unnest(v_seg_ids) x ON CONFLICT (product_id, segment_id) DO NOTHING;

  RETURN jsonb_build_object('id', v_row.id, 'slug', v_row.slug, 'updated_at', v_row.updated_at, 'row', to_jsonb(v_row));
END;
$$;


ALTER FUNCTION "public"."save_product_full"("_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_boosts_normalize"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
begin
  NEW.term := trim(coalesce(NEW.term,''));
  NEW.term_normalized := trim(regexp_replace(lower(public.unaccent(NEW.term)), '\s+', ' ', 'g'));
  if NEW.term_normalized = '' then
    raise exception 'Termo do boost não pode ser vazio.' using errcode='23514';
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."search_boosts_normalize"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_products"("_q" "text", "_limit" integer DEFAULT 24, "_category_id" "uuid" DEFAULT NULL::"uuid", "_min_price" numeric DEFAULT NULL::numeric, "_max_price" numeric DEFAULT NULL::numeric, "_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_q_raw      text := coalesce(_q, '');
  v_q          text;
  v_terms      text[];
  v_all        jsonb := '[]'::jsonb;
  v_ids        jsonb := '[]'::jsonb;
  v_boost_ids  uuid[];
  v_suggestion text;
  v_total      int := 0;
  v_result_cnt int := 0;
  v_source     text := 'none';
  v_tsq        tsquery;
  v_cap        int := 500;
BEGIN
  v_q := trim(regexp_replace(lower(public.unaccent(v_q_raw)), '\s+', ' ', 'g'));
  IF v_q = '' OR length(v_q) < 2 THEN
    RETURN jsonb_build_object('ids','[]'::jsonb,'suggestion',null,'source','empty','count',0,'total',0,'offset',0,'has_more',false);
  END IF;
  IF _limit IS NULL OR _limit <= 0 OR _limit > 200 THEN _limit := 24; END IF;
  IF _offset IS NULL OR _offset < 0 THEN _offset := 0; END IF;

  WITH syn AS (
    SELECT canonical_term, aliases
      FROM public.search_synonyms
     WHERE coalesce(active, true) = true
       AND (
         lower(public.unaccent(canonical_term)) = v_q
         OR EXISTS (SELECT 1 FROM unnest(coalesce(aliases,'{}'::text[])) a
                     WHERE lower(public.unaccent(a)) = v_q)
       )
  ),
  expanded AS (
    SELECT v_q AS term
    UNION SELECT lower(public.unaccent(canonical_term)) FROM syn
    UNION SELECT lower(public.unaccent(a))
             FROM syn, unnest(coalesce(aliases,'{}'::text[])) a
  )
  SELECT array_agg(DISTINCT term) INTO v_terms
    FROM expanded WHERE term IS NOT NULL AND length(term) > 0;
  IF v_terms IS NULL THEN v_terms := ARRAY[v_q]; END IF;

  SELECT array_agg(b.product_id ORDER BY b.weight DESC, b.created_at ASC)
    INTO v_boost_ids
    FROM public.search_boosts b
    JOIN public.products p ON p.id = b.product_id AND p.is_active = true
   WHERE b.is_active = true
     AND b.term_normalized = ANY(v_terms)
     AND (b.starts_at IS NULL OR b.starts_at <= now())
     AND (b.ends_at IS NULL OR b.ends_at >= now())
     AND (_category_id IS NULL OR p.category_id = _category_id)
     AND (_min_price IS NULL OR p.price >= _min_price)
     AND (_max_price IS NULL OR p.price < _max_price);

  BEGIN
    v_tsq := websearch_to_tsquery('portuguese', array_to_string(v_terms, ' OR '));
  EXCEPTION WHEN OTHERS THEN
    v_tsq := NULL;
  END;

  IF v_tsq IS NOT NULL THEN
    WITH exact AS (
      SELECT p.id
        FROM public.products p
       WHERE p.is_active = true
         AND (_category_id IS NULL OR p.category_id = _category_id)
         AND (_min_price IS NULL OR p.price >= _min_price)
         AND (_max_price IS NULL OR p.price < _max_price)
         AND to_tsvector(
               'portuguese',
               public.unaccent(coalesce(p.name,'') || ' ' ||
                               coalesce(p.description,'') || ' ' ||
                               coalesce(p.search_text,''))
             ) @@ v_tsq
       ORDER BY p.featured_weight DESC NULLS LAST
       LIMIT v_cap
    ),
    merged AS (
      SELECT id, ord FROM (
        SELECT unnest(coalesce(v_boost_ids,'{}'::uuid[])) AS id,
               generate_subscripts(coalesce(v_boost_ids,'{}'::uuid[]),1) AS ord
      ) b
      UNION ALL
      SELECT id, 100000 + row_number() OVER () AS ord
        FROM exact
       WHERE id <> ALL(coalesce(v_boost_ids,'{}'::uuid[]))
    ),
    dedup AS (SELECT DISTINCT ON (id) id, ord FROM merged ORDER BY id, ord)
    SELECT coalesce(jsonb_agg(id ORDER BY ord), '[]'::jsonb)
      INTO v_all
      FROM (SELECT id, ord FROM dedup ORDER BY ord LIMIT v_cap) f;

    v_total := jsonb_array_length(v_all);
    IF v_total > 0 THEN v_source := 'exact'; END IF;
  END IF;

  IF v_total = 0 THEN
    WITH scored AS (
      SELECT p.id,
             max(GREATEST(
               word_similarity(t.term, lower(public.unaccent(coalesce(p.name,'')))),
               word_similarity(t.term, lower(public.unaccent(coalesce(p.search_text,''))))
             )) AS sim,
             p.featured_weight
        FROM public.products p
        CROSS JOIN unnest(v_terms) AS t(term)
       WHERE p.is_active = true
         AND (_category_id IS NULL OR p.category_id = _category_id)
         AND (_min_price IS NULL OR p.price >= _min_price)
         AND (_max_price IS NULL OR p.price < _max_price)
       GROUP BY p.id, p.featured_weight
      HAVING max(GREATEST(
               word_similarity(t.term, lower(public.unaccent(coalesce(p.name,'')))),
               word_similarity(t.term, lower(public.unaccent(coalesce(p.search_text,''))))
             )) > 0.3
    ),
    ranked AS (
      SELECT id, sim FROM scored
       ORDER BY sim DESC, featured_weight DESC NULLS LAST
       LIMIT v_cap
    ),
    merged AS (
      SELECT id, ord FROM (
        SELECT unnest(coalesce(v_boost_ids,'{}'::uuid[])) AS id,
               generate_subscripts(coalesce(v_boost_ids,'{}'::uuid[]),1) AS ord
      ) b
      UNION ALL
      SELECT id, 100000 + row_number() OVER () AS ord
        FROM ranked
       WHERE id <> ALL(coalesce(v_boost_ids,'{}'::uuid[]))
    ),
    dedup AS (SELECT DISTINCT ON (id) id, ord FROM merged ORDER BY id, ord)
    SELECT coalesce(jsonb_agg(id ORDER BY ord), '[]'::jsonb)
      INTO v_all
      FROM (SELECT id, ord FROM dedup ORDER BY ord LIMIT v_cap) f;

    v_total := jsonb_array_length(v_all);
    IF v_total > 0 THEN v_source := 'fuzzy'; END IF;
  END IF;

  -- Paginação em memória sobre a lista já ranqueada (cap de 500 itens)
  SELECT coalesce(jsonb_agg(elem ORDER BY idx), '[]'::jsonb)
    INTO v_ids
    FROM (
      SELECT elem, idx
        FROM jsonb_array_elements(v_all) WITH ORDINALITY AS t(elem, idx)
       ORDER BY idx
       OFFSET _offset LIMIT _limit
    ) page;

  v_result_cnt := jsonb_array_length(v_ids);

  IF v_total = 0 OR v_source = 'fuzzy' THEN
    SELECT s.canonical_term
      INTO v_suggestion
      FROM public.search_synonyms s
     WHERE coalesce(s.active, true) = true
     ORDER BY GREATEST(
       similarity(lower(public.unaccent(s.canonical_term)), v_q),
       coalesce((SELECT max(similarity(lower(public.unaccent(a)), v_q))
                   FROM unnest(coalesce(s.aliases,'{}'::text[])) a), 0)
     ) DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF _offset = 0 THEN
    BEGIN
      PERFORM public.log_search(v_q_raw, v_total, v_suggestion);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ids', coalesce(v_ids, '[]'::jsonb),
    'suggestion', v_suggestion,
    'source', v_source,
    'count', v_result_cnt,
    'total', v_total,
    'offset', _offset,
    'has_more', (_offset + v_result_cnt) < v_total
  );
END;
$$;


ALTER FUNCTION "public"."search_products"("_q" "text", "_limit" integer, "_category_id" "uuid", "_min_price" numeric, "_max_price" numeric, "_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_role"("_user_id" "uuid", "_role" "text", "_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_target_email text;
  v_role public.app_role;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id obrigatório';
  END IF;
  IF _action NOT IN ('add','remove') THEN
    RAISE EXCEPTION 'action inválida (use add ou remove)';
  END IF;

  BEGIN
    v_role := _role::public.app_role;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'role inválida: %', _role;
  END;

  -- Proteção absoluta: o papel de admin nunca pode ser removido
  IF _action = 'remove' AND v_role = 'admin' THEN
    RAISE EXCEPTION 'O papel de admin não pode ser removido. Administradores mantêm acesso total permanentemente.';
  END IF;

  SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller;
  SELECT email INTO v_target_email FROM public.profiles WHERE id = _user_id;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;

  IF _action = 'add' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.role_promotion_audit
      (promoted_by, promoted_by_email, target_user_id, target_email, role, status, message)
    VALUES (v_caller, v_caller_email, _user_id, v_target_email, v_role::text, 'success',
            'Papel "'||v_role::text||'" adicionado via painel de usuários.');
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = v_role;
    INSERT INTO public.role_promotion_audit
      (promoted_by, promoted_by_email, target_user_id, target_email, role, status, message)
    VALUES (v_caller, v_caller_email, _user_id, v_target_email, v_role::text, 'success',
            'Papel "'||v_role::text||'" removido via painel de usuários.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."set_user_role"("_user_id" "uuid", "_role" "text", "_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_product_slugs_from_products"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_norm     text;
  v_old_norm text;
  v_owner    uuid;
BEGIN
  IF NEW.slug IS NULL THEN RETURN NEW; END IF;
  v_norm := public.normalize_slug(NEW.slug);

  IF TG_OP = 'INSERT' THEN
    -- Verifica posse antes de inserir
    SELECT product_id INTO v_owner FROM public.product_slugs
      WHERE slug_normalized = v_norm LIMIT 1;
    IF v_owner IS NOT NULL AND v_owner <> NEW.id THEN
      RAISE EXCEPTION 'Slug "%" já pertence a outro produto (%).', v_norm, v_owner
        USING ERRCODE = '23505';
    END IF;
    IF v_owner IS NULL THEN
      INSERT INTO public.product_slugs (product_id, slug, slug_normalized, is_primary, source)
      VALUES (NEW.id, NEW.slug, v_norm, true, 'legacy');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.slug IS NOT DISTINCT FROM NEW.slug THEN
    RETURN NEW;
  END IF;

  v_old_norm := public.normalize_slug(OLD.slug);

  -- Verifica se novo slug já existe e pertence a outro produto
  SELECT product_id INTO v_owner FROM public.product_slugs
    WHERE slug_normalized = v_norm LIMIT 1;
  IF v_owner IS NOT NULL AND v_owner <> NEW.id THEN
    RAISE EXCEPTION 'Slug "%" já pertence a outro produto (%). Renomeação bloqueada.', v_norm, v_owner
      USING ERRCODE = '23505';
  END IF;

  -- 1) Desmarcar primários antigos deste produto PRIMEIRO
  UPDATE public.product_slugs
     SET is_primary = false, updated_at = now()
   WHERE product_id = NEW.id AND is_primary;

  -- 2) Promover/inserir o novo como primário
  IF v_owner = NEW.id THEN
    UPDATE public.product_slugs
       SET is_primary = true, is_active = true, updated_at = now()
     WHERE slug_normalized = v_norm AND product_id = NEW.id;
  ELSE
    INSERT INTO public.product_slugs (product_id, slug, slug_normalized, is_primary, source)
    VALUES (NEW.id, NEW.slug, v_norm, true, 'rename');
  END IF;

  -- 3) Garante slug antigo permaneça como alias ativo (histórico)
  UPDATE public.product_slugs
     SET is_active = true, updated_at = now()
   WHERE product_id = NEW.id
     AND slug_normalized = v_old_norm
     AND slug_normalized <> v_norm;

  RETURN NEW;
END $$;


ALTER FUNCTION "public"."sync_product_slugs_from_products"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_heartbeat"("_visitor_id" "text", "_pageview_id" "uuid", "_delta_seconds" integer, "_scroll_depth" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_delta  int := greatest(0, least(coalesce(_delta_seconds, 0), 3600));
  v_scroll int := CASE
    WHEN _scroll_depth IS NULL THEN NULL
    ELSE greatest(0, least(_scroll_depth, 100))
  END;
  v_pv_id  uuid := _pageview_id;
BEGIN
  IF _visitor_id IS NULL OR length(_visitor_id) = 0 THEN
    RAISE EXCEPTION 'invalid_visitor_id';
  END IF;
  IF v_delta = 0 THEN RETURN; END IF;

  IF v_pv_id IS NULL THEN
    SELECT id INTO v_pv_id
      FROM public.visitor_pageviews
     WHERE visitor_id = _visitor_id
     ORDER BY viewed_at DESC
     LIMIT 1;
  END IF;

  IF v_pv_id IS NOT NULL THEN
    UPDATE public.visitor_pageviews
       SET time_on_page_seconds = least(time_on_page_seconds + v_delta, 86400),
           scroll_depth_pct     = greatest(coalesce(scroll_depth_pct, 0), coalesce(v_scroll, 0))
     WHERE id = v_pv_id;
  END IF;

  UPDATE public.visitors
     SET total_time_seconds = total_time_seconds + v_delta,
         last_seen_at       = now()
   WHERE visitor_id = _visitor_id;
END;
$$;


ALTER FUNCTION "public"."track_heartbeat"("_visitor_id" "text", "_pageview_id" "uuid", "_delta_seconds" integer, "_scroll_depth" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_pageview"("_visitor_id" "text", "_session_id" "uuid", "_path" "text", "_title" "text", "_product_slug" "text", "_referrer" "text", "_from_path" "text" DEFAULT NULL::"text", "_cta_id" "text" DEFAULT NULL::"text", "_event_type" "text" DEFAULT 'pageview'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_product_id uuid;
  v_step       int;
  v_id         uuid;
BEGIN
  IF _visitor_id IS NULL OR length(_visitor_id) = 0 OR length(_visitor_id) > 64 THEN
    RAISE EXCEPTION 'invalid_visitor_id';
  END IF;
  IF _path IS NULL OR length(_path) = 0 THEN
    RAISE EXCEPTION 'invalid_path';
  END IF;

  IF _product_slug IS NOT NULL AND length(_product_slug) > 0 THEN
    SELECT id INTO v_product_id FROM public.products WHERE slug = _product_slug LIMIT 1;
  END IF;

  SELECT coalesce(max(step_index), 0) + 1
    INTO v_step
    FROM public.visitor_pageviews
   WHERE visitor_id = _visitor_id;

  INSERT INTO public.visitor_pageviews(
    visitor_id, session_id, path, title, product_id, referrer,
    step_index, from_path, cta_id, event_type
  ) VALUES (
    _visitor_id, _session_id,
    left(_path, 500),
    left(coalesce(_title,''), 300),
    v_product_id,
    left(coalesce(_referrer,''), 500),
    v_step,
    left(coalesce(_from_path,''), 500),
    left(coalesce(_cta_id,''), 120),
    coalesce(nullif(_event_type,''), 'pageview')
  )
  RETURNING id INTO v_id;

  UPDATE public.visitors
     SET total_pageviews = total_pageviews + 1,
         last_seen_at    = now()
   WHERE visitor_id = _visitor_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."track_pageview"("_visitor_id" "text", "_session_id" "uuid", "_path" "text", "_title" "text", "_product_slug" "text", "_referrer" "text", "_from_path" "text", "_cta_id" "text", "_event_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_pdp_funnel_batch"("_events" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_recent int;
  v_count  int;
BEGIN
  IF _events IS NULL OR jsonb_typeof(_events) <> 'array' THEN RETURN; END IF;
  v_count := jsonb_array_length(_events);
  IF v_count = 0 OR v_count > 50 THEN RETURN; END IF;

  SELECT count(*) INTO v_recent
    FROM public.pdp_funnel_events
   WHERE created_at > now() - interval '1 minute';
  IF v_recent > 1000 THEN RETURN; END IF;

  INSERT INTO public.pdp_funnel_events
    (event_name, source, product_slug, quantity, personalized, session_id, meta)
  SELECT
    left(coalesce(e->>'event_name','unknown'), 100),
    nullif(left(coalesce(e->>'source',''), 100), ''),
    nullif(left(coalesce(e->>'product_slug',''), 200), ''),
    NULLIF((e->>'quantity'),'')::int,
    NULLIF((e->>'personalized'),'')::boolean,
    nullif(left(coalesce(e->>'session_id',''), 80), ''),
    CASE WHEN e ? 'meta' AND jsonb_typeof(e->'meta') = 'object' THEN e->'meta' ELSE NULL END
  FROM jsonb_array_elements(_events) AS e;
END;
$$;


ALTER FUNCTION "public"."track_pdp_funnel_batch"("_events" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_product_version"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_next    integer;
  v_old     jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new     jsonb := to_jsonb(NEW);
  v_changed jsonb;
  v_email   text;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.product_versions WHERE product_id = NEW.id;

  SELECT COALESCE(jsonb_agg(k.key), '[]'::jsonb) INTO v_changed
  FROM jsonb_each(v_new) k
  WHERE k.key NOT IN ('updated_at', 'search_text')
    AND (v_old->k.key) IS DISTINCT FROM k.value;

  IF TG_OP = 'UPDATE' AND jsonb_array_length(v_changed) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.product_versions (product_id, version, operation, snapshot, changed_fields, actor_id, actor_email)
  VALUES (NEW.id, v_next, lower(TG_OP), v_new, v_changed, auth.uid(), v_email);

  DELETE FROM public.product_versions pv
  WHERE pv.product_id = NEW.id
    AND pv.version <= v_next - 50;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."track_product_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tracking_email_log_set_actor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_email text;
BEGIN
  IF NEW.triggered_by IS NULL THEN
    NEW.triggered_by := auth.uid();
  END IF;
  IF NEW.triggered_by_email IS NULL AND NEW.triggered_by IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = NEW.triggered_by;
    NEW.triggered_by_email := v_email;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tracking_email_log_set_actor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trim_shipping_audit_logs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.shipping_audit_logs
  WHERE id IN (
    SELECT id FROM public.shipping_audit_logs
    ORDER BY created_at DESC
    OFFSET 50
  );
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."trim_shipping_audit_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unresolved_catalog_security_scan"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ WITH latest AS (SELECT findings FROM public.security_scan_runs WHERE status='ok' ORDER BY created_at DESC,id DESC LIMIT 1) SELECT r.id FROM public.security_scan_runs r WHERE r.status='ok' AND r.high_regression AND NOT EXISTS(SELECT 1 FROM public.catalog_security_approvals a WHERE a.scan_id=r.id) AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.findings) f CROSS JOIN latest l CROSS JOIN LATERAL jsonb_array_elements(l.findings) c WHERE f->>'severity' IN ('high','critical') AND c->>'severity' IN ('high','critical') AND f->>'id'=c->>'id' AND f->>'package'=c->>'package') ORDER BY r.created_at DESC,r.id DESC LIMIT 1; $$;


ALTER FUNCTION "public"."unresolved_catalog_security_scan"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_profile"("_user_id" "uuid", "_full_name" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_email text;
  v_name   text := nullif(trim(coalesce(_full_name,'')), '');
  v_old    text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id obrigatório' USING ERRCODE='23502';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Nome não pode ficar vazio' USING ERRCODE='23514';
  END IF;
  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'Nome muito longo' USING ERRCODE='23514';
  END IF;

  SELECT full_name INTO v_old FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado' USING ERRCODE='23503';
  END IF;

  UPDATE public.profiles
     SET full_name = v_name, updated_at = now()
   WHERE id = _user_id;

  IF coalesce(v_old,'') IS DISTINCT FROM v_name THEN
    SELECT email INTO v_caller_email FROM public.profiles WHERE id = v_caller;
    INSERT INTO public.profile_change_audit (user_id, field, old_value, new_value, changed_by, changed_by_email)
    VALUES (_user_id, 'full_name', v_old, v_name, v_caller, v_caller_email);
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', _user_id, 'full_name', v_name);
END
$$;


ALTER FUNCTION "public"."update_user_profile"("_user_id" "uuid", "_full_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_source_counts"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_auth bigint;
  v_customer bigint;
  v_visitor bigint;
  v_order bigint;
  v_admin bigint;
  v_editor bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT count(*) INTO v_auth     FROM public.profiles;
  SELECT count(*) INTO v_customer FROM public.customers;
  SELECT count(*) INTO v_visitor  FROM public.visitors WHERE customer_id IS NULL;
  SELECT count(DISTINCT lower(customer_email)) INTO v_order FROM public.orders WHERE customer_email IS NOT NULL;
  SELECT count(*) INTO v_admin  FROM public.user_roles WHERE role='admin';
  SELECT count(*) INTO v_editor FROM public.user_roles WHERE role='editor';
  RETURN jsonb_build_object(
    'auth', v_auth, 'customer', v_customer, 'visitor', v_visitor, 'order', v_order,
    'admin', v_admin, 'editor', v_editor
  );
END $$;


ALTER FUNCTION "public"."users_source_counts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_coupon"("_code" "text", "_subtotal" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  c record;
  discount numeric := 0;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(_code) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom não encontrado');
  END IF;
  IF NOT c.is_active THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom inativo');
  END IF;
  IF c.valid_from IS NOT NULL AND now() < c.valid_from THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom ainda não disponível');
  END IF;
  IF c.valid_until IS NOT NULL AND now() > c.valid_until THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom expirado');
  END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom esgotado');
  END IF;
  IF _subtotal < c.min_subtotal THEN
    RETURN jsonb_build_object('valid', false, 'error',
      'Valor mínimo de R$ ' || c.min_subtotal::text || ' não atingido');
  END IF;
  IF c.discount_type = 'percent' THEN
    discount := round((_subtotal * c.discount_value / 100)::numeric, 2);
  ELSE
    discount := least(c.discount_value, _subtotal);
  END IF;
  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'discount_applied', discount,
    'description', c.description
  );
END;
$_$;


ALTER FUNCTION "public"."validate_coupon"("_code" "text", "_subtotal" numeric) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."access_request_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid",
    "requester_email" "text",
    "requested_at" timestamp with time zone,
    "admin_count" integer DEFAULT 0 NOT NULL,
    "sent_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "error_message" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."access_request_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_access_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_by_email" "text",
    "rejection_reason" "text",
    "user_email_snapshot" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_access_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text"])))
);


ALTER TABLE "public"."admin_access_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_promotion_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promoted_by" "uuid",
    "promoted_by_email" "text",
    "target_user_id" "uuid",
    "target_email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."role_promotion_audit" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."admin_audit_timeline" AS
 SELECT 'audit'::"text" AS "source",
    "role_promotion_audit"."id" AS "event_id",
    "role_promotion_audit"."created_at",
    "role_promotion_audit"."status",
    "role_promotion_audit"."role",
    "role_promotion_audit"."target_user_id",
    "role_promotion_audit"."target_email",
    "role_promotion_audit"."promoted_by_email" AS "actor_email",
    "role_promotion_audit"."message" AS "details"
   FROM "public"."role_promotion_audit"
UNION ALL
 SELECT 'request'::"text" AS "source",
    "admin_access_requests"."id" AS "event_id",
    "admin_access_requests"."requested_at" AS "created_at",
    "admin_access_requests"."status",
    'admin'::"text" AS "role",
    "admin_access_requests"."user_id" AS "target_user_id",
    "admin_access_requests"."user_email_snapshot" AS "target_email",
    "admin_access_requests"."reviewed_by_email" AS "actor_email",
    COALESCE("admin_access_requests"."rejection_reason",
        CASE "admin_access_requests"."status"
            WHEN 'pending'::"text" THEN 'Solicitação pendente'::"text"
            WHEN 'approved'::"text" THEN 'Solicitação aprovada'::"text"
            WHEN 'denied'::"text" THEN 'Solicitação reprovada'::"text"
            ELSE "admin_access_requests"."status"
        END) AS "details"
   FROM "public"."admin_access_requests"
UNION ALL
 SELECT 'notification'::"text" AS "source",
    "access_request_notifications"."id" AS "event_id",
    "access_request_notifications"."created_at",
    "access_request_notifications"."status",
    'admin'::"text" AS "role",
    "access_request_notifications"."requester_id" AS "target_user_id",
    "access_request_notifications"."requester_email" AS "target_email",
    NULL::"text" AS "actor_email",
    COALESCE("access_request_notifications"."error_message", (((('Notificação enviada para '::"text" || ("access_request_notifications"."sent_count")::"text") || '/'::"text") || ("access_request_notifications"."admin_count")::"text") || ' admin(s)'::"text")) AS "details"
   FROM "public"."access_request_notifications"
  WITH NO DATA;


ALTER TABLE "public"."admin_audit_timeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_usage_aggregates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "text" NOT NULL,
    "version" "text" DEFAULT 'p2.4'::"text" NOT NULL,
    "client_ts" timestamp with time zone NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_events" integer DEFAULT 0 NOT NULL,
    "payload" "jsonb" NOT NULL
);


ALTER TABLE "public"."admin_usage_aggregates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "excerpt" "text",
    "content" "text",
    "cover_image" "text",
    "cover_image_alt" "text",
    "meta_title" "text",
    "meta_description" "text",
    "is_indexed" boolean DEFAULT true NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "published_at" timestamp with time zone,
    "author" "text" DEFAULT 'Empório LeleCute'::"text",
    "reading_time" integer,
    "featured" boolean DEFAULT false NOT NULL,
    "faqs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "related_products" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "related_categories" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "related_occasions" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "related_segments" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "related_tags" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "related_themes" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "topical_score" integer DEFAULT 0 NOT NULL,
    "authority_contribution" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."blog_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_security_approvals" (
    "scan_id" "uuid" NOT NULL,
    "approved_by" "uuid" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."catalog_security_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "image_url" "text",
    "meta_title" "text",
    "meta_description" "text",
    "h1_override" "text",
    "description_seo" "text",
    "is_indexed" boolean DEFAULT true NOT NULL,
    "faqs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "icon" "text",
    "is_draft" boolean DEFAULT true NOT NULL,
    "external_ref" "text" NOT NULL,
    "image_ref" "text",
    "google_product_category" "text"
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


COMMENT ON COLUMN "public"."categories"."is_draft" IS 'Rascunho. Só fica visível ao público (sitemap/SEO/listagens) quando is_draft=false AND is_indexed=true.';



CREATE TABLE IF NOT EXISTS "public"."collection_products" (
    "collection_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."collection_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "show_on_home" boolean DEFAULT false NOT NULL,
    "home_position" integer DEFAULT 0 NOT NULL,
    "meta_title" "text",
    "meta_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combination_pages_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "path" "text" NOT NULL,
    "primary_type" "text" NOT NULL,
    "primary_slug" "text" NOT NULL,
    "secondary_type" "text" NOT NULL,
    "secondary_slug" "text" NOT NULL,
    "product_count" integer DEFAULT 0 NOT NULL,
    "has_editorial" boolean DEFAULT false NOT NULL,
    "has_custom_meta" boolean DEFAULT false NOT NULL,
    "has_faq" boolean DEFAULT false NOT NULL,
    "seo_score" integer DEFAULT 0 NOT NULL,
    "is_indexable" boolean DEFAULT false NOT NULL,
    "editorial_content" "text",
    "meta_title" "text",
    "meta_description" "text",
    "faqs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_evaluated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generated_slug" "text",
    "canonical_path" "text",
    "products_count" integer DEFAULT 0 NOT NULL,
    "quality_score" integer DEFAULT 0 NOT NULL,
    "confidence_score" integer DEFAULT 0 NOT NULL,
    "thin_content_risk" boolean DEFAULT true NOT NULL,
    "auto_discovered" boolean DEFAULT false NOT NULL,
    "discovery_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "discovery_status" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "discovery_type" "text",
    "readiness_score" integer DEFAULT 0 NOT NULL,
    "topical_coverage" integer DEFAULT 0 NOT NULL,
    "internal_links_count" integer DEFAULT 0 NOT NULL,
    "cannibalization_risk" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "last_authority_refresh" timestamp with time zone,
    "authority_manipulation" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."combination_pages_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_migration_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_id" "text",
    "target_customer_id" "uuid",
    "target_email" "text",
    "target_whatsapp" "text",
    "status" "text" NOT NULL,
    "message" "text",
    "performed_by" "uuid",
    "performed_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_migration_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cookie_consent_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "title" "text" DEFAULT 'Sua privacidade importa 🍪'::"text" NOT NULL,
    "message" "text" DEFAULT 'Usamos cookies para melhorar sua experiência e mostrar produtos relevantes. Aceite para liberar tudo ou recuse para o essencial.'::"text" NOT NULL,
    "accept_label" "text" DEFAULT 'Aceitar'::"text" NOT NULL,
    "reject_label" "text" DEFAULT 'Recusar'::"text" NOT NULL,
    "policy_label" "text" DEFAULT 'Política de Privacidade'::"text" NOT NULL,
    "policy_url" "text" DEFAULT '/politica-de-privacidade'::"text" NOT NULL,
    "delay_ms" integer DEFAULT 1500 NOT NULL,
    "position" "text" DEFAULT 'bottom'::"text" NOT NULL,
    "variant" "text" DEFAULT 'compact'::"text" NOT NULL,
    "show_icon" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "cookie_consent_config_position_check" CHECK (("position" = ANY (ARRAY['bottom'::"text", 'top'::"text"]))),
    CONSTRAINT "cookie_consent_config_variant_check" CHECK (("variant" = ANY (ARRAY['compact'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."cookie_consent_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cookie_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "accepted" boolean NOT NULL,
    "categories" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cookie_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupon_uses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "subtotal" numeric,
    "discount_applied" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."coupon_uses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "discount_type" "text" NOT NULL,
    "discount_value" numeric NOT NULL,
    "min_subtotal" numeric DEFAULT 0 NOT NULL,
    "valid_from" timestamp with time zone,
    "valid_until" timestamp with time zone,
    "max_uses" integer,
    "used_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "coupons_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "coupons_discount_value_check" CHECK (("discount_value" >= (0)::numeric))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "whatsapp" "text",
    "city" "text",
    "state" "text",
    "source" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_code" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_email" "text" NOT NULL,
    "customer_phone" "text" NOT NULL,
    "address_cep" "text" NOT NULL,
    "address_street" "text",
    "address_number" "text",
    "address_complement" "text",
    "address_neighborhood" "text",
    "address_city" "text" NOT NULL,
    "address_state" "text" NOT NULL,
    "shipping_method" "text" NOT NULL,
    "shipping_company" "text",
    "shipping_days" "text",
    "shipping_price" numeric DEFAULT 0 NOT NULL,
    "subtotal" numeric NOT NULL,
    "total" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "coupon_code" "text",
    "discount_amount" numeric DEFAULT 0 NOT NULL,
    "payment_status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "payment_method" "text",
    "payment_id" "text",
    "paid_at" timestamp with time zone,
    "tracking_code" "text",
    "tracking_carrier" "text",
    "tracking_url" "text",
    "shipped_at" timestamp with time zone
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "customer_id" "uuid",
    "whatsapp_phone" "text",
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip" "inet",
    "ip_country" "text",
    "ip_region" "text",
    "ip_city" "text",
    "ip_lat" numeric,
    "ip_lon" numeric,
    "ip_isp" "text",
    "ip_asn" "text",
    "ip_timezone" "text",
    "user_agent" "text",
    "device_type" "text",
    "os_name" "text",
    "os_version" "text",
    "browser_name" "text",
    "browser_version" "text",
    "device_brand" "text",
    "device_model" "text",
    "screen_w" integer,
    "screen_h" integer,
    "viewport_w" integer,
    "viewport_h" integer,
    "pixel_ratio" numeric,
    "color_depth" integer,
    "language" "text",
    "languages" "text"[],
    "timezone" "text",
    "touch_support" boolean,
    "gps_lat" numeric,
    "gps_lon" numeric,
    "gps_accuracy" numeric,
    "gps_captured_at" timestamp with time zone,
    "first_referrer" "text",
    "first_landing_path" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "utm_term" "text",
    "utm_content" "text",
    "total_pageviews" integer DEFAULT 0 NOT NULL,
    "total_sessions" integer DEFAULT 0 NOT NULL,
    "total_time_seconds" integer DEFAULT 0 NOT NULL,
    "consent_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "consent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_bot" boolean DEFAULT false NOT NULL,
    "bot_name" "text",
    "lead_status" "text" DEFAULT 'visitor'::"text" NOT NULL,
    "lead_promoted_at" timestamp with time zone,
    "lead_trigger" "text",
    CONSTRAINT "visitors_lead_status_chk" CHECK (("lead_status" = ANY (ARRAY['visitor'::"text", 'lead'::"text", 'customer'::"text", 'bot'::"text"])))
);


ALTER TABLE "public"."visitors" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."customer_overview" WITH ("security_invoker"='on') AS
 SELECT "c"."id",
    "c"."name",
    "c"."email",
    "c"."phone",
    "c"."whatsapp",
    "c"."city",
    "c"."state",
    "c"."status",
    "c"."tags",
    "c"."source",
    "c"."notes",
    "c"."created_at",
    "c"."updated_at",
    COALESCE("o"."total_orders", (0)::bigint) AS "total_orders",
    COALESCE("o"."total_spent", (0)::numeric) AS "total_spent",
    "o"."last_order_at",
    COALESCE("v"."visit_count", (0)::bigint) AS "visit_count",
    "v"."last_seen_at"
   FROM (("public"."customers" "c"
     LEFT JOIN ( SELECT "lower"("orders"."customer_email") AS "email",
            "count"(*) AS "total_orders",
            "sum"("orders"."total") AS "total_spent",
            "max"("orders"."created_at") AS "last_order_at"
           FROM "public"."orders"
          WHERE ("orders"."customer_email" IS NOT NULL)
          GROUP BY ("lower"("orders"."customer_email"))) "o" ON (("o"."email" = "lower"("c"."email"))))
     LEFT JOIN ( SELECT "visitors"."customer_id",
            "count"(*) AS "visit_count",
            "max"("visitors"."last_seen_at") AS "last_seen_at"
           FROM "public"."visitors"
          WHERE ("visitors"."customer_id" IS NOT NULL)
          GROUP BY "visitors"."customer_id") "v" ON (("v"."customer_id" = "c"."id")));


ALTER TABLE "public"."customer_overview" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_deletion_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "whatsapp" "text",
    "visitor_id" "text",
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "internal_notes" "text",
    "ip" "text",
    "user_agent" "text",
    "processed_at" timestamp with time zone,
    "processed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."data_deletion_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "position" integer DEFAULT 0,
    "is_visible" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hero_slides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tagline" "text",
    "title" "text" NOT NULL,
    "subtitle" "text",
    "image_url" "text",
    "cta_label" "text",
    "cta_url" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_mode" "text" DEFAULT 'text_image'::"text" NOT NULL,
    "image_desktop_url" "text",
    "image_alt" "text",
    "image_ref" "text",
    CONSTRAINT "hero_slides_display_mode_check" CHECK (("display_mode" = ANY (ARRAY['text_image'::"text", 'banner_mobile'::"text", 'banner_desktop'::"text"])))
);


ALTER TABLE "public"."hero_slides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_section_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_key" "text" NOT NULL,
    "action" "text" NOT NULL,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "changed_by" "uuid",
    "changed_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "home_section_audit_action_check" CHECK (("action" = ANY (ARRAY['visibility_changed'::"text", 'reordered'::"text", 'edited'::"text", 'created'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."home_section_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_key" "text" NOT NULL,
    "component_name" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "is_visible" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "editable_props" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."home_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."homepage_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "block_key" "text" NOT NULL,
    "block_type" "text" DEFAULT 'category'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "description" "text",
    "image_url" "text",
    "link_url" "text",
    "link_text" "text",
    "position" integer DEFAULT 0,
    "is_visible" boolean DEFAULT true,
    "content" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."homepage_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_embed_failures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "post_url" "text",
    "route" "text",
    "ms_to_fallback" integer,
    "user_agent" "text"
);


ALTER TABLE "public"."instagram_embed_failures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_feed_embeds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_url" "text" NOT NULL,
    "caption" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "preview_image_url" "text"
);


ALTER TABLE "public"."instagram_feed_embeds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_post_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "image_url" "text",
    "title" "text",
    "error_message" "text",
    "meta_used" "text"
);


ALTER TABLE "public"."instagram_post_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "image_url" "text" NOT NULL,
    "alt_text" "text" DEFAULT 'Empório LeleCute - Instagram'::"text" NOT NULL,
    "post_url" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "extraction_status" "text" DEFAULT 'manual'::"text" NOT NULL,
    "extraction_error" "text",
    "shortcode" "text",
    "last_extracted_at" timestamp with time zone
);


ALTER TABLE "public"."instagram_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instagram_sync_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "action" "text" DEFAULT 'sync'::"text" NOT NULL,
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "synced_count" integer DEFAULT 0 NOT NULL,
    "selected_count" integer,
    "error_message" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "triggered_by" "uuid"
);


ALTER TABLE "public"."instagram_sync_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_function_secrets" (
    "name" "text" NOT NULL,
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_function_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kit_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kit_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."kit_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "bundle_type" "public"."kit_bundle_type" DEFAULT 'curated'::"public"."kit_bundle_type" NOT NULL,
    "estimated_savings" numeric(10,2),
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "show_on_home" boolean DEFAULT false NOT NULL,
    "home_position" integer DEFAULT 0 NOT NULL,
    "meta_title" "text",
    "meta_description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_ref" "text" NOT NULL,
    "image_ref" "text"
);


ALTER TABLE "public"."kits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_assets" (
    "img_ref" "text" NOT NULL,
    "bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text",
    "content_type" "text",
    "size_bytes" bigint,
    "checksum_sha256" "text",
    "width" integer,
    "height" integer,
    "entity_type" "text",
    "entity_id" "text",
    "field" "text",
    "ref_count" integer DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'storage'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_verified_at" timestamp with time zone,
    "backed_up_at" timestamp with time zone,
    CONSTRAINT "media_assets_source_chk" CHECK (("source" = ANY (ARRAY['storage'::"text", 'src_assets'::"text", 'external'::"text"]))),
    CONSTRAINT "media_assets_status_chk" CHECK (("status" = ANY (ARRAY['active'::"text", 'missing'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."media_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_audit_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total" integer DEFAULT 0 NOT NULL,
    "active" integer DEFAULT 0 NOT NULL,
    "archived" integer DEFAULT 0 NOT NULL,
    "missing" integer DEFAULT 0 NOT NULL,
    "missing_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "manifest" "jsonb",
    "alerted" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'cron'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_audit_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_backup_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_assets" integer DEFAULT 0 NOT NULL,
    "exported_count" integer DEFAULT 0 NOT NULL,
    "verified_count" integer DEFAULT 0 NOT NULL,
    "coverage_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "bytes_total" bigint DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'partial'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_backup_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "menu_location" "text" NOT NULL,
    "label" "text" NOT NULL,
    "url" "text",
    "page_id" "uuid",
    "parent_id" "uuid",
    "position" integer DEFAULT 0,
    "is_external" boolean DEFAULT false,
    "is_visible" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "menu_items_menu_location_check" CHECK (("menu_location" = ANY (ARRAY['header'::"text", 'footer'::"text"])))
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merchant_feed_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_count" integer DEFAULT 0 NOT NULL,
    "errors" integer DEFAULT 0 NOT NULL,
    "warnings" integer DEFAULT 0 NOT NULL,
    "ready" integer DEFAULT 0 NOT NULL,
    "checksum" "text",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."merchant_feed_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "email_enabled" boolean DEFAULT true NOT NULL,
    "push_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."occasion_landings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_slug" "text" NOT NULL,
    "occasion_slug" "text" NOT NULL,
    "h1" "text" NOT NULL,
    "hero_badge" "text" NOT NULL,
    "hero_subtitle" "text" NOT NULL,
    "theme_accent" "text" DEFAULT 'from-pink-100 to-rose-100'::"text" NOT NULL,
    "seo_title" "text" NOT NULL,
    "seo_description" "text" NOT NULL,
    "seo_copy" "text" NOT NULL,
    "whatsapp_message" "text" NOT NULL,
    "faqs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "gallery" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "testimonials" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "social_proof_stats" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "related_route_slugs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "og_image_url" "text",
    "og_image_alt" "text"
);


ALTER TABLE "public"."occasion_landings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."occasions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "description" "text",
    "image_url" "text",
    "meta_title" "text",
    "meta_description" "text",
    "h1_override" "text",
    "description_seo" "text",
    "is_indexed" boolean DEFAULT true NOT NULL,
    "faqs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_draft" boolean DEFAULT true NOT NULL,
    "external_ref" "text" NOT NULL,
    "image_ref" "text",
    "icon" "text"
);


ALTER TABLE "public"."occasions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."occasions"."is_draft" IS 'Rascunho. Só fica visível ao público (sitemap/SEO/listagens) quando is_draft=false AND is_indexed=true.';



CREATE TABLE IF NOT EXISTS "public"."operational_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "email_enabled" boolean DEFAULT false NOT NULL,
    "alert_email" "text" DEFAULT ''::"text" NOT NULL,
    "slack_enabled" boolean DEFAULT false NOT NULL,
    "slack_channel" "text" DEFAULT ''::"text" NOT NULL,
    "alert_failures" boolean DEFAULT true NOT NULL,
    "alert_regressions" boolean DEFAULT true NOT NULL,
    "alert_high" boolean DEFAULT true NOT NULL,
    "block_catalog" boolean DEFAULT true NOT NULL,
    "retention_days" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "retention_range" CHECK ((("retention_days" >= 0) AND ("retention_days" <= 3650))),
    CONSTRAINT "singleton_id" CHECK ("id")
);


ALTER TABLE "public"."operational_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."operational_worker_credentials" (
    "id" boolean DEFAULT true NOT NULL,
    "token" "text" DEFAULT (("gen_random_uuid"())::"text" || ("gen_random_uuid"())::"text") NOT NULL,
    CONSTRAINT "operational_worker_credentials_id_check" CHECK ("id")
);


ALTER TABLE "public"."operational_worker_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_name" "text" NOT NULL,
    "product_slug" "text",
    "product_image" "text",
    "quantity" integer NOT NULL,
    "unit_price" numeric NOT NULL,
    "personalization" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_code" "text" NOT NULL,
    "status" "text" NOT NULL,
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "success" boolean DEFAULT false NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_status_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid",
    "content" "text",
    "seo_title" "text",
    "seo_description" "text",
    "version_number" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."page_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "content" "text",
    "seo_title" "text",
    "seo_description" "text",
    "seo_canonical" "text",
    "seo_noindex" boolean DEFAULT false,
    "seo_nofollow" boolean DEFAULT false,
    "status" "text" DEFAULT 'draft'::"text",
    "internal_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "published_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "pages_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'mercadopago'::"text" NOT NULL,
    "payment_id" "text",
    "event_id" "text",
    "order_code" "text",
    "provider_status" "text",
    "applied_status" "text",
    "result" "text" DEFAULT 'received'::"text" NOT NULL,
    "error_message" "text",
    "duration_ms" integer,
    "raw" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pdp_badge_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_name" "text" NOT NULL,
    "product_id" "uuid",
    "product_slug" "text",
    "badge_label" "text",
    "tone" "text",
    "position" "text",
    "source" "text" DEFAULT 'global'::"text" NOT NULL,
    "session_id" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pdp_badge_events_event_name_check" CHECK (("event_name" = ANY (ARRAY['impression'::"text", 'click'::"text"]))),
    CONSTRAINT "pdp_badge_events_source_check" CHECK (("source" = ANY (ARRAY['global'::"text", 'product_override'::"text"])))
);


ALTER TABLE "public"."pdp_badge_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pdp_funnel_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_name" "text" NOT NULL,
    "source" "text",
    "product_slug" "text",
    "quantity" integer,
    "personalized" boolean,
    "session_id" "text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pdp_funnel_events_name_chk" CHECK (("event_name" = ANY (ARRAY['pdp_sticky_view'::"text", 'pdp_quick_summary_view'::"text", 'pdp_whatsapp_click'::"text", 'whatsapp_click_confirmed'::"text", 'exit_popup_open'::"text", 'exit_popup_blocked'::"text", 'exit_popup_close'::"text", 'exit_popup_whatsapp_click'::"text"])))
);


ALTER TABLE "public"."pdp_funnel_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pdp_section_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_key" "text" NOT NULL,
    "action" "text" NOT NULL,
    "old_value" "jsonb",
    "new_value" "jsonb",
    "changed_by" "uuid",
    "changed_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pdp_section_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pdp_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "is_visible" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "editable_props" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pdp_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_faqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_faqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_occasions" (
    "product_id" "uuid" NOT NULL,
    "occasion_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_occasions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "author_name" "text" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_url" "text",
    "is_verified" boolean DEFAULT false NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "review_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_review_id" "text",
    "images" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "product_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."product_reviews" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."product_review_stats" WITH ("security_invoker"='true') AS
 SELECT "product_reviews"."product_id",
    ("count"(*))::integer AS "review_count",
    "round"("avg"("product_reviews"."rating"), 2) AS "avg_rating"
   FROM "public"."product_reviews"
  WHERE ("product_reviews"."is_visible" = true)
  GROUP BY "product_reviews"."product_id";


ALTER TABLE "public"."product_review_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_segments" (
    "product_id" "uuid" NOT NULL,
    "segment_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_slugs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "slug_normalized" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "hit_count" integer DEFAULT 0 NOT NULL,
    "last_hit_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_slugs_source_check" CHECK (("source" = ANY (ARRAY['legacy'::"text", 'manual'::"text", 'rename'::"text", 'import'::"text", 'alias'::"text"])))
);


ALTER TABLE "public"."product_slugs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_tags" (
    "product_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "operation" "text" NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "changed_fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "actor_id" "uuid",
    "actor_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "long_description" "text",
    "price" numeric(10,2) NOT NULL,
    "original_price" numeric(10,2),
    "min_quantity" integer DEFAULT 1,
    "pix_discount" integer DEFAULT 3,
    "production_days" integer DEFAULT 7,
    "weight" numeric(10,3),
    "category_id" "uuid",
    "badge" "text",
    "rating" numeric(2,1) DEFAULT 5.0,
    "images" "text"[] DEFAULT '{}'::"text"[],
    "features" "text"[] DEFAULT '{}'::"text"[],
    "keywords" "text"[] DEFAULT '{}'::"text"[],
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "personalization_enabled" boolean DEFAULT true,
    "personalization_label" "text" DEFAULT 'Personalização'::"text",
    "personalization_placeholder" "text" DEFAULT 'Digite o nome, data ou mensagem para personalização...'::"text",
    "google_product_category" "text",
    "seo_noindex" boolean DEFAULT false NOT NULL,
    "editorial_content" "text",
    "featured_weight" integer DEFAULT 0 NOT NULL,
    "production_speed" "text",
    "pdp_badge_override" "jsonb",
    "search_text" "text",
    "external_ref" "text" NOT NULL,
    "show_quick_summary" boolean DEFAULT false NOT NULL,
    "show_min_quantity" boolean DEFAULT false NOT NULL,
    "weight_kg" numeric,
    "length_cm" numeric,
    "width_cm" numeric,
    "height_cm" numeric,
    "requires_shipping" boolean DEFAULT true NOT NULL,
    "image_refs" "text"[] DEFAULT '{}'::"text"[],
    "personalization_options" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "seo_title" "text",
    CONSTRAINT "products_production_speed_check" CHECK ((("production_speed" IS NULL) OR ("production_speed" = ANY (ARRAY['rapido'::"text", 'normal'::"text", 'longo'::"text"]))))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."pdp_badge_override" IS 'Override do Badge da PDP para este produto. Quando enabled=true, sobrescreve a configuração global. Estrutura: { enabled, label, tone, showIcon, position, offsetX, offsetY }';



COMMENT ON COLUMN "public"."products"."show_quick_summary" IS 'Controla a exibição da seção "Resumo rápido + CTA WhatsApp" na PDP. Padrão: desabilitado.';



CREATE TABLE IF NOT EXISTS "public"."profile_change_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "field" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "changed_by" "uuid",
    "changed_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_change_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "cep" "text",
    "city" "text",
    "state" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "last_success_at" timestamp with time zone,
    "failure_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."redirects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_path" "text" NOT NULL,
    "to_path" "text" NOT NULL,
    "status_code" integer DEFAULT 301 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "hits" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."redirects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reserved_slugs" (
    "slug" "text" NOT NULL
);


ALTER TABLE "public"."reserved_slugs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."review_import_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "import_batch_id" "uuid" NOT NULL,
    "feedback_id" "text" NOT NULL,
    "elo7_product_name" "text",
    "elo7_product_slug" "text",
    "elo7_image_url" "text",
    "elo7_comment" "text",
    "elo7_sentiment" "text",
    "elo7_review_date" timestamp with time zone,
    "elo7_buyer_name" "text",
    "elo7_raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "suggested_product_id" "uuid",
    "suggested_product_name" "text",
    "suggested_confidence" numeric,
    "suggested_method" "text",
    "manual_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "manual_product_id" "uuid",
    "visual_notes" "text",
    "reviewed_by" "uuid",
    "reviewed_by_email" "text",
    "reviewed_at" timestamp with time zone,
    "imported_review_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_import_audit_manual_status_check" CHECK (("manual_status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'doubtful'::"text", 'rejected'::"text", 'no_match'::"text"])))
);


ALTER TABLE "public"."review_import_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "uuid",
    "action" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_email" "text",
    "before" "jsonb",
    "after" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."search_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_boosts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "term" "text" NOT NULL,
    "term_normalized" "text" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "weight" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "campaign_label" "text"
);


ALTER TABLE "public"."search_boosts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_query_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "term_raw" "text" NOT NULL,
    "term_normalized" "text" NOT NULL,
    "result_count" integer DEFAULT 0 NOT NULL,
    "suggestion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."search_query_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."search_insights_summary" WITH ("security_invoker"='true') AS
 SELECT "search_query_log"."term_normalized",
    ("count"(*))::integer AS "total_searches",
    ("count"(*) FILTER (WHERE ("search_query_log"."result_count" = 0)))::integer AS "zero_result_count",
    "max"("search_query_log"."created_at") AS "last_searched_at",
    "max"("search_query_log"."suggestion") AS "last_suggestion"
   FROM "public"."search_query_log"
  WHERE ("search_query_log"."created_at" >= ("now"() - '90 days'::interval))
  GROUP BY "search_query_log"."term_normalized";


ALTER TABLE "public"."search_insights_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_synonyms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "canonical_term" "text" NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "boost_score" numeric DEFAULT 1.0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."search_synonyms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_scan_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'osv'::"text" NOT NULL,
    "trigger" "text" DEFAULT 'cron'::"text" NOT NULL,
    "status" "text" DEFAULT 'ok'::"text" NOT NULL,
    "packages_scanned" integer DEFAULT 0 NOT NULL,
    "total_findings" integer DEFAULT 0 NOT NULL,
    "critical_count" integer DEFAULT 0 NOT NULL,
    "high_count" integer DEFAULT 0 NOT NULL,
    "moderate_count" integer DEFAULT 0 NOT NULL,
    "low_count" integer DEFAULT 0 NOT NULL,
    "regression" boolean DEFAULT false NOT NULL,
    "alert_sent" boolean DEFAULT false NOT NULL,
    "alert_reason" "text",
    "findings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "high_regression" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."security_scan_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "image_url" "text",
    "meta_title" "text",
    "meta_description" "text",
    "h1_override" "text",
    "description_seo" "text",
    "is_indexed" boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "faqs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_draft" boolean DEFAULT true NOT NULL,
    "image_ref" "text"
);


ALTER TABLE "public"."segments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."segments"."is_draft" IS 'Rascunho. Só fica visível ao público (sitemap/SEO/listagens) quando is_draft=false AND is_indexed=true.';



CREATE TABLE IF NOT EXISTS "public"."seo_adaptive_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "memory_type" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "adaptive_score" numeric DEFAULT 0 NOT NULL,
    "resilience_score" numeric DEFAULT 0 NOT NULL,
    "saturation_score" numeric DEFAULT 0 NOT NULL,
    "volatility_score" numeric DEFAULT 0 NOT NULL,
    "sustainability_score" numeric DEFAULT 0 NOT NULL,
    "semantic_entropy" numeric DEFAULT 0 NOT NULL,
    "strategic_pressure" numeric DEFAULT 0 NOT NULL,
    "collapse_risk" numeric DEFAULT 0 NOT NULL,
    "recovery_potential" numeric DEFAULT 0 NOT NULL,
    "compounding_score" numeric DEFAULT 0 NOT NULL,
    "adaptation_velocity" numeric DEFAULT 0 NOT NULL,
    "semantic_drift" numeric DEFAULT 0 NOT NULL,
    "dependency_risk" numeric DEFAULT 0 NOT NULL,
    "intelligence_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "detected_patterns" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_adaptive_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_alert_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" NOT NULL,
    "target" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "extra" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "email_to" "text",
    "sent" boolean DEFAULT false NOT NULL,
    "outcome" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_alert_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_causality_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "text",
    "source_layer" "text",
    "affected_layers" "jsonb",
    "causality_strength" numeric,
    "propagation_depth" numeric,
    "propagation_risk" numeric,
    "description" "text"
);


ALTER TABLE "public"."seo_causality_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_check_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'cron'::"text" NOT NULL,
    "total" integer DEFAULT 0 NOT NULL,
    "passed" integer DEFAULT 0 NOT NULL,
    "errors" integer DEFAULT 0 NOT NULL,
    "warnings" integer DEFAULT 0 NOT NULL,
    "checks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "alert_sent" boolean DEFAULT false NOT NULL,
    "alert_error" "text"
);


ALTER TABLE "public"."seo_check_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_civilization_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "civilization_score" numeric DEFAULT 0 NOT NULL,
    "ecosystem_survivability" numeric DEFAULT 0 NOT NULL,
    "semantic_continuity" numeric DEFAULT 0 NOT NULL,
    "authority_legacy" numeric DEFAULT 0 NOT NULL,
    "strategic_longevity" numeric DEFAULT 0 NOT NULL,
    "operational_durability" numeric DEFAULT 0 NOT NULL,
    "systemic_resilience" numeric DEFAULT 0 NOT NULL,
    "semantic_stability" numeric DEFAULT 0 NOT NULL,
    "execution_sustainability" numeric DEFAULT 0 NOT NULL,
    "governance_stability" numeric DEFAULT 0 NOT NULL,
    "adaptive_evolution" numeric DEFAULT 0 NOT NULL,
    "entropy_absorption" numeric DEFAULT 0 NOT NULL,
    "collapse_resistance" numeric DEFAULT 0 NOT NULL,
    "recovery_persistence" numeric DEFAULT 0 NOT NULL,
    "strategic_memory_strength" numeric DEFAULT 0 NOT NULL,
    "continuity_depth" numeric DEFAULT 0 NOT NULL,
    "semantic_coherence" numeric DEFAULT 0 NOT NULL,
    "authority_distribution" numeric DEFAULT 0 NOT NULL,
    "systemic_harmony" numeric DEFAULT 0 NOT NULL,
    "long_term_compounding" numeric DEFAULT 0 NOT NULL,
    "existential_durability" numeric DEFAULT 0 NOT NULL,
    "civilization_integrity" numeric DEFAULT 0 NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."seo_civilization_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_cluster_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cluster_key" "text" NOT NULL,
    "snapshot_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_entities" integer DEFAULT 0 NOT NULL,
    "avg_authority" numeric DEFAULT 0 NOT NULL,
    "avg_readiness" numeric DEFAULT 0 NOT NULL,
    "avg_roi" numeric DEFAULT 0 NOT NULL,
    "avg_conversion" numeric DEFAULT 0 NOT NULL,
    "orphan_rate" numeric DEFAULT 0 NOT NULL,
    "concentration_risk" numeric DEFAULT 0 NOT NULL,
    "saturation_score" numeric DEFAULT 0 NOT NULL,
    "growth_velocity" numeric DEFAULT 0 NOT NULL,
    "decline_velocity" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_cluster_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_cognitive_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cognitive_stability_score" numeric DEFAULT 0 NOT NULL,
    "decision_synthesis_score" numeric DEFAULT 0 NOT NULL,
    "systemic_reasoning_score" numeric DEFAULT 0 NOT NULL,
    "strategic_signal_clarity" numeric DEFAULT 0 NOT NULL,
    "operational_signal_clarity" numeric DEFAULT 0 NOT NULL,
    "semantic_signal_clarity" numeric DEFAULT 0 NOT NULL,
    "authority_signal_clarity" numeric DEFAULT 0 NOT NULL,
    "orchestration_efficiency" numeric DEFAULT 0 NOT NULL,
    "orchestration_fragmentation" numeric DEFAULT 0 NOT NULL,
    "orchestration_noise" numeric DEFAULT 0 NOT NULL,
    "orchestration_alignment" numeric DEFAULT 0 NOT NULL,
    "orchestration_entropy" numeric DEFAULT 0 NOT NULL,
    "decision_confidence_score" numeric DEFAULT 0 NOT NULL,
    "decision_traceability_score" numeric DEFAULT 0 NOT NULL,
    "decision_conflict_score" numeric DEFAULT 0 NOT NULL,
    "decision_consistency_score" numeric DEFAULT 0 NOT NULL,
    "decision_latency_score" numeric DEFAULT 0 NOT NULL,
    "cognitive_load_score" numeric DEFAULT 0 NOT NULL,
    "strategic_confusion_score" numeric DEFAULT 0 NOT NULL,
    "semantic_confusion_score" numeric DEFAULT 0 NOT NULL,
    "authority_confusion_score" numeric DEFAULT 0 NOT NULL,
    "governance_confusion_score" numeric DEFAULT 0 NOT NULL,
    "cognitive_resilience_score" numeric DEFAULT 0 NOT NULL,
    "cognitive_decay_risk" numeric DEFAULT 0 NOT NULL,
    "orchestration_scalability_score" numeric DEFAULT 0 NOT NULL,
    "strategic_survival_projection" numeric DEFAULT 0 NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "blockers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."seo_cognitive_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_coherence_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conflict_type" "text",
    "source_layer" "text",
    "target_layer" "text",
    "coherence_loss" numeric,
    "systemic_impact" numeric,
    "contradiction_depth" numeric,
    "explanation" "text",
    "suggested_resolution" "text"
);


ALTER TABLE "public"."seo_coherence_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_coherence_matrix_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "coherence_matrix_score" integer,
    "systemic_coherence_score" integer,
    "strategic_alignment_score" integer,
    "cognitive_consistency_score" integer,
    "semantic_coherence_score" integer,
    "operational_alignment_score" integer,
    "governance_alignment_score" integer,
    "continuity_coherence_score" integer,
    "resilience_coherence_score" integer,
    "execution_coherence_score" integer,
    "strategic_misalignment_risk" integer,
    "semantic_divergence_risk" integer,
    "operational_dispersion_risk" integer,
    "governance_dissonance_risk" integer,
    "cognitive_fragmentation_risk" integer,
    "coherence_map" "jsonb",
    "alignment_matrix" "jsonb",
    "semantic_flow_map" "jsonb",
    "operational_dissonance_map" "jsonb",
    "resilience_alignment_map" "jsonb",
    "continuity_coherence_graph" "jsonb",
    "notes" "text",
    "snapshot_type" "text" DEFAULT 'manual'::"text" NOT NULL
);


ALTER TABLE "public"."seo_coherence_matrix_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_consciousness_fabric_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "strategic_consciousness_score" numeric,
    "cognitive_stability_score" numeric,
    "executive_awareness_score" numeric,
    "adaptive_maturity_score" numeric,
    "systemic_clarity_score" numeric,
    "operational_coherence_score" numeric,
    "longitudinal_consistency_score" numeric,
    "strategic_identity_score" numeric,
    "existential_stability_score" numeric,
    "evolutionary_awareness_score" numeric,
    "cognitive_fragmentation_score" numeric,
    "strategic_confusion_score" numeric,
    "executive_dissonance_score" numeric,
    "systemic_instability_score" numeric,
    "adaptive_regression_score" numeric,
    "dominant_pattern" "text",
    "dominant_instability" "text",
    "consciousness_verdict" "text",
    "notes" "text"
);


ALTER TABLE "public"."seo_consciousness_fabric_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_consciousness_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "consciousness_type" "text" NOT NULL,
    "entity_scope" "text",
    "awareness_score" numeric DEFAULT 0 NOT NULL,
    "systemic_coherence" numeric DEFAULT 0 NOT NULL,
    "semantic_consciousness" numeric DEFAULT 0 NOT NULL,
    "operational_consciousness" numeric DEFAULT 0 NOT NULL,
    "adaptive_consciousness" numeric DEFAULT 0 NOT NULL,
    "cognitive_load" numeric DEFAULT 0 NOT NULL,
    "cognitive_fatigue" numeric DEFAULT 0 NOT NULL,
    "semantic_alignment" numeric DEFAULT 0 NOT NULL,
    "strategic_clarity" numeric DEFAULT 0 NOT NULL,
    "systemic_instability" numeric DEFAULT 0 NOT NULL,
    "semantic_confusion" numeric DEFAULT 0 NOT NULL,
    "evolutionary_coherence" numeric DEFAULT 0 NOT NULL,
    "strategic_awareness" numeric DEFAULT 0 NOT NULL,
    "intelligence_density" numeric DEFAULT 0 NOT NULL,
    "entropy_pressure" numeric DEFAULT 0 NOT NULL,
    "collapse_awareness" numeric DEFAULT 0 NOT NULL,
    "resilience_awareness" numeric DEFAULT 0 NOT NULL,
    "meta_intelligence_score" numeric DEFAULT 0 NOT NULL,
    "consciousness_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "detected_signals" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "executive_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_consciousness_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_consolidation_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "compression_score" numeric,
    "observability_efficiency" numeric,
    "signal_noise_ratio" numeric,
    "executive_clarity_score" numeric,
    "systemic_complexity_score" numeric,
    "redundancy_score" numeric,
    "strategic_focus_score" numeric,
    "telemetry_entropy_score" numeric,
    "operational_noise_score" numeric,
    "executive_signal_quality" numeric,
    "consolidation_confidence" numeric,
    "notes" "text",
    "payload" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_consolidation_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_continuum_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "strategic_continuum_score" numeric,
    "continuity_strength_score" numeric,
    "operational_persistence_score" numeric,
    "semantic_continuity_score" numeric,
    "authority_continuity_score" numeric,
    "resilience_continuity_score" numeric,
    "execution_continuity_score" numeric,
    "strategic_longevity_score" numeric,
    "entropy_resistance_score" numeric,
    "systemic_persistence_score" numeric,
    "continuity_break_risk_score" numeric,
    "entropy_accumulation_score" numeric,
    "execution_decay_score" numeric,
    "semantic_instability_score" numeric,
    "authority_fragmentation_score" numeric,
    "dominant_continuity_signal" "text",
    "dominant_decay_signal" "text",
    "continuum_verdict" "text",
    "notes" "text"
);


ALTER TABLE "public"."seo_continuum_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_decision_lineage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decision_type" "text",
    "originating_engine" "text",
    "affected_engines" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "lineage_depth" numeric DEFAULT 0 NOT NULL,
    "confidence_score" numeric DEFAULT 0 NOT NULL,
    "conflict_probability" numeric DEFAULT 0 NOT NULL,
    "reasoning_chain" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "decision_summary" "text"
);


ALTER TABLE "public"."seo_decision_lineage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_engine_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "engine_a" "text" NOT NULL,
    "engine_b" "text" NOT NULL,
    "conflict_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'low'::"text" NOT NULL,
    "description" "text",
    "affected_entities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "resolution_suggestion" "text",
    "resolved" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."seo_engine_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_engine_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "engine_key" "text" NOT NULL,
    "engine_name" "text" NOT NULL,
    "domain" "text",
    "description" "text",
    "input_count" integer DEFAULT 0 NOT NULL,
    "output_count" integer DEFAULT 0 NOT NULL,
    "complexity_score" numeric DEFAULT 0 NOT NULL,
    "overlap_risk" numeric DEFAULT 0 NOT NULL,
    "confidence_score" numeric DEFAULT 0 NOT NULL,
    "maintenance_cost" numeric DEFAULT 0 NOT NULL,
    "deprecated" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_engine_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_entity_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "entity_slug" "text",
    "entity_name" "text",
    "authority_score" integer DEFAULT 0 NOT NULL,
    "maturity_score" integer DEFAULT 0 NOT NULL,
    "readiness_score" integer DEFAULT 0 NOT NULL,
    "topical_coverage" integer DEFAULT 0 NOT NULL,
    "internal_links_count" integer DEFAULT 0 NOT NULL,
    "reviews_count" integer DEFAULT 0 NOT NULL,
    "faq_count" integer DEFAULT 0 NOT NULL,
    "editorial_size" integer DEFAULT 0 NOT NULL,
    "semantic_connectivity" integer DEFAULT 0 NOT NULL,
    "orphan_risk" boolean DEFAULT false NOT NULL,
    "cannibalization_risk" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "thin_content_risk" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "snapshot_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_entity_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_execution_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "entity_slug" "text",
    "action_type" "text" NOT NULL,
    "description" "text",
    "impact_score" integer DEFAULT 0 NOT NULL,
    "performed_by" "uuid",
    "performed_by_email" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_execution_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_execution_orchestrator_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "execution_sustainability_score" numeric,
    "operational_rhythm_score" numeric,
    "strategic_focus_score" numeric,
    "compounding_leverage_score" numeric,
    "execution_overload_score" numeric,
    "maintenance_pressure_score" numeric,
    "recovery_capacity_score" numeric,
    "strategic_fatigue_score" numeric,
    "operational_drag_score" numeric,
    "execution_clarity_score" numeric,
    "queue_conflict_score" numeric,
    "cadence_stability_score" numeric,
    "notes" "text",
    "payload" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_execution_orchestrator_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_executive_core_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "executive_core_score" numeric,
    "systemic_strategy_score" numeric,
    "strategic_alignment_score" numeric,
    "execution_alignment_score" numeric,
    "operational_sustainability_score" numeric,
    "strategic_resilience_score" numeric,
    "systemic_stability_score" numeric,
    "orchestration_integrity_score" numeric,
    "intelligence_integrity_score" numeric,
    "governance_integrity_score" numeric,
    "semantic_integrity_score" numeric,
    "authority_integrity_score" numeric,
    "hidden_risk_score" numeric,
    "collapse_exposure_score" numeric,
    "strategic_fragility_score" numeric,
    "execution_fragility_score" numeric,
    "governance_fragility_score" numeric,
    "semantic_fragility_score" numeric,
    "long_term_viability_score" numeric,
    "strategic_continuity_score" numeric,
    "scalability_viability_score" numeric,
    "sustainability_projection_score" numeric,
    "future_collapse_probability" numeric,
    "strategic_signal_quality" numeric,
    "systemic_confidence_score" numeric,
    "decision_reliability_score" numeric,
    "coherence_depth_score" numeric,
    "explainability_depth_score" numeric,
    "executive_summary" "jsonb",
    "executive_priorities" "jsonb",
    "executive_risks" "jsonb",
    "executive_recommendations" "jsonb",
    "notes" "text"
);


ALTER TABLE "public"."seo_executive_core_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_executive_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operational_state" numeric DEFAULT 0 NOT NULL,
    "strategic_alignment" numeric DEFAULT 0 NOT NULL,
    "semantic_efficiency" numeric DEFAULT 0 NOT NULL,
    "execution_clarity" numeric DEFAULT 0 NOT NULL,
    "authority_resilience" numeric DEFAULT 0 NOT NULL,
    "systemic_entropy" numeric DEFAULT 0 NOT NULL,
    "cognitive_pressure" numeric DEFAULT 0 NOT NULL,
    "strategic_noise" numeric DEFAULT 0 NOT NULL,
    "semantic_decay" numeric DEFAULT 0 NOT NULL,
    "sustainability_score" numeric DEFAULT 0 NOT NULL,
    "adaptability_score" numeric DEFAULT 0 NOT NULL,
    "recovery_readiness" numeric DEFAULT 0 NOT NULL,
    "fragmentation_score" numeric DEFAULT 0 NOT NULL,
    "execution_fatigue" numeric DEFAULT 0 NOT NULL,
    "compounding_capacity" numeric DEFAULT 0 NOT NULL,
    "ecosystem_health" numeric DEFAULT 0 NOT NULL,
    "existential_stability" numeric DEFAULT 0 NOT NULL,
    "predictive_confidence" numeric DEFAULT 0 NOT NULL,
    "long_term_survival" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."seo_executive_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_final_governance_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "governance_maturity_score" numeric,
    "sustainable_complexity_score" numeric,
    "maintenance_liability_score" numeric,
    "documentation_reliability_score" numeric,
    "commercial_leverage_score" numeric,
    "performance_pressure_score" numeric,
    "cache_pressure_score" numeric,
    "operational_bloat_score" numeric,
    "simplification_backlog_score" numeric,
    "operational_sustainability_score" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."seo_final_governance_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_governance_matrix_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "governance_matrix_score" numeric,
    "strategic_integrity_score" numeric,
    "systemic_alignment_score" numeric,
    "operational_predictability_score" numeric,
    "autonomous_stability_score" numeric,
    "evolutionary_consistency_score" numeric,
    "governance_entropy_score" numeric,
    "strategic_cohesion_score" numeric,
    "execution_integrity_score" numeric,
    "resilience_projection_score" numeric,
    "collapse_exposure_score" numeric,
    "strategic_fragmentation_score" numeric,
    "operational_conflict_score" numeric,
    "semantic_drift_score" numeric,
    "executive_noise_score" numeric,
    "dominant_risk" "text",
    "dominant_strength" "text",
    "governance_verdict" "text",
    "notes" "text"
);


ALTER TABLE "public"."seo_governance_matrix_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_gsc_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "site_url" "text" NOT NULL,
    "page_type" "text" DEFAULT 'all'::"text" NOT NULL,
    "clicks" integer DEFAULT 0 NOT NULL,
    "impressions" integer DEFAULT 0 NOT NULL,
    "ctr" numeric DEFAULT 0 NOT NULL,
    "position" numeric DEFAULT 0 NOT NULL,
    "indexed_count" integer DEFAULT 0 NOT NULL,
    "excluded_count" integer DEFAULT 0 NOT NULL,
    "top_queries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "coverage_issues" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_gsc_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_integrity_grid_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "integrity_grid_score" integer,
    "executive_integrity_score" integer,
    "strategic_coherence_score" integer,
    "systemic_trust_score" integer,
    "semantic_integrity_score" integer,
    "continuity_integrity_score" integer,
    "operational_integrity_score" integer,
    "governance_integrity_score" integer,
    "resilience_integrity_score" integer,
    "convergence_integrity_score" integer,
    "hidden_fragmentation_risk" integer,
    "strategic_erosion_risk" integer,
    "semantic_confusion_risk" integer,
    "operational_conflict_risk" integer,
    "continuity_break_risk" integer,
    "integrity_matrix" "jsonb",
    "strategic_alignment_map" "jsonb",
    "semantic_integrity_map" "jsonb",
    "governance_conflicts" "jsonb",
    "resilience_distribution" "jsonb",
    "continuity_graph" "jsonb",
    "notes" "text",
    "snapshot_type" "text" DEFAULT 'manual'::"text" NOT NULL
);


ALTER TABLE "public"."seo_integrity_grid_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_kernel_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kernel_coherence" numeric DEFAULT 0 NOT NULL,
    "metric_redundancy" numeric DEFAULT 0 NOT NULL,
    "engine_overlap" numeric DEFAULT 0 NOT NULL,
    "explainability_score" numeric DEFAULT 0 NOT NULL,
    "observability_score" numeric DEFAULT 0 NOT NULL,
    "telemetry_quality" numeric DEFAULT 0 NOT NULL,
    "diagnostic_consistency" numeric DEFAULT 0 NOT NULL,
    "systemic_noise" numeric DEFAULT 0 NOT NULL,
    "operator_load" numeric DEFAULT 0 NOT NULL,
    "maintainability_score" numeric DEFAULT 0 NOT NULL,
    "tracing_coverage" numeric DEFAULT 0 NOT NULL,
    "lineage_integrity" numeric DEFAULT 0 NOT NULL,
    "confidence_integrity" numeric DEFAULT 0 NOT NULL,
    "normalization_health" numeric DEFAULT 0 NOT NULL,
    "orchestration_stability" numeric DEFAULT 0 NOT NULL,
    "architectural_entropy" numeric DEFAULT 0 NOT NULL,
    "operational_compression" numeric DEFAULT 0 NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."seo_kernel_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_meta_governance_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "governance_score" numeric DEFAULT 0 NOT NULL,
    "systemic_consistency" numeric DEFAULT 0 NOT NULL,
    "strategic_governability" numeric DEFAULT 0 NOT NULL,
    "operational_predictability" numeric DEFAULT 0 NOT NULL,
    "semantic_cohesion" numeric DEFAULT 0 NOT NULL,
    "authority_balance" numeric DEFAULT 0 NOT NULL,
    "ecosystem_integrity" numeric DEFAULT 0 NOT NULL,
    "resilience_continuity" numeric DEFAULT 0 NOT NULL,
    "contradiction_pressure" numeric DEFAULT 0 NOT NULL,
    "strategic_fragmentation" numeric DEFAULT 0 NOT NULL,
    "operational_noise" numeric DEFAULT 0 NOT NULL,
    "semantic_instability" numeric DEFAULT 0 NOT NULL,
    "authority_distortion" numeric DEFAULT 0 NOT NULL,
    "sustainability_continuity" numeric DEFAULT 0 NOT NULL,
    "adaptability_continuity" numeric DEFAULT 0 NOT NULL,
    "recovery_continuity" numeric DEFAULT 0 NOT NULL,
    "execution_continuity" numeric DEFAULT 0 NOT NULL,
    "long_horizon_survivability" numeric DEFAULT 0 NOT NULL,
    "systemic_trustworthiness" numeric DEFAULT 0 NOT NULL,
    "existential_stability" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."seo_meta_governance_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_meta_reasoning_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta_reasoning_score" numeric DEFAULT 0 NOT NULL,
    "strategic_self_awareness_score" numeric DEFAULT 0 NOT NULL,
    "systemic_reflection_score" numeric DEFAULT 0 NOT NULL,
    "cognitive_integrity_score" numeric DEFAULT 0 NOT NULL,
    "reasoning_stability_score" numeric DEFAULT 0 NOT NULL,
    "cross_layer_coherence" numeric DEFAULT 0 NOT NULL,
    "strategic_coherence" numeric DEFAULT 0 NOT NULL,
    "operational_coherence" numeric DEFAULT 0 NOT NULL,
    "semantic_coherence" numeric DEFAULT 0 NOT NULL,
    "authority_coherence" numeric DEFAULT 0 NOT NULL,
    "governance_coherence" numeric DEFAULT 0 NOT NULL,
    "reasoning_reliability_score" numeric DEFAULT 0 NOT NULL,
    "decision_reliability_score" numeric DEFAULT 0 NOT NULL,
    "strategic_confidence_score" numeric DEFAULT 0 NOT NULL,
    "forecast_reliability_score" numeric DEFAULT 0 NOT NULL,
    "traceability_integrity_score" numeric DEFAULT 0 NOT NULL,
    "reasoning_drift_score" numeric DEFAULT 0 NOT NULL,
    "strategic_drift_score" numeric DEFAULT 0 NOT NULL,
    "semantic_drift_score" numeric DEFAULT 0 NOT NULL,
    "operational_drift_score" numeric DEFAULT 0 NOT NULL,
    "governance_drift_score" numeric DEFAULT 0 NOT NULL,
    "cognitive_stability_score" numeric DEFAULT 0 NOT NULL,
    "orchestration_stability_score" numeric DEFAULT 0 NOT NULL,
    "consensus_stability_score" numeric DEFAULT 0 NOT NULL,
    "observability_stability_score" numeric DEFAULT 0 NOT NULL,
    "contradiction_risk_score" numeric DEFAULT 0 NOT NULL,
    "self_conflict_score" numeric DEFAULT 0 NOT NULL,
    "strategic_hallucination_risk" numeric DEFAULT 0 NOT NULL,
    "coherence_collapse_risk" numeric DEFAULT 0 NOT NULL,
    "long_term_reasoning_viability" numeric DEFAULT 0 NOT NULL,
    "strategic_survival_confidence" numeric DEFAULT 0 NOT NULL,
    "systemic_longevity_score" numeric DEFAULT 0 NOT NULL,
    "executive_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "blockers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."seo_meta_reasoning_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_metric_consistency" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_name" "text" NOT NULL,
    "source_engine" "text" NOT NULL,
    "normalized_value" numeric DEFAULT 0 NOT NULL,
    "raw_value" numeric DEFAULT 0 NOT NULL,
    "confidence_score" numeric DEFAULT 0 NOT NULL,
    "variance_score" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_metric_consistency" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_metric_lineage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_key" "text" NOT NULL,
    "depends_on" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "derived_from_engines" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "lineage_depth" integer DEFAULT 0 NOT NULL,
    "confidence" numeric DEFAULT 0 NOT NULL,
    "volatility" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_metric_lineage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_metric_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "metric_key" "text" NOT NULL,
    "metric_name" "text" NOT NULL,
    "domain" "text",
    "category" "text",
    "description" "text",
    "source_engine" "text",
    "calculation_type" "text",
    "scale_min" numeric DEFAULT 0 NOT NULL,
    "scale_max" numeric DEFAULT 100 NOT NULL,
    "is_normalized" boolean DEFAULT true NOT NULL,
    "confidence_weight" numeric DEFAULT 1 NOT NULL,
    "redundancy_group" "text",
    "canonical_metric" boolean DEFAULT false NOT NULL,
    "deprecated" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_metric_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_nervous_system_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "nervous_system_score" numeric DEFAULT 0 NOT NULL,
    "systemic_stability" numeric DEFAULT 0 NOT NULL,
    "operational_survival" numeric DEFAULT 0 NOT NULL,
    "strategic_fatigue" numeric DEFAULT 0 NOT NULL,
    "semantic_pressure" numeric DEFAULT 0 NOT NULL,
    "cognitive_efficiency" numeric DEFAULT 0 NOT NULL,
    "authority_dependence" numeric DEFAULT 0 NOT NULL,
    "cluster_fragility" numeric DEFAULT 0 NOT NULL,
    "execution_stability" numeric DEFAULT 0 NOT NULL,
    "entropy_resistance" numeric DEFAULT 0 NOT NULL,
    "semantic_resilience" numeric DEFAULT 0 NOT NULL,
    "strategic_resilience" numeric DEFAULT 0 NOT NULL,
    "operational_resilience" numeric DEFAULT 0 NOT NULL,
    "recovery_intelligence" numeric DEFAULT 0 NOT NULL,
    "adaptive_capacity" numeric DEFAULT 0 NOT NULL,
    "ecosystem_synchronization" numeric DEFAULT 0 NOT NULL,
    "semantic_saturation" numeric DEFAULT 0 NOT NULL,
    "existential_exposure" numeric DEFAULT 0 NOT NULL,
    "collapse_probability" numeric DEFAULT 0 NOT NULL,
    "sustainability_projection" numeric DEFAULT 0 NOT NULL,
    "long_term_viability" numeric DEFAULT 0 NOT NULL,
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."seo_nervous_system_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_nexus_convergence_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "convergence_score" numeric,
    "strategic_consistency_score" numeric,
    "temporal_coherence_score" numeric,
    "signal_integrity_score" numeric,
    "semantic_trust_score" numeric,
    "governance_confidence_score" numeric,
    "operational_stability_score" numeric,
    "causal_alignment_score" numeric,
    "entropy_resistance_score" numeric,
    "executive_clarity_score" numeric,
    "dominant_cluster" "text",
    "weakest_cluster" "text",
    "highest_risk_domain" "text",
    "strongest_domain" "text",
    "convergence_map" "jsonb" DEFAULT '{}'::"jsonb",
    "trust_matrix" "jsonb" DEFAULT '{}'::"jsonb",
    "causal_graph" "jsonb" DEFAULT '{}'::"jsonb",
    "strategic_conflicts" "jsonb" DEFAULT '[]'::"jsonb",
    "resilience_projection" "jsonb" DEFAULT '{}'::"jsonb",
    "continuity_projection" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    "snapshot_type" "text" DEFAULT 'manual'::"text" NOT NULL
);


ALTER TABLE "public"."seo_nexus_convergence_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_operating_fabric_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operating_fabric_score" numeric,
    "strategic_cohesion_score" numeric,
    "semantic_integrity_score" numeric,
    "authority_integrity_score" numeric,
    "governance_integrity_score" numeric,
    "resilience_integrity_score" numeric,
    "fragmentation_risk" numeric,
    "dependency_risk" numeric,
    "execution_pressure" numeric,
    "operational_debt" numeric,
    "scaling_risk" numeric,
    "systemic_complexity" numeric,
    "explainability_score" numeric,
    "observability_score" numeric,
    "consensus_score" numeric,
    "anomaly_pressure" numeric,
    "strategic_noise" numeric,
    "entropy_score" numeric,
    "scalability_projection" numeric,
    "future_stability_score" numeric,
    "sustainability_projection" numeric,
    "continuity_projection" numeric,
    "collapse_probability" numeric,
    "executive_summary" "jsonb",
    "strengths" "jsonb",
    "blockers" "jsonb",
    "recommendations" "jsonb",
    "notes" "text"
);


ALTER TABLE "public"."seo_operating_fabric_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_operational_reality_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "operational_value_score" numeric,
    "dashboard_utilization_score" numeric,
    "performance_pressure_score" numeric,
    "maintenance_burden_score" numeric,
    "documentation_health_score" numeric,
    "commercial_opportunity_score" numeric,
    "pruning_readiness_score" numeric,
    "complexity_cost_score" numeric,
    "human_operability_score" numeric,
    "sustainability_score" numeric,
    "governance_maturity_score" numeric,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_operational_reality_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_operational_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operational_score" numeric DEFAULT 0 NOT NULL,
    "execution_capacity" numeric DEFAULT 0 NOT NULL,
    "editorial_velocity" numeric DEFAULT 0 NOT NULL,
    "semantic_velocity" numeric DEFAULT 0 NOT NULL,
    "authority_velocity" numeric DEFAULT 0 NOT NULL,
    "recovery_capacity" numeric DEFAULT 0 NOT NULL,
    "risk_pressure" numeric DEFAULT 0 NOT NULL,
    "fragmentation_score" numeric DEFAULT 0 NOT NULL,
    "operational_debt" numeric DEFAULT 0 NOT NULL,
    "editorial_backlog" integer DEFAULT 0 NOT NULL,
    "thin_content_entities" integer DEFAULT 0 NOT NULL,
    "orphan_entities" integer DEFAULT 0 NOT NULL,
    "blocked_entities" integer DEFAULT 0 NOT NULL,
    "high_potential_entities" integer DEFAULT 0 NOT NULL,
    "strong_clusters" integer DEFAULT 0 NOT NULL,
    "weak_clusters" integer DEFAULT 0 NOT NULL,
    "collapsing_clusters" integer DEFAULT 0 NOT NULL,
    "saturation_pressure" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_operational_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_reasoning_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conflict_type" "text",
    "layer_a" "text",
    "layer_b" "text",
    "severity" "text",
    "reasoning_divergence" numeric DEFAULT 0 NOT NULL,
    "strategic_impact" numeric DEFAULT 0 NOT NULL,
    "description" "text",
    "mitigation" "text",
    "resolved" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."seo_reasoning_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_reasoning_drift_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "drift_type" "text",
    "affected_layer" "text",
    "severity" "text",
    "drift_score" numeric,
    "stability_impact" numeric,
    "contradiction_probability" numeric,
    "description" "text",
    "mitigation_strategy" "text",
    "resolved" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."seo_reasoning_drift_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_simulation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "simulation_name" "text" NOT NULL,
    "simulation_type" "text" NOT NULL,
    "scenario_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "input_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "simulation_inputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "predicted_authority" numeric DEFAULT 0 NOT NULL,
    "predicted_semantic_coverage" numeric DEFAULT 0 NOT NULL,
    "predicted_resilience" numeric DEFAULT 0 NOT NULL,
    "predicted_operational_load" numeric DEFAULT 0 NOT NULL,
    "predicted_execution_cost" numeric DEFAULT 0 NOT NULL,
    "predicted_growth_velocity" numeric DEFAULT 0 NOT NULL,
    "predicted_decay_risk" numeric DEFAULT 0 NOT NULL,
    "predicted_collapse_risk" numeric DEFAULT 0 NOT NULL,
    "predicted_saturation" numeric DEFAULT 0 NOT NULL,
    "predicted_roi" numeric DEFAULT 0 NOT NULL,
    "predicted_cluster_health" numeric DEFAULT 0 NOT NULL,
    "predicted_recovery_time" numeric DEFAULT 0 NOT NULL,
    "confidence_score" numeric DEFAULT 0 NOT NULL,
    "simulation_notes" "text"
);


ALTER TABLE "public"."seo_simulation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "domain" "text" DEFAULT 'emporiolelecute.com.br'::"text" NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organic_keywords" integer,
    "organic_traffic" integer,
    "organic_cost" numeric,
    "authority_score" integer,
    "backlinks_total" integer,
    "referring_domains" integer,
    "total_impressions" bigint,
    "total_clicks" bigint,
    "avg_position" numeric,
    "top_keywords" "jsonb" DEFAULT '[]'::"jsonb",
    "raw" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    CONSTRAINT "seo_snapshots_source_check" CHECK (("source" = ANY (ARRAY['semrush'::"text", 'gsc'::"text", 'aggregate'::"text"])))
);


ALTER TABLE "public"."seo_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_stability_fabric_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stability_fabric_score" numeric,
    "systemic_integrity_score" numeric,
    "executive_stability_score" numeric,
    "semantic_resilience_score" numeric,
    "operational_resilience_score" numeric,
    "consensus_integrity_score" numeric,
    "strategic_equilibrium_score" numeric,
    "degradation_resistance_score" numeric,
    "recovery_cohesion_score" numeric,
    "signal_stability_score" numeric,
    "silent_degradation_risk" numeric,
    "semantic_erosion_risk" numeric,
    "consensus_fragmentation_risk" numeric,
    "executive_instability_risk" numeric,
    "systemic_dispersion_risk" numeric,
    "degradation_map" "jsonb" DEFAULT '{}'::"jsonb",
    "equilibrium_matrix" "jsonb" DEFAULT '{}'::"jsonb",
    "resilience_projection" "jsonb" DEFAULT '{}'::"jsonb",
    "fragmentation_zones" "jsonb" DEFAULT '[]'::"jsonb",
    "stability_clusters" "jsonb" DEFAULT '[]'::"jsonb",
    "recovery_paths" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "snapshot_type" "text" DEFAULT 'manual'::"text" NOT NULL
);


ALTER TABLE "public"."seo_stability_fabric_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_strategic_reality_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "strategic_reality_score" numeric,
    "operational_truth_score" numeric,
    "semantic_grounding_score" numeric,
    "execution_credibility_score" numeric,
    "sustainability_realism_score" numeric,
    "resilience_realism_score" numeric,
    "systemic_truth_score" numeric,
    "long_term_viability_score" numeric,
    "strategic_authenticity_score" numeric,
    "signal_clarity_score" numeric,
    "illusion_risk_score" numeric,
    "strategic_self_deception_score" numeric,
    "semantic_distortion_score" numeric,
    "operational_fiction_score" numeric,
    "survivability_gap_score" numeric,
    "dominant_truth" "text",
    "dominant_distortion" "text",
    "reality_verdict" "text",
    "notes" "text"
);


ALTER TABLE "public"."seo_strategic_reality_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_strategy_alignment_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "strategy_layer" "text",
    "execution_layer" "text",
    "alignment_score" numeric,
    "divergence_score" numeric,
    "execution_gap_score" numeric,
    "confidence_score" numeric,
    "explanation" "text"
);


ALTER TABLE "public"."seo_strategy_alignment_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_strategy_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "snapshot_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "authority_score" numeric DEFAULT 0 NOT NULL,
    "readiness_score" numeric DEFAULT 0 NOT NULL,
    "semantic_coverage" numeric DEFAULT 0 NOT NULL,
    "business_intent_score" numeric DEFAULT 0 NOT NULL,
    "conversion_potential" numeric DEFAULT 0 NOT NULL,
    "editorial_depth" numeric DEFAULT 0 NOT NULL,
    "internal_link_strength" numeric DEFAULT 0 NOT NULL,
    "review_strength" numeric DEFAULT 0 NOT NULL,
    "decay_score" numeric DEFAULT 0 NOT NULL,
    "cannibalization_risk" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "regression_risk" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "strategic_value" numeric DEFAULT 0 NOT NULL,
    "execution_priority" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_strategy_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_strategy_simulations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "simulation_name" "text" NOT NULL,
    "simulation_type" "text" NOT NULL,
    "scenario_type" "text" NOT NULL,
    "entities" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "assumptions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "projected_authority" numeric DEFAULT 0 NOT NULL,
    "projected_readiness" numeric DEFAULT 0 NOT NULL,
    "projected_semantic_coverage" numeric DEFAULT 0 NOT NULL,
    "projected_revenue_intent" numeric DEFAULT 0 NOT NULL,
    "projected_cluster_growth" numeric DEFAULT 0 NOT NULL,
    "projected_risk" numeric DEFAULT 0 NOT NULL,
    "projected_operational_load" numeric DEFAULT 0 NOT NULL,
    "projected_execution_cost" numeric DEFAULT 0 NOT NULL,
    "projected_roi" numeric DEFAULT 0 NOT NULL,
    "projected_time_to_impact" integer DEFAULT 0 NOT NULL,
    "projected_decay_risk" numeric DEFAULT 0 NOT NULL,
    "projected_resilience" numeric DEFAULT 0 NOT NULL,
    "projected_sustainability" numeric DEFAULT 0 NOT NULL,
    "confidence_score" numeric DEFAULT 0 NOT NULL,
    "execution_complexity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "simulation_result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_strategy_simulations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_structural_dependencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dependency_type" "text",
    "source_engine" "text",
    "target_engine" "text",
    "dependency_strength" numeric,
    "fragility_score" numeric,
    "failure_impact" numeric,
    "cascading_risk" numeric,
    "mitigation_strategy" "text",
    "is_critical" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."seo_structural_dependencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_submission_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel" "text" NOT NULL,
    "status" "text" NOT NULL,
    "ok" boolean DEFAULT false NOT NULL,
    "url_count" integer DEFAULT 0 NOT NULL,
    "target" "text",
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seo_submission_log_channel_check" CHECK (("channel" = ANY (ARRAY['gsc'::"text", 'indexnow'::"text"])))
);


ALTER TABLE "public"."seo_submission_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_system_finalization_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "maintainability_score" integer,
    "operational_simplicity_score" integer,
    "telemetry_efficiency_score" integer,
    "executive_clarity_score" integer,
    "runtime_stability_score" integer,
    "governance_integrity_score" integer,
    "documentation_completeness_score" integer,
    "scalability_risk_score" integer,
    "operational_overload_score" integer,
    "observability_efficiency_score" integer,
    "performance_pressure_score" integer,
    "finalization_confidence_score" integer,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "signal_efficiency_score" integer,
    "telemetry_density_score" integer,
    "operational_drag_score" integer,
    "governance_overhead_score" integer,
    "dashboard_noise_score" integer,
    "dependency_complexity_score" integer,
    "strategic_friction_score" integer,
    "simplification_readiness_score" integer,
    "scalability_score" integer
);


ALTER TABLE "public"."seo_system_finalization_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_system_health_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "system_health_score" numeric DEFAULT 0 NOT NULL,
    "sustainability_score" numeric DEFAULT 0 NOT NULL,
    "execution_efficiency" numeric DEFAULT 0 NOT NULL,
    "semantic_efficiency" numeric DEFAULT 0 NOT NULL,
    "authority_efficiency" numeric DEFAULT 0 NOT NULL,
    "operational_waste" numeric DEFAULT 0 NOT NULL,
    "recovery_backlog" numeric DEFAULT 0 NOT NULL,
    "strategic_alignment" numeric DEFAULT 0 NOT NULL,
    "execution_focus" numeric DEFAULT 0 NOT NULL,
    "volatility_pressure" numeric DEFAULT 0 NOT NULL,
    "saturation_pressure" numeric DEFAULT 0 NOT NULL,
    "semantic_fragmentation" numeric DEFAULT 0 NOT NULL,
    "orphan_pressure" numeric DEFAULT 0 NOT NULL,
    "content_decay_pressure" numeric DEFAULT 0 NOT NULL,
    "competitive_pressure" numeric DEFAULT 0 NOT NULL,
    "system_resilience" numeric DEFAULT 0 NOT NULL,
    "cluster_stability" numeric DEFAULT 0 NOT NULL,
    "execution_noise" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."seo_system_health_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_systemic_risk_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "risk_type" "text",
    "affected_systems" "jsonb",
    "risk_severity" "text",
    "propagation_probability" numeric,
    "collapse_probability" numeric,
    "resilience_impact" numeric,
    "mitigation_complexity" numeric,
    "description" "text",
    "suggested_action" "text",
    "resolved" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."seo_systemic_risk_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_unified_bus_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operational_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "intelligence_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "governance_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "semantic_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "authority_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resilience_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "continuity_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "anomaly_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "explainability_signature" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "kernel_score" numeric DEFAULT 0 NOT NULL,
    "coherence_score" numeric DEFAULT 0 NOT NULL,
    "resilience_score" numeric DEFAULT 0 NOT NULL,
    "entropy_score" numeric DEFAULT 0 NOT NULL,
    "observability_score" numeric DEFAULT 0 NOT NULL,
    "anomaly_score" numeric DEFAULT 0 NOT NULL,
    "governance_score" numeric DEFAULT 0 NOT NULL,
    "system_consistency_score" numeric DEFAULT 0 NOT NULL,
    "future_viability_score" numeric DEFAULT 0 NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."seo_unified_bus_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_unified_nexus_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unified_nexus_score" numeric,
    "strategic_unification_score" numeric,
    "systemic_coherence_score" numeric,
    "operational_harmony_score" numeric,
    "semantic_alignment_score" numeric,
    "governance_stability_score" numeric,
    "resilience_unification_score" numeric,
    "continuity_alignment_score" numeric,
    "executive_clarity_score" numeric,
    "strategic_truth_score" numeric,
    "systemic_fragmentation_score" numeric,
    "strategic_instability_score" numeric,
    "semantic_divergence_score" numeric,
    "operational_disruption_score" numeric,
    "executive_entropy_score" numeric,
    "dominant_systemic_signal" "text",
    "dominant_systemic_risk" "text",
    "nexus_verdict" "text",
    "notes" "text"
);


ALTER TABLE "public"."seo_unified_nexus_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seo_url_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "url" "text" NOT NULL,
    "coverage_state" "text",
    "indexing_state" "text",
    "verdict" "text",
    "last_crawl_time" timestamp with time zone,
    "page_fetch_state" "text",
    "robots_txt_state" "text",
    "google_canonical" "text",
    "user_canonical" "text",
    "referring_urls" "jsonb",
    "raw" "jsonb",
    "checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_issue" boolean DEFAULT false NOT NULL,
    "alerted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."seo_url_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "destination_zip" "text",
    "cart_snapshot" "jsonb",
    "provider_name" "text",
    "error_message" "text",
    "http_status" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_type" "text" DEFAULT 'provider_error'::"text" NOT NULL,
    "total_weight_kg" numeric,
    "melhor_envio_has_key" boolean,
    "estimated" boolean
);


ALTER TABLE "public"."shipping_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_name" "text" NOT NULL,
    "provider_code" "text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "api_key" "text",
    "api_secret" "text",
    "endpoint_url" "text",
    "config_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shipping_providers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_quote_cache" (
    "cache_key" "text" NOT NULL,
    "options" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shipping_quote_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_name" "text" NOT NULL,
    "condition_type" "public"."shipping_condition_type" NOT NULL,
    "condition_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "discount_type" "public"."shipping_discount_type" NOT NULL,
    "discount_value" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shipping_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shipping_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "origin_zip_code" "text" DEFAULT ''::"text" NOT NULL,
    "default_box_weight_kg" numeric DEFAULT 0.150 NOT NULL,
    "default_box_length_cm" numeric DEFAULT 16 NOT NULL,
    "default_box_width_cm" numeric DEFAULT 11 NOT NULL,
    "default_box_height_cm" numeric DEFAULT 6 NOT NULL,
    "handling_fee" numeric DEFAULT 0 NOT NULL,
    "shipping_markup_percentage" numeric DEFAULT 0 NOT NULL,
    "singleton" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "free_shipping_threshold" numeric DEFAULT 299 NOT NULL,
    "pickup_enabled" boolean DEFAULT false NOT NULL,
    "pickup_label" "text" DEFAULT 'Retirada no ateliê'::"text" NOT NULL,
    "pickup_address" "text" DEFAULT ''::"text" NOT NULL,
    "pickup_instructions" "text" DEFAULT ''::"text" NOT NULL,
    "free_shipping_enabled" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."shipping_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_proof_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "initial_delay_ms" integer DEFAULT 6000 NOT NULL,
    "visible_ms" integer DEFAULT 9000 NOT NULL,
    "interval_ms" integer DEFAULT 18000 NOT NULL,
    "position" "text" DEFAULT 'bottom-left'::"text" NOT NULL,
    "show_on_mobile" boolean DEFAULT true NOT NULL,
    "show_on_desktop" boolean DEFAULT true NOT NULL,
    "min_rating" integer DEFAULT 4 NOT NULL,
    "pool_size" integer DEFAULT 60 NOT NULL,
    "require_verified" boolean DEFAULT false NOT NULL,
    "excluded_paths" "text"[] DEFAULT ARRAY['/admin'::"text", '/acesso-restrito'::"text", '/rastrear'::"text"] NOT NULL,
    "included_paths" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "dismiss_persistence" "text" DEFAULT 'session'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_proof_dismiss_valid" CHECK (("dismiss_persistence" = ANY (ARRAY['session'::"text", 'never'::"text"]))),
    CONSTRAINT "social_proof_position_valid" CHECK (("position" = ANY (ARRAY['bottom-left'::"text", 'bottom-right'::"text", 'top-left'::"text", 'top-right'::"text"]))),
    CONSTRAINT "social_proof_singleton" CHECK (("id" = true))
);


ALTER TABLE "public"."social_proof_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stale_bundle_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "route" "text",
    "message" "text",
    "stack" "text",
    "user_agent" "text",
    "reloaded" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."stale_bundle_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."store_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."store_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "position" integer DEFAULT 0 NOT NULL,
    "external_ref" "text" NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."taxonomy_registry" WITH ("security_invoker"='true') AS
 SELECT 'category'::"text" AS "type",
    "c"."id",
    "c"."slug",
    "c"."name",
    ('/categoria/'::"text" || "c"."slug") AS "canonical_path",
    COALESCE("c"."is_indexed", true) AS "is_indexed",
    COALESCE("c"."position", 0) AS "position",
    "c"."image_url"
   FROM "public"."categories" "c"
UNION ALL
 SELECT 'occasion'::"text" AS "type",
    "o"."id",
    "o"."slug",
    "o"."name",
    ('/ocasiao/'::"text" || "o"."slug") AS "canonical_path",
    COALESCE("o"."is_indexed", true) AS "is_indexed",
    COALESCE("o"."position", 0) AS "position",
    "o"."image_url"
   FROM "public"."occasions" "o"
UNION ALL
 SELECT 'segment'::"text" AS "type",
    "s"."id",
    "s"."slug",
    "s"."name",
    ('/segmento/'::"text" || "s"."slug") AS "canonical_path",
    COALESCE("s"."is_indexed", true) AS "is_indexed",
    COALESCE("s"."position", 0) AS "position",
    "s"."image_url"
   FROM "public"."segments" "s"
UNION ALL
 SELECT 'tag'::"text" AS "type",
    "t"."id",
    "t"."slug",
    "t"."name",
    ('/tag/'::"text" || "t"."slug") AS "canonical_path",
    false AS "is_indexed",
    COALESCE("t"."position", 0) AS "position",
    NULL::"text" AS "image_url"
   FROM "public"."tags" "t";


ALTER TABLE "public"."taxonomy_registry" OWNER TO "postgres";


COMMENT ON VIEW "public"."taxonomy_registry" IS 'Fase 6 — Registro unificado de taxonomias (category/occasion/segment/tag) com canonical_path. Use como única fonte de verdade para menus, sitemap e breadcrumbs.';



CREATE TABLE IF NOT EXISTS "public"."telemetry_alert_state" (
    "id" "text" NOT NULL,
    "last_alert_at" timestamp with time zone,
    "last_count" integer,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telemetry_alert_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."testimonials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_text" "text" NOT NULL,
    "product_name" "text",
    "occasion" "text",
    "rating" integer DEFAULT 5 NOT NULL,
    "testimonial_date" "date",
    "position" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."testimonials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."theme_hubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "tag_id" "uuid",
    "intro" "text",
    "editorial_content" "text",
    "hero_image_url" "text",
    "meta_title" "text",
    "meta_description" "text",
    "faqs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "related_themes" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "related_occasions" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "related_segments" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "related_posts" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "is_approved" boolean DEFAULT false NOT NULL,
    "is_indexed" boolean DEFAULT false NOT NULL,
    "authority_score" integer DEFAULT 0 NOT NULL,
    "thin_content_risk" boolean DEFAULT true NOT NULL,
    "cannibalization_risk" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "discovery_status" "text" DEFAULT 'candidate'::"text" NOT NULL,
    "last_evaluated_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "readiness_score" integer DEFAULT 0 NOT NULL,
    "topical_coverage" integer DEFAULT 0 NOT NULL,
    "internal_links_count" integer DEFAULT 0 NOT NULL,
    "last_authority_refresh" timestamp with time zone,
    "authority_manipulation" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."theme_hubs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracking_email_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_code" "text" NOT NULL,
    "email_type" "text" DEFAULT 'status_update'::"text" NOT NULL,
    "new_status" "text",
    "recipient_email" "text",
    "tracking_code" "text",
    "tracking_carrier" "text",
    "tracking_url" "text",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    "error_message" "text",
    "triggered_by" "uuid",
    "triggered_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tracking_email_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'user'::"public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitor_pageviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "session_id" "uuid",
    "path" "text" NOT NULL,
    "title" "text",
    "product_id" "uuid",
    "referrer" "text",
    "time_on_page_seconds" integer DEFAULT 0 NOT NULL,
    "scroll_depth_pct" integer,
    "viewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "step_index" integer,
    "from_path" "text",
    "cta_id" "text",
    "event_type" "text" DEFAULT 'pageview'::"text" NOT NULL
);


ALTER TABLE "public"."visitor_pageviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitor_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visitor_id" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "duration_seconds" integer DEFAULT 0 NOT NULL,
    "pages_count" integer DEFAULT 0 NOT NULL,
    "ip" "inet",
    "landing_path" "text",
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."visitor_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_vitals_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text" NOT NULL,
    "base_url" "text",
    "notes" "text",
    "pages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_vitals_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wishlist_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "title" "text",
    "is_public" boolean DEFAULT true NOT NULL,
    "product_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wishlist_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wishlists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "personalization" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."wishlists" OWNER TO "postgres";


ALTER TABLE ONLY "public"."access_request_notifications"
    ADD CONSTRAINT "access_request_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_access_requests"
    ADD CONSTRAINT "admin_access_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_usage_aggregates"
    ADD CONSTRAINT "admin_usage_aggregates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."catalog_security_approvals"
    ADD CONSTRAINT "catalog_security_approvals_pkey" PRIMARY KEY ("scan_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."collection_products"
    ADD CONSTRAINT "collection_products_pkey" PRIMARY KEY ("collection_id", "product_id");



ALTER TABLE ONLY "public"."collections"
    ADD CONSTRAINT "collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collections"
    ADD CONSTRAINT "collections_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."combination_pages_registry"
    ADD CONSTRAINT "combination_pages_registry_path_key" UNIQUE ("path");



ALTER TABLE ONLY "public"."combination_pages_registry"
    ADD CONSTRAINT "combination_pages_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_migration_audit"
    ADD CONSTRAINT "contact_migration_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cookie_consent_config"
    ADD CONSTRAINT "cookie_consent_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cookie_consents"
    ADD CONSTRAINT "cookie_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupon_uses"
    ADD CONSTRAINT "coupon_uses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_deletion_requests"
    ADD CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faqs"
    ADD CONSTRAINT "faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hero_slides"
    ADD CONSTRAINT "hero_slides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_section_audit"
    ADD CONSTRAINT "home_section_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_sections"
    ADD CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_sections"
    ADD CONSTRAINT "home_sections_section_key_key" UNIQUE ("section_key");



ALTER TABLE ONLY "public"."homepage_blocks"
    ADD CONSTRAINT "homepage_blocks_block_key_key" UNIQUE ("block_key");



ALTER TABLE ONLY "public"."homepage_blocks"
    ADD CONSTRAINT "homepage_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."image_processing_jobs"
    ADD CONSTRAINT "image_processing_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_embed_failures"
    ADD CONSTRAINT "instagram_embed_failures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_feed_embeds"
    ADD CONSTRAINT "instagram_feed_embeds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_post_attempts"
    ADD CONSTRAINT "instagram_post_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_posts"
    ADD CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instagram_sync_history"
    ADD CONSTRAINT "instagram_sync_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_function_secrets"
    ADD CONSTRAINT "internal_function_secrets_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."kit_products"
    ADD CONSTRAINT "kit_products_kit_id_product_id_key" UNIQUE ("kit_id", "product_id");



ALTER TABLE ONLY "public"."kit_products"
    ADD CONSTRAINT "kit_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kits"
    ADD CONSTRAINT "kits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kits"
    ADD CONSTRAINT "kits_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_bucket_path_uniq" UNIQUE ("bucket", "storage_path");



ALTER TABLE ONLY "public"."media_assets"
    ADD CONSTRAINT "media_assets_pkey" PRIMARY KEY ("img_ref");



ALTER TABLE ONLY "public"."media_audit_runs"
    ADD CONSTRAINT "media_audit_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_backup_runs"
    ADD CONSTRAINT "media_backup_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchant_feed_snapshots"
    ADD CONSTRAINT "merchant_feed_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."occasion_landings"
    ADD CONSTRAINT "occasion_landings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."occasion_landings"
    ADD CONSTRAINT "occasion_landings_route_slug_key" UNIQUE ("route_slug");



ALTER TABLE ONLY "public"."occasions"
    ADD CONSTRAINT "occasions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."occasions"
    ADD CONSTRAINT "occasions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."occasions"
    ADD CONSTRAINT "occasions_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."operational_settings"
    ADD CONSTRAINT "operational_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."operational_worker_credentials"
    ADD CONSTRAINT "operational_worker_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_notifications"
    ADD CONSTRAINT "order_status_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_code_key" UNIQUE ("order_code");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_versions"
    ADD CONSTRAINT "page_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payment_events"
    ADD CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pdp_badge_events"
    ADD CONSTRAINT "pdp_badge_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pdp_funnel_events"
    ADD CONSTRAINT "pdp_funnel_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pdp_section_audit"
    ADD CONSTRAINT "pdp_section_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pdp_sections"
    ADD CONSTRAINT "pdp_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pdp_sections"
    ADD CONSTRAINT "pdp_sections_section_key_key" UNIQUE ("section_key");



ALTER TABLE ONLY "public"."product_faqs"
    ADD CONSTRAINT "product_faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_occasions"
    ADD CONSTRAINT "product_occasions_pkey" PRIMARY KEY ("product_id", "occasion_id");



ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_segments"
    ADD CONSTRAINT "product_segments_pkey" PRIMARY KEY ("product_id", "segment_id");



ALTER TABLE ONLY "public"."product_slugs"
    ADD CONSTRAINT "product_slugs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_pkey" PRIMARY KEY ("product_id", "tag_id");



ALTER TABLE ONLY "public"."product_versions"
    ADD CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profile_change_audit"
    ADD CONSTRAINT "profile_change_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."redirects"
    ADD CONSTRAINT "redirects_from_path_key" UNIQUE ("from_path");



ALTER TABLE ONLY "public"."redirects"
    ADD CONSTRAINT "redirects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reserved_slugs"
    ADD CONSTRAINT "reserved_slugs_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."review_import_audit"
    ADD CONSTRAINT "review_import_audit_feedback_id_key" UNIQUE ("feedback_id");



ALTER TABLE ONLY "public"."review_import_audit"
    ADD CONSTRAINT "review_import_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_promotion_audit"
    ADD CONSTRAINT "role_promotion_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_audit_log"
    ADD CONSTRAINT "search_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_boosts"
    ADD CONSTRAINT "search_boosts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_boosts"
    ADD CONSTRAINT "search_boosts_term_normalized_product_id_key" UNIQUE ("term_normalized", "product_id");



ALTER TABLE ONLY "public"."search_query_log"
    ADD CONSTRAINT "search_query_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_synonyms"
    ADD CONSTRAINT "search_synonyms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_scan_runs"
    ADD CONSTRAINT "security_scan_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."segments"
    ADD CONSTRAINT "segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."segments"
    ADD CONSTRAINT "segments_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."seo_adaptive_memory"
    ADD CONSTRAINT "seo_adaptive_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_alert_log"
    ADD CONSTRAINT "seo_alert_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_causality_registry"
    ADD CONSTRAINT "seo_causality_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_check_runs"
    ADD CONSTRAINT "seo_check_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_civilization_snapshots"
    ADD CONSTRAINT "seo_civilization_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_cluster_memory"
    ADD CONSTRAINT "seo_cluster_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_cognitive_snapshots"
    ADD CONSTRAINT "seo_cognitive_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_coherence_conflicts"
    ADD CONSTRAINT "seo_coherence_conflicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_coherence_matrix_snapshots"
    ADD CONSTRAINT "seo_coherence_matrix_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_consciousness_fabric_snapshots"
    ADD CONSTRAINT "seo_consciousness_fabric_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_consciousness_memory"
    ADD CONSTRAINT "seo_consciousness_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_consolidation_snapshots"
    ADD CONSTRAINT "seo_consolidation_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_continuum_snapshots"
    ADD CONSTRAINT "seo_continuum_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_decision_lineage"
    ADD CONSTRAINT "seo_decision_lineage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_engine_conflicts"
    ADD CONSTRAINT "seo_engine_conflicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_engine_registry"
    ADD CONSTRAINT "seo_engine_registry_engine_key_key" UNIQUE ("engine_key");



ALTER TABLE ONLY "public"."seo_engine_registry"
    ADD CONSTRAINT "seo_engine_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_entity_snapshots"
    ADD CONSTRAINT "seo_entity_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_execution_log"
    ADD CONSTRAINT "seo_execution_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_execution_orchestrator_snapshots"
    ADD CONSTRAINT "seo_execution_orchestrator_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_executive_core_snapshots"
    ADD CONSTRAINT "seo_executive_core_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_executive_snapshots"
    ADD CONSTRAINT "seo_executive_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_final_governance_snapshots"
    ADD CONSTRAINT "seo_final_governance_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_governance_matrix_snapshots"
    ADD CONSTRAINT "seo_governance_matrix_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_gsc_snapshots"
    ADD CONSTRAINT "seo_gsc_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_gsc_snapshots"
    ADD CONSTRAINT "seo_gsc_snapshots_snapshot_date_site_url_page_type_key" UNIQUE ("snapshot_date", "site_url", "page_type");



ALTER TABLE ONLY "public"."seo_integrity_grid_snapshots"
    ADD CONSTRAINT "seo_integrity_grid_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_kernel_snapshots"
    ADD CONSTRAINT "seo_kernel_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_meta_governance_snapshots"
    ADD CONSTRAINT "seo_meta_governance_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_meta_reasoning_snapshots"
    ADD CONSTRAINT "seo_meta_reasoning_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_metric_consistency"
    ADD CONSTRAINT "seo_metric_consistency_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_metric_lineage"
    ADD CONSTRAINT "seo_metric_lineage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_metric_registry"
    ADD CONSTRAINT "seo_metric_registry_metric_key_key" UNIQUE ("metric_key");



ALTER TABLE ONLY "public"."seo_metric_registry"
    ADD CONSTRAINT "seo_metric_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_nervous_system_snapshots"
    ADD CONSTRAINT "seo_nervous_system_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_nexus_convergence_snapshots"
    ADD CONSTRAINT "seo_nexus_convergence_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_operating_fabric_snapshots"
    ADD CONSTRAINT "seo_operating_fabric_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_operational_reality_snapshots"
    ADD CONSTRAINT "seo_operational_reality_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_operational_snapshots"
    ADD CONSTRAINT "seo_operational_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_reasoning_conflicts"
    ADD CONSTRAINT "seo_reasoning_conflicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_reasoning_drift_registry"
    ADD CONSTRAINT "seo_reasoning_drift_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_simulation_runs"
    ADD CONSTRAINT "seo_simulation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_snapshots"
    ADD CONSTRAINT "seo_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_stability_fabric_snapshots"
    ADD CONSTRAINT "seo_stability_fabric_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_strategic_reality_snapshots"
    ADD CONSTRAINT "seo_strategic_reality_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_strategy_alignment_registry"
    ADD CONSTRAINT "seo_strategy_alignment_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_strategy_memory"
    ADD CONSTRAINT "seo_strategy_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_strategy_simulations"
    ADD CONSTRAINT "seo_strategy_simulations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_structural_dependencies"
    ADD CONSTRAINT "seo_structural_dependencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_submission_log"
    ADD CONSTRAINT "seo_submission_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_system_finalization_snapshots"
    ADD CONSTRAINT "seo_system_finalization_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_system_health_snapshots"
    ADD CONSTRAINT "seo_system_health_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_systemic_risk_registry"
    ADD CONSTRAINT "seo_systemic_risk_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_unified_bus_snapshots"
    ADD CONSTRAINT "seo_unified_bus_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_unified_nexus_snapshots"
    ADD CONSTRAINT "seo_unified_nexus_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seo_url_status"
    ADD CONSTRAINT "seo_url_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_audit_logs"
    ADD CONSTRAINT "shipping_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_providers"
    ADD CONSTRAINT "shipping_providers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_providers"
    ADD CONSTRAINT "shipping_providers_provider_code_key" UNIQUE ("provider_code");



ALTER TABLE ONLY "public"."shipping_quote_cache"
    ADD CONSTRAINT "shipping_quote_cache_pkey" PRIMARY KEY ("cache_key");



ALTER TABLE ONLY "public"."shipping_rules"
    ADD CONSTRAINT "shipping_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_settings"
    ADD CONSTRAINT "shipping_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shipping_settings"
    ADD CONSTRAINT "shipping_settings_singleton_key" UNIQUE ("singleton");



ALTER TABLE ONLY "public"."social_proof_settings"
    ADD CONSTRAINT "social_proof_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stale_bundle_logs"
    ADD CONSTRAINT "stale_bundle_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."store_settings"
    ADD CONSTRAINT "store_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."store_settings"
    ADD CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."telemetry_alert_state"
    ADD CONSTRAINT "telemetry_alert_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."testimonials"
    ADD CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."theme_hubs"
    ADD CONSTRAINT "theme_hubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."theme_hubs"
    ADD CONSTRAINT "theme_hubs_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."tracking_email_log"
    ADD CONSTRAINT "tracking_email_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."visitor_pageviews"
    ADD CONSTRAINT "visitor_pageviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitor_sessions"
    ADD CONSTRAINT "visitor_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitors"
    ADD CONSTRAINT "visitors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visitors"
    ADD CONSTRAINT "visitors_visitor_id_key" UNIQUE ("visitor_id");



ALTER TABLE ONLY "public"."web_vitals_reports"
    ADD CONSTRAINT "web_vitals_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist_shares"
    ADD CONSTRAINT "wishlist_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlist_shares"
    ADD CONSTRAINT "wishlist_shares_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."wishlist_shares"
    ADD CONSTRAINT "wishlist_shares_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_user_id_product_id_key" UNIQUE ("user_id", "product_id");



CREATE INDEX "admin_access_requests_email_idx" ON "public"."admin_access_requests" USING "btree" ("lower"("user_email_snapshot"));



CREATE UNIQUE INDEX "admin_access_requests_one_pending" ON "public"."admin_access_requests" USING "btree" ("user_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "admin_access_requests_requested_at_idx" ON "public"."admin_access_requests" USING "btree" ("requested_at" DESC);



CREATE INDEX "admin_access_requests_status_requested_idx" ON "public"."admin_access_requests" USING "btree" ("status", "requested_at" DESC);



CREATE INDEX "admin_access_requests_user_idx" ON "public"."admin_access_requests" USING "btree" ("user_id", "requested_at" DESC);



CREATE INDEX "admin_audit_timeline_created_at_idx" ON "public"."admin_audit_timeline" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "admin_audit_timeline_pk" ON "public"."admin_audit_timeline" USING "btree" ("source", "event_id");



CREATE INDEX "admin_audit_timeline_source_idx" ON "public"."admin_audit_timeline" USING "btree" ("source");



CREATE INDEX "admin_audit_timeline_status_idx" ON "public"."admin_audit_timeline" USING "btree" ("status");



CREATE INDEX "admin_audit_timeline_target_email_idx" ON "public"."admin_audit_timeline" USING "btree" ("lower"("target_email"));



CREATE INDEX "admin_audit_timeline_target_user_idx" ON "public"."admin_audit_timeline" USING "btree" ("target_user_id");



CREATE INDEX "admin_usage_aggregates_received_idx" ON "public"."admin_usage_aggregates" USING "btree" ("received_at" DESC);



CREATE INDEX "admin_usage_aggregates_session_idx" ON "public"."admin_usage_aggregates" USING "btree" ("session_id");



CREATE UNIQUE INDEX "categories_external_ref_key" ON "public"."categories" USING "btree" ("external_ref");



CREATE INDEX "cookie_consents_visitor_idx" ON "public"."cookie_consents" USING "btree" ("visitor_id", "created_at" DESC);



CREATE UNIQUE INDEX "customers_email_uniq" ON "public"."customers" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE INDEX "customers_name_trgm" ON "public"."customers" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "customers_phone_idx" ON "public"."customers" USING "btree" ("phone") WHERE ("phone" IS NOT NULL);



CREATE INDEX "customers_whatsapp_idx" ON "public"."customers" USING "btree" ("whatsapp") WHERE ("whatsapp" IS NOT NULL);



CREATE INDEX "idx_arn_created_at" ON "public"."access_request_notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_arn_requester_email" ON "public"."access_request_notifications" USING "btree" ("requester_email");



CREATE INDEX "idx_blog_posts_featured" ON "public"."blog_posts" USING "btree" ("featured") WHERE ("featured" = true);



CREATE INDEX "idx_blog_posts_published" ON "public"."blog_posts" USING "btree" ("is_published", "published_at" DESC);



CREATE INDEX "idx_blog_posts_slug" ON "public"."blog_posts" USING "btree" ("slug");



CREATE INDEX "idx_categories_is_indexed" ON "public"."categories" USING "btree" ("is_indexed");



CREATE INDEX "idx_categories_position" ON "public"."categories" USING "btree" ("position");



CREATE INDEX "idx_categories_public_visible" ON "public"."categories" USING "btree" ("position") WHERE (("is_draft" = false) AND ("is_indexed" = true));



CREATE INDEX "idx_civilization_snapshots_created_at" ON "public"."seo_civilization_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_civilization_snapshots_score" ON "public"."seo_civilization_snapshots" USING "btree" ("civilization_score");



CREATE INDEX "idx_civilization_snapshots_survivability" ON "public"."seo_civilization_snapshots" USING "btree" ("ecosystem_survivability");



CREATE INDEX "idx_collection_products_collection" ON "public"."collection_products" USING "btree" ("collection_id", "position");



CREATE INDEX "idx_collection_products_product" ON "public"."collection_products" USING "btree" ("product_id");



CREATE INDEX "idx_combo_pages_indexable" ON "public"."combination_pages_registry" USING "btree" ("is_indexable");



CREATE INDEX "idx_combo_pages_path" ON "public"."combination_pages_registry" USING "btree" ("path");



CREATE INDEX "idx_contact_migration_audit_created" ON "public"."contact_migration_audit" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_contact_migration_audit_email" ON "public"."contact_migration_audit" USING "btree" ("lower"("target_email"));



CREATE INDEX "idx_cpr_auto_discovered" ON "public"."combination_pages_registry" USING "btree" ("auto_discovered");



CREATE INDEX "idx_cpr_confidence_score" ON "public"."combination_pages_registry" USING "btree" ("confidence_score");



CREATE INDEX "idx_cpr_discovery_status" ON "public"."combination_pages_registry" USING "btree" ("discovery_status");



CREATE INDEX "idx_cpr_generated_slug" ON "public"."combination_pages_registry" USING "btree" ("generated_slug");



CREATE INDEX "idx_cpr_quality_score" ON "public"."combination_pages_registry" USING "btree" ("quality_score");



CREATE INDEX "idx_customers_city_lower" ON "public"."customers" USING "btree" ("lower"("city"));



CREATE INDEX "idx_customers_email_lower" ON "public"."customers" USING "btree" ("lower"("email"));



CREATE INDEX "idx_customers_name_lower" ON "public"."customers" USING "btree" ("lower"("name"));



CREATE INDEX "idx_customers_phone_digits" ON "public"."customers" USING "btree" ("public"."normalize_phone_digits"("phone"));



CREATE INDEX "idx_customers_whatsapp_digits" ON "public"."customers" USING "btree" ("public"."normalize_phone_digits"("whatsapp"));



CREATE INDEX "idx_ddr_email" ON "public"."data_deletion_requests" USING "btree" ("lower"("email"));



CREATE INDEX "idx_ddr_status" ON "public"."data_deletion_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_drift_layer" ON "public"."seo_reasoning_drift_registry" USING "btree" ("affected_layer");



CREATE INDEX "idx_drift_resolved" ON "public"."seo_reasoning_drift_registry" USING "btree" ("resolved");



CREATE INDEX "idx_drift_severity" ON "public"."seo_reasoning_drift_registry" USING "btree" ("severity");



CREATE INDEX "idx_drift_type" ON "public"."seo_reasoning_drift_registry" USING "btree" ("drift_type");



CREATE INDEX "idx_finalization_snap_clarity" ON "public"."seo_system_finalization_snapshots" USING "btree" ("executive_clarity_score");



CREATE INDEX "idx_finalization_snap_created_at" ON "public"."seo_system_finalization_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_finalization_snap_maint" ON "public"."seo_system_finalization_snapshots" USING "btree" ("maintainability_score");



CREATE INDEX "idx_home_section_audit_created" ON "public"."home_section_audit" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_home_section_audit_section" ON "public"."home_section_audit" USING "btree" ("section_key", "created_at" DESC);



CREATE INDEX "idx_home_sections_position" ON "public"."home_sections" USING "btree" ("position");



CREATE INDEX "idx_home_sections_visible" ON "public"."home_sections" USING "btree" ("is_visible");



CREATE INDEX "idx_ig_attempts_post" ON "public"."instagram_post_attempts" USING "btree" ("post_id", "attempted_at" DESC);



CREATE INDEX "idx_ig_embed_failures_occurred_at" ON "public"."instagram_embed_failures" USING "btree" ("occurred_at" DESC);



CREATE INDEX "idx_ig_sync_history_ran_at" ON "public"."instagram_sync_history" USING "btree" ("ran_at" DESC);



CREATE INDEX "idx_image_jobs_status" ON "public"."image_processing_jobs" USING "btree" ("status", "created_at");



CREATE INDEX "idx_instagram_feed_embeds_position" ON "public"."instagram_feed_embeds" USING "btree" ("position");



CREATE INDEX "idx_instagram_posts_position" ON "public"."instagram_posts" USING "btree" ("position");



CREATE INDEX "idx_kernel_snapshots_created_at" ON "public"."seo_kernel_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_kit_products_kit" ON "public"."kit_products" USING "btree" ("kit_id", "position");



CREATE INDEX "idx_kit_products_product" ON "public"."kit_products" USING "btree" ("product_id");



CREATE INDEX "idx_kits_active_position" ON "public"."kits" USING "btree" ("is_active", "position");



CREATE INDEX "idx_kits_home" ON "public"."kits" USING "btree" ("show_on_home", "home_position") WHERE ("show_on_home" = true);



CREATE INDEX "idx_media_assets_bucket" ON "public"."media_assets" USING "btree" ("bucket");



CREATE INDEX "idx_media_assets_entity" ON "public"."media_assets" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_media_assets_status" ON "public"."media_assets" USING "btree" ("status");



CREATE INDEX "idx_media_audit_runs_ran_at" ON "public"."media_audit_runs" USING "btree" ("ran_at" DESC);



CREATE INDEX "idx_merchant_feed_snapshots_created" ON "public"."merchant_feed_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_meta_gov_consistency" ON "public"."seo_meta_governance_snapshots" USING "btree" ("systemic_consistency");



CREATE INDEX "idx_meta_gov_created_at" ON "public"."seo_meta_governance_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_meta_gov_governance_score" ON "public"."seo_meta_governance_snapshots" USING "btree" ("governance_score");



CREATE INDEX "idx_metric_lineage_depth" ON "public"."seo_metric_lineage" USING "btree" ("lineage_depth");



CREATE INDEX "idx_metric_lineage_key" ON "public"."seo_metric_lineage" USING "btree" ("metric_key");



CREATE INDEX "idx_metric_registry_domain" ON "public"."seo_metric_registry" USING "btree" ("domain");



CREATE INDEX "idx_metric_registry_key" ON "public"."seo_metric_registry" USING "btree" ("metric_key");



CREATE INDEX "idx_metric_registry_redundancy" ON "public"."seo_metric_registry" USING "btree" ("redundancy_group");



CREATE INDEX "idx_mrs_contradiction" ON "public"."seo_meta_reasoning_snapshots" USING "btree" ("contradiction_risk_score");



CREATE INDEX "idx_mrs_created_at" ON "public"."seo_meta_reasoning_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_mrs_meta_score" ON "public"."seo_meta_reasoning_snapshots" USING "btree" ("meta_reasoning_score");



CREATE INDEX "idx_mrs_self_aware" ON "public"."seo_meta_reasoning_snapshots" USING "btree" ("strategic_self_awareness_score");



CREATE INDEX "idx_nervous_snapshots_created_at" ON "public"."seo_nervous_system_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_nervous_snapshots_score" ON "public"."seo_nervous_system_snapshots" USING "btree" ("nervous_system_score");



CREATE INDEX "idx_nervous_snapshots_stability" ON "public"."seo_nervous_system_snapshots" USING "btree" ("systemic_stability");



CREATE INDEX "idx_occasion_landings_published" ON "public"."occasion_landings" USING "btree" ("is_published") WHERE ("is_published" = true);



CREATE INDEX "idx_occasion_landings_route_slug" ON "public"."occasion_landings" USING "btree" ("route_slug");



CREATE INDEX "idx_occasions_is_indexed" ON "public"."occasions" USING "btree" ("is_indexed");



CREATE INDEX "idx_occasions_position" ON "public"."occasions" USING "btree" ("position");



CREATE INDEX "idx_occasions_public_visible" ON "public"."occasions" USING "btree" ("position") WHERE (("is_draft" = false) AND ("is_indexed" = true));



CREATE INDEX "idx_order_items_order_id" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_orders_customer_email" ON "public"."orders" USING "btree" ("customer_email");



CREATE INDEX "idx_orders_order_code" ON "public"."orders" USING "btree" ("order_code");



CREATE INDEX "idx_osn_order" ON "public"."order_status_notifications" USING "btree" ("order_id", "status");



CREATE INDEX "idx_pdp_badge_events_event_created" ON "public"."pdp_badge_events" USING "btree" ("event_name", "created_at" DESC);



CREATE INDEX "idx_pdp_badge_events_product_created" ON "public"."pdp_badge_events" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "idx_pdp_funnel_events_name_time" ON "public"."pdp_funnel_events" USING "btree" ("event_name", "created_at" DESC);



CREATE INDEX "idx_pdp_funnel_events_product" ON "public"."pdp_funnel_events" USING "btree" ("product_slug");



CREATE INDEX "idx_pdp_funnel_events_time" ON "public"."pdp_funnel_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_product_faqs_product" ON "public"."product_faqs" USING "btree" ("product_id", "position") WHERE "is_active";



CREATE INDEX "idx_product_reviews_position" ON "public"."product_reviews" USING "btree" ("product_id", "is_visible", "position", "is_featured" DESC, "review_date" DESC NULLS LAST);



CREATE INDEX "idx_product_reviews_product" ON "public"."product_reviews" USING "btree" ("product_id", "is_visible");



CREATE INDEX "idx_product_reviews_product_visible" ON "public"."product_reviews" USING "btree" ("product_id", "is_visible", "is_featured" DESC, "review_date" DESC NULLS LAST);



CREATE INDEX "idx_product_segments_product" ON "public"."product_segments" USING "btree" ("product_id");



CREATE INDEX "idx_product_segments_segment" ON "public"."product_segments" USING "btree" ("segment_id");



CREATE INDEX "idx_product_versions_product" ON "public"."product_versions" USING "btree" ("product_id", "version" DESC);



CREATE INDEX "idx_products_active_featured" ON "public"."products" USING "btree" ("is_active", "featured_weight" DESC NULLS LAST);



CREATE INDEX "idx_products_active_price" ON "public"."products" USING "btree" ("is_active", "price");



CREATE INDEX "idx_products_category_active" ON "public"."products" USING "btree" ("category_id", "is_active");



CREATE INDEX "idx_products_featured_weight" ON "public"."products" USING "btree" ("featured_weight" DESC);



CREATE INDEX "idx_products_name_trgm" ON "public"."products" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_products_search_text_trgm" ON "public"."products" USING "gin" ("search_text" "public"."gin_trgm_ops");



CREATE INDEX "idx_profile_change_audit_user" ON "public"."profile_change_audit" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_push_subscriptions_email" ON "public"."push_subscriptions" USING "btree" ("lower"("email"));



CREATE INDEX "idx_review_import_audit_batch" ON "public"."review_import_audit" USING "btree" ("import_batch_id");



CREATE INDEX "idx_review_import_audit_manual" ON "public"."review_import_audit" USING "btree" ("manual_product_id");



CREATE INDEX "idx_review_import_audit_status" ON "public"."review_import_audit" USING "btree" ("manual_status");



CREATE INDEX "idx_review_import_audit_suggested" ON "public"."review_import_audit" USING "btree" ("suggested_product_id");



CREATE INDEX "idx_scfs_consciousness_score" ON "public"."seo_consciousness_fabric_snapshots" USING "btree" ("strategic_consciousness_score" DESC);



CREATE INDEX "idx_scfs_created_at" ON "public"."seo_consciousness_fabric_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_scfs_verdict" ON "public"."seo_consciousness_fabric_snapshots" USING "btree" ("consciousness_verdict");



CREATE INDEX "idx_scm_awareness" ON "public"."seo_consciousness_memory" USING "btree" ("awareness_score");



CREATE INDEX "idx_scm_created_at" ON "public"."seo_consciousness_memory" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_scm_meta" ON "public"."seo_consciousness_memory" USING "btree" ("meta_intelligence_score");



CREATE INDEX "idx_scm_type" ON "public"."seo_consciousness_memory" USING "btree" ("consciousness_type");



CREATE INDEX "idx_search_audit_log_created_at" ON "public"."search_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_search_audit_log_entity" ON "public"."search_audit_log" USING "btree" ("entity", "entity_id");



CREATE INDEX "idx_search_boosts_lookup" ON "public"."search_boosts" USING "btree" ("term_normalized", "is_active", "weight" DESC);



CREATE INDEX "idx_search_boosts_term" ON "public"."search_boosts" USING "btree" ("term_normalized") WHERE "is_active";



CREATE INDEX "idx_search_query_log_created_at" ON "public"."search_query_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_search_query_log_normalized" ON "public"."search_query_log" USING "btree" ("term_normalized");



CREATE INDEX "idx_search_query_log_zero" ON "public"."search_query_log" USING "btree" ("term_normalized") WHERE ("result_count" = 0);



CREATE INDEX "idx_security_scan_created" ON "public"."security_scan_runs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_segments_is_indexed" ON "public"."segments" USING "btree" ("is_indexed");



CREATE INDEX "idx_segments_position" ON "public"."segments" USING "btree" ("position");



CREATE INDEX "idx_segments_public_visible" ON "public"."segments" USING "btree" ("position") WHERE (("is_draft" = false) AND ("is_indexed" = true));



CREATE INDEX "idx_segments_slug" ON "public"."segments" USING "btree" ("slug");



CREATE INDEX "idx_seo_adaptive_memory_adaptive_score" ON "public"."seo_adaptive_memory" USING "btree" ("adaptive_score" DESC);



CREATE INDEX "idx_seo_adaptive_memory_created_at" ON "public"."seo_adaptive_memory" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_adaptive_memory_entity_type" ON "public"."seo_adaptive_memory" USING "btree" ("entity_type");



CREATE INDEX "idx_seo_adaptive_memory_memory_type" ON "public"."seo_adaptive_memory" USING "btree" ("memory_type");



CREATE INDEX "idx_seo_alert_log_channel" ON "public"."seo_alert_log" USING "btree" ("channel", "created_at" DESC);



CREATE INDEX "idx_seo_alert_log_created" ON "public"."seo_alert_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_caus_reg_created" ON "public"."seo_causality_registry" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_caus_reg_event" ON "public"."seo_causality_registry" USING "btree" ("event_type");



CREATE INDEX "idx_seo_caus_reg_source" ON "public"."seo_causality_registry" USING "btree" ("source_layer");



CREATE INDEX "idx_seo_check_runs_ran_at" ON "public"."seo_check_runs" USING "btree" ("ran_at" DESC);



CREATE INDEX "idx_seo_cluster_memory_key" ON "public"."seo_cluster_memory" USING "btree" ("cluster_key");



CREATE INDEX "idx_seo_cluster_memory_snapshot" ON "public"."seo_cluster_memory" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_seo_cognitive_snapshots_created_at" ON "public"."seo_cognitive_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_cognitive_snapshots_stability" ON "public"."seo_cognitive_snapshots" USING "btree" ("cognitive_stability_score");



CREATE INDEX "idx_seo_cognitive_snapshots_synthesis" ON "public"."seo_cognitive_snapshots" USING "btree" ("decision_synthesis_score");



CREATE INDEX "idx_seo_coherence_matrix_created_at" ON "public"."seo_coherence_matrix_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_coherence_matrix_score" ON "public"."seo_coherence_matrix_snapshots" USING "btree" ("coherence_matrix_score");



CREATE INDEX "idx_seo_coherence_systemic_score" ON "public"."seo_coherence_matrix_snapshots" USING "btree" ("systemic_coherence_score");



CREATE INDEX "idx_seo_consolidation_snapshots_clarity" ON "public"."seo_consolidation_snapshots" USING "btree" ("executive_clarity_score");



CREATE INDEX "idx_seo_consolidation_snapshots_compression" ON "public"."seo_consolidation_snapshots" USING "btree" ("compression_score");



CREATE INDEX "idx_seo_consolidation_snapshots_created_at" ON "public"."seo_consolidation_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_continuum_snapshots_created_at" ON "public"."seo_continuum_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_continuum_snapshots_score" ON "public"."seo_continuum_snapshots" USING "btree" ("strategic_continuum_score" DESC);



CREATE INDEX "idx_seo_continuum_snapshots_verdict" ON "public"."seo_continuum_snapshots" USING "btree" ("continuum_verdict");



CREATE INDEX "idx_seo_decision_lineage_confidence" ON "public"."seo_decision_lineage" USING "btree" ("confidence_score");



CREATE INDEX "idx_seo_decision_lineage_engine" ON "public"."seo_decision_lineage" USING "btree" ("originating_engine");



CREATE INDEX "idx_seo_decision_lineage_type" ON "public"."seo_decision_lineage" USING "btree" ("decision_type");



CREATE INDEX "idx_seo_engine_conflicts_created" ON "public"."seo_engine_conflicts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_engine_conflicts_resolved" ON "public"."seo_engine_conflicts" USING "btree" ("resolved");



CREATE INDEX "idx_seo_engine_conflicts_severity" ON "public"."seo_engine_conflicts" USING "btree" ("severity");



CREATE INDEX "idx_seo_entity_snapshots_authority" ON "public"."seo_entity_snapshots" USING "btree" ("authority_score" DESC);



CREATE INDEX "idx_seo_entity_snapshots_date" ON "public"."seo_entity_snapshots" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_seo_entity_snapshots_entity" ON "public"."seo_entity_snapshots" USING "btree" ("entity_type", "entity_id", "snapshot_date" DESC);



CREATE INDEX "idx_seo_exec_core_collapse" ON "public"."seo_executive_core_snapshots" USING "btree" ("future_collapse_probability");



CREATE INDEX "idx_seo_exec_core_created" ON "public"."seo_executive_core_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_exec_core_score" ON "public"."seo_executive_core_snapshots" USING "btree" ("executive_core_score");



CREATE INDEX "idx_seo_exec_core_strat" ON "public"."seo_executive_core_snapshots" USING "btree" ("systemic_strategy_score");



CREATE INDEX "idx_seo_exec_orch_created_at" ON "public"."seo_execution_orchestrator_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_exec_orch_focus" ON "public"."seo_execution_orchestrator_snapshots" USING "btree" ("strategic_focus_score");



CREATE INDEX "idx_seo_exec_orch_sustainability" ON "public"."seo_execution_orchestrator_snapshots" USING "btree" ("execution_sustainability_score");



CREATE INDEX "idx_seo_exec_snap_created" ON "public"."seo_executive_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_exec_snap_health" ON "public"."seo_executive_snapshots" USING "btree" ("ecosystem_health");



CREATE INDEX "idx_seo_exec_snap_sustain" ON "public"."seo_executive_snapshots" USING "btree" ("sustainability_score");



CREATE INDEX "idx_seo_execution_log_action" ON "public"."seo_execution_log" USING "btree" ("action_type", "created_at" DESC);



CREATE INDEX "idx_seo_execution_log_entity" ON "public"."seo_execution_log" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "idx_seo_gov_matrix_created" ON "public"."seo_governance_matrix_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_gov_matrix_score" ON "public"."seo_governance_matrix_snapshots" USING "btree" ("governance_matrix_score" DESC);



CREATE INDEX "idx_seo_gov_matrix_verdict" ON "public"."seo_governance_matrix_snapshots" USING "btree" ("governance_verdict");



CREATE INDEX "idx_seo_gsc_snapshots_date" ON "public"."seo_gsc_snapshots" USING "btree" ("snapshot_date" DESC, "page_type");



CREATE INDEX "idx_seo_integrity_grid_created_at" ON "public"."seo_integrity_grid_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_integrity_grid_exec_score" ON "public"."seo_integrity_grid_snapshots" USING "btree" ("executive_integrity_score");



CREATE INDEX "idx_seo_integrity_grid_grid_score" ON "public"."seo_integrity_grid_snapshots" USING "btree" ("integrity_grid_score");



CREATE INDEX "idx_seo_metric_consistency_created" ON "public"."seo_metric_consistency" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_metric_consistency_metric" ON "public"."seo_metric_consistency" USING "btree" ("metric_name");



CREATE INDEX "idx_seo_nexus_conv_consistency" ON "public"."seo_nexus_convergence_snapshots" USING "btree" ("strategic_consistency_score");



CREATE INDEX "idx_seo_nexus_conv_created_at" ON "public"."seo_nexus_convergence_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_nexus_conv_score" ON "public"."seo_nexus_convergence_snapshots" USING "btree" ("convergence_score");



CREATE INDEX "idx_seo_op_fabric_snap_collapse" ON "public"."seo_operating_fabric_snapshots" USING "btree" ("collapse_probability");



CREATE INDEX "idx_seo_op_fabric_snap_created" ON "public"."seo_operating_fabric_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_op_fabric_snap_score" ON "public"."seo_operating_fabric_snapshots" USING "btree" ("operating_fabric_score");



CREATE INDEX "idx_seo_op_reality_created_at" ON "public"."seo_operational_reality_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_op_reality_op_value" ON "public"."seo_operational_reality_snapshots" USING "btree" ("operational_value_score");



CREATE INDEX "idx_seo_op_reality_sustain" ON "public"."seo_operational_reality_snapshots" USING "btree" ("sustainability_score");



CREATE INDEX "idx_seo_op_snap_date" ON "public"."seo_operational_snapshots" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_seo_op_snap_score" ON "public"."seo_operational_snapshots" USING "btree" ("operational_score" DESC);



CREATE INDEX "idx_seo_reasoning_conflicts_created_at" ON "public"."seo_reasoning_conflicts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_reasoning_conflicts_severity" ON "public"."seo_reasoning_conflicts" USING "btree" ("severity");



CREATE INDEX "idx_seo_risk_created" ON "public"."seo_systemic_risk_registry" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_risk_resolved" ON "public"."seo_systemic_risk_registry" USING "btree" ("resolved");



CREATE INDEX "idx_seo_risk_sev" ON "public"."seo_systemic_risk_registry" USING "btree" ("risk_severity");



CREATE INDEX "idx_seo_risk_type" ON "public"."seo_systemic_risk_registry" USING "btree" ("risk_type");



CREATE INDEX "idx_seo_sim_runs_created_at" ON "public"."seo_simulation_runs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_sim_runs_scenario" ON "public"."seo_simulation_runs" USING "btree" ("scenario_type");



CREATE INDEX "idx_seo_sim_runs_type" ON "public"."seo_simulation_runs" USING "btree" ("simulation_type");



CREATE INDEX "idx_seo_snapshots_source_date" ON "public"."seo_snapshots" USING "btree" ("source", "captured_at" DESC);



CREATE INDEX "idx_seo_stability_fabric_created_at" ON "public"."seo_stability_fabric_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_stability_fabric_integrity" ON "public"."seo_stability_fabric_snapshots" USING "btree" ("systemic_integrity_score");



CREATE INDEX "idx_seo_stability_fabric_score" ON "public"."seo_stability_fabric_snapshots" USING "btree" ("stability_fabric_score");



CREATE INDEX "idx_seo_strat_align_created" ON "public"."seo_strategy_alignment_registry" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_strategy_memory_entity" ON "public"."seo_strategy_memory" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_seo_strategy_memory_snapshot" ON "public"."seo_strategy_memory" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_seo_strategy_sim_confidence" ON "public"."seo_strategy_simulations" USING "btree" ("confidence_score");



CREATE INDEX "idx_seo_strategy_sim_created" ON "public"."seo_strategy_simulations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_strategy_sim_scenario" ON "public"."seo_strategy_simulations" USING "btree" ("scenario_type");



CREATE INDEX "idx_seo_strategy_sim_type" ON "public"."seo_strategy_simulations" USING "btree" ("simulation_type");



CREATE INDEX "idx_seo_struct_dep_critical" ON "public"."seo_structural_dependencies" USING "btree" ("is_critical");



CREATE INDEX "idx_seo_struct_dep_source" ON "public"."seo_structural_dependencies" USING "btree" ("source_engine");



CREATE INDEX "idx_seo_struct_dep_target" ON "public"."seo_structural_dependencies" USING "btree" ("target_engine");



CREATE INDEX "idx_seo_submission_log_created" ON "public"."seo_submission_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_sys_health_date" ON "public"."seo_system_health_snapshots" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_seo_sys_health_score" ON "public"."seo_system_health_snapshots" USING "btree" ("system_health_score" DESC);



CREATE INDEX "idx_seo_sys_sustain_score" ON "public"."seo_system_health_snapshots" USING "btree" ("sustainability_score" DESC);



CREATE INDEX "idx_seo_unified_bus_coherence" ON "public"."seo_unified_bus_snapshots" USING "btree" ("coherence_score");



CREATE INDEX "idx_seo_unified_bus_created" ON "public"."seo_unified_bus_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_unified_bus_future" ON "public"."seo_unified_bus_snapshots" USING "btree" ("future_viability_score");



CREATE INDEX "idx_seo_unified_bus_kernel" ON "public"."seo_unified_bus_snapshots" USING "btree" ("kernel_score");



CREATE INDEX "idx_seo_unified_nexus_snapshots_created_at" ON "public"."seo_unified_nexus_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_seo_unified_nexus_snapshots_score" ON "public"."seo_unified_nexus_snapshots" USING "btree" ("unified_nexus_score" DESC);



CREATE INDEX "idx_seo_unified_nexus_snapshots_verdict" ON "public"."seo_unified_nexus_snapshots" USING "btree" ("nexus_verdict");



CREATE INDEX "idx_seo_url_status_checked_at" ON "public"."seo_url_status" USING "btree" ("checked_at" DESC);



CREATE INDEX "idx_seo_url_status_has_issue" ON "public"."seo_url_status" USING "btree" ("has_issue") WHERE ("has_issue" = true);



CREATE INDEX "idx_seo_url_status_url" ON "public"."seo_url_status" USING "btree" ("url");



CREATE INDEX "idx_sfgs_created_at" ON "public"."seo_final_governance_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_sfgs_governance" ON "public"."seo_final_governance_snapshots" USING "btree" ("governance_maturity_score");



CREATE INDEX "idx_sfgs_sustainable" ON "public"."seo_final_governance_snapshots" USING "btree" ("sustainable_complexity_score");



CREATE INDEX "idx_shipping_audit_event_type" ON "public"."shipping_audit_logs" USING "btree" ("event_type");



CREATE INDEX "idx_shipping_audit_logs_created_at" ON "public"."shipping_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_shipping_quote_cache_created_at" ON "public"."shipping_quote_cache" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ssrs_created_at" ON "public"."seo_strategic_reality_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ssrs_reality_score" ON "public"."seo_strategic_reality_snapshots" USING "btree" ("strategic_reality_score" DESC);



CREATE INDEX "idx_ssrs_verdict" ON "public"."seo_strategic_reality_snapshots" USING "btree" ("reality_verdict");



CREATE INDEX "idx_stale_bundle_logs_occurred_at" ON "public"."stale_bundle_logs" USING "btree" ("occurred_at" DESC);



CREATE INDEX "idx_stale_bundle_logs_route" ON "public"."stale_bundle_logs" USING "btree" ("route");



CREATE INDEX "idx_tags_position" ON "public"."tags" USING "btree" ("position");



CREATE INDEX "idx_theme_hubs_authority" ON "public"."theme_hubs" USING "btree" ("authority_score" DESC);



CREATE INDEX "idx_theme_hubs_is_approved" ON "public"."theme_hubs" USING "btree" ("is_approved");



CREATE INDEX "idx_theme_hubs_tag_id" ON "public"."theme_hubs" USING "btree" ("tag_id");



CREATE INDEX "idx_tracking_email_log_order_created" ON "public"."tracking_email_log" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "idx_tracking_email_log_status_created" ON "public"."tracking_email_log" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_visitor_pageviews_visitor_step" ON "public"."visitor_pageviews" USING "btree" ("visitor_id", "step_index");



CREATE INDEX "idx_visitors_city_lower" ON "public"."visitors" USING "btree" ("lower"("ip_city"));



CREATE INDEX "idx_visitors_country_lower" ON "public"."visitors" USING "btree" ("lower"("ip_country"));



CREATE INDEX "idx_visitors_customer_id" ON "public"."visitors" USING "btree" ("customer_id");



CREATE INDEX "idx_visitors_device_model_lower" ON "public"."visitors" USING "btree" ("lower"("device_model"));



CREATE INDEX "idx_visitors_ip_text" ON "public"."visitors" USING "btree" ("host"("ip"));



CREATE INDEX "idx_visitors_lead_status" ON "public"."visitors" USING "btree" ("lead_status") WHERE ("lead_status" IS NOT NULL);



CREATE INDEX "idx_visitors_region_lower" ON "public"."visitors" USING "btree" ("lower"("ip_region"));



CREATE INDEX "idx_web_vitals_reports_created" ON "public"."web_vitals_reports" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wishlist_shares_token" ON "public"."wishlist_shares" USING "btree" ("token");



CREATE INDEX "idx_wishlists_user" ON "public"."wishlists" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "instagram_posts_shortcode_uniq" ON "public"."instagram_posts" USING "btree" ("shortcode") WHERE ("shortcode" IS NOT NULL);



CREATE UNIQUE INDEX "kits_external_ref_key" ON "public"."kits" USING "btree" ("external_ref");



CREATE UNIQUE INDEX "occasions_external_ref_key" ON "public"."occasions" USING "btree" ("external_ref");



CREATE INDEX "orders_payment_status_idx" ON "public"."orders" USING "btree" ("payment_status");



CREATE INDEX "orders_tracking_code_idx" ON "public"."orders" USING "btree" ("tracking_code");



CREATE INDEX "payment_events_created_idx" ON "public"."payment_events" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "payment_events_idem_idx" ON "public"."payment_events" USING "btree" ("provider", COALESCE("payment_id", ''::"text"), COALESCE("event_id", ''::"text"), COALESCE("provider_status", ''::"text"));



CREATE INDEX "payment_events_order_idx" ON "public"."payment_events" USING "btree" ("order_code");



CREATE INDEX "product_slugs_active_idx" ON "public"."product_slugs" USING "btree" ("is_active") WHERE "is_active";



CREATE UNIQUE INDEX "product_slugs_one_primary_per_product" ON "public"."product_slugs" USING "btree" ("product_id") WHERE "is_primary";



CREATE INDEX "product_slugs_product_id_idx" ON "public"."product_slugs" USING "btree" ("product_id");



CREATE UNIQUE INDEX "product_slugs_slug_key" ON "public"."product_slugs" USING "btree" ("slug");



CREATE UNIQUE INDEX "product_slugs_slug_normalized_key" ON "public"."product_slugs" USING "btree" ("slug_normalized");



CREATE UNIQUE INDEX "products_external_ref_key" ON "public"."products" USING "btree" ("external_ref");



CREATE INDEX "products_search_text_trgm" ON "public"."products" USING "gin" ("search_text" "public"."gin_trgm_ops");



CREATE INDEX "role_promotion_audit_created_at_idx" ON "public"."role_promotion_audit" USING "btree" ("created_at" DESC);



CREATE INDEX "role_promotion_audit_target_email_idx" ON "public"."role_promotion_audit" USING "btree" ("lower"("target_email"));



CREATE INDEX "search_synonyms_aliases_gin" ON "public"."search_synonyms" USING "gin" ("aliases");



CREATE UNIQUE INDEX "search_synonyms_canonical_norm_uq" ON "public"."search_synonyms" USING "btree" ("public"."normalize_search"("canonical_term"));



CREATE UNIQUE INDEX "tags_external_ref_key" ON "public"."tags" USING "btree" ("external_ref");



CREATE INDEX "tracking_email_log_order_idx" ON "public"."tracking_email_log" USING "btree" ("order_id", "created_at" DESC);



CREATE UNIQUE INDEX "uq_product_reviews_external" ON "public"."product_reviews" USING "btree" ("source", "external_review_id") WHERE ("external_review_id" IS NOT NULL);



CREATE INDEX "visitor_pageviews_path_idx" ON "public"."visitor_pageviews" USING "btree" ("path");



CREATE INDEX "visitor_pageviews_product_idx" ON "public"."visitor_pageviews" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "visitor_pageviews_step_idx" ON "public"."visitor_pageviews" USING "btree" ("visitor_id", "step_index");



CREATE INDEX "visitor_pageviews_visitor_idx" ON "public"."visitor_pageviews" USING "btree" ("visitor_id", "viewed_at" DESC);



CREATE INDEX "visitor_sessions_visitor_idx" ON "public"."visitor_sessions" USING "btree" ("visitor_id", "started_at" DESC);



CREATE INDEX "visitors_customer_id_idx" ON "public"."visitors" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "visitors_human_last_seen_idx" ON "public"."visitors" USING "btree" ("last_seen_at" DESC) WHERE ("is_bot" = false);



CREATE INDEX "visitors_ip_idx" ON "public"."visitors" USING "btree" ("ip");



CREATE INDEX "visitors_is_bot_idx" ON "public"."visitors" USING "btree" ("is_bot");



CREATE INDEX "visitors_last_seen_idx" ON "public"."visitors" USING "btree" ("last_seen_at" DESC);



CREATE INDEX "visitors_lead_status_idx" ON "public"."visitors" USING "btree" ("lead_status") WHERE ("is_bot" = false);



CREATE INDEX "visitors_whatsapp_idx" ON "public"."visitors" USING "btree" ("whatsapp_phone") WHERE ("whatsapp_phone" IS NOT NULL);



CREATE OR REPLACE TRIGGER "auto_redirect_on_segment_slug_change" AFTER UPDATE OF "slug" ON "public"."segments" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_redirect_on_slug_change"();



CREATE OR REPLACE TRIGGER "blog_posts_sitemap_dirty" AFTER INSERT OR DELETE OR UPDATE ON "public"."blog_posts" FOR EACH STATEMENT EXECUTE FUNCTION "public"."mark_sitemap_dirty"();



CREATE OR REPLACE TRIGGER "blog_posts_updated_at" BEFORE UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "catalog_security_gate" BEFORE INSERT OR DELETE OR UPDATE ON "public"."product_occasions" FOR EACH STATEMENT EXECUTE FUNCTION "public"."enforce_catalog_security"();



CREATE OR REPLACE TRIGGER "catalog_security_gate" BEFORE INSERT OR DELETE OR UPDATE ON "public"."product_segments" FOR EACH STATEMENT EXECUTE FUNCTION "public"."enforce_catalog_security"();



CREATE OR REPLACE TRIGGER "catalog_security_gate" BEFORE INSERT OR DELETE OR UPDATE ON "public"."product_tags" FOR EACH STATEMENT EXECUTE FUNCTION "public"."enforce_catalog_security"();



CREATE OR REPLACE TRIGGER "catalog_security_gate" BEFORE INSERT OR DELETE OR UPDATE ON "public"."products" FOR EACH STATEMENT EXECUTE FUNCTION "public"."enforce_catalog_security"();



CREATE OR REPLACE TRIGGER "combo_pages_updated_at" BEFORE UPDATE ON "public"."combination_pages_registry" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "mark_sitemap_dirty_segments" AFTER INSERT OR DELETE OR UPDATE ON "public"."segments" FOR EACH STATEMENT EXECUTE FUNCTION "public"."mark_sitemap_dirty"();



CREATE OR REPLACE TRIGGER "pdp_sections_audit_trg" AFTER INSERT OR DELETE OR UPDATE ON "public"."pdp_sections" FOR EACH ROW EXECUTE FUNCTION "public"."audit_pdp_sections"();



CREATE OR REPLACE TRIGGER "pdp_sections_updated_at" BEFORE UPDATE ON "public"."pdp_sections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_admin_access_requests_updated_at" BEFORE UPDATE ON "public"."admin_access_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_audit_role_revocation" AFTER DELETE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_role_revocation"();



CREATE OR REPLACE TRIGGER "trg_audit_search_boosts" AFTER INSERT OR DELETE OR UPDATE ON "public"."search_boosts" FOR EACH ROW EXECUTE FUNCTION "public"."log_search_config_change"();



CREATE OR REPLACE TRIGGER "trg_audit_search_synonyms" AFTER INSERT OR DELETE OR UPDATE ON "public"."search_synonyms" FOR EACH ROW EXECUTE FUNCTION "public"."log_search_config_change"();



CREATE OR REPLACE TRIGGER "trg_boosts_bump_search" AFTER INSERT OR DELETE OR UPDATE ON "public"."search_boosts" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_search_cache_version"();



CREATE OR REPLACE TRIGGER "trg_categories_bump_search" AFTER INSERT OR DELETE OR UPDATE ON "public"."categories" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_search_cache_version"();



CREATE OR REPLACE TRIGGER "trg_categories_external_ref" BEFORE INSERT ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_external_ref"();



CREATE OR REPLACE TRIGGER "trg_categories_mark_sitemap" AFTER INSERT OR DELETE OR UPDATE OF "slug", "name" ON "public"."categories" FOR EACH STATEMENT EXECUTE FUNCTION "public"."mark_sitemap_dirty"();



CREATE OR REPLACE TRIGGER "trg_categories_unique_slug" BEFORE INSERT OR UPDATE OF "slug" ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."check_taxonomy_slug_unique"();



CREATE OR REPLACE TRIGGER "trg_ccc_updated_at" BEFORE UPDATE ON "public"."cookie_consent_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_collections_updated_at" BEFORE UPDATE ON "public"."collections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_cpr_updated_at" BEFORE UPDATE ON "public"."combination_pages_registry" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_ddr_updated_at" BEFORE UPDATE ON "public"."data_deletion_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_enforce_product_category" BEFORE INSERT OR UPDATE OF "category_id" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_product_category"();



CREATE OR REPLACE TRIGGER "trg_fill_product_google_category" BEFORE INSERT OR UPDATE OF "category_id", "google_product_category" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."fill_product_google_category"();



CREATE OR REPLACE TRIGGER "trg_home_sections_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."home_sections" FOR EACH ROW EXECUTE FUNCTION "public"."audit_home_sections"();



CREATE OR REPLACE TRIGGER "trg_home_sections_updated_at" BEFORE UPDATE ON "public"."home_sections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_image_jobs_updated_at" BEFORE UPDATE ON "public"."image_processing_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_kits_auto_redirect" AFTER UPDATE OF "slug" ON "public"."kits" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_redirect_on_slug_change"();



CREATE OR REPLACE TRIGGER "trg_kits_external_ref" BEFORE INSERT ON "public"."kits" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_external_ref"();



CREATE OR REPLACE TRIGGER "trg_kits_unique_slug" BEFORE INSERT OR UPDATE OF "slug" ON "public"."kits" FOR EACH ROW EXECUTE FUNCTION "public"."check_taxonomy_slug_unique"();



CREATE OR REPLACE TRIGGER "trg_link_visitor_to_customer" BEFORE INSERT OR UPDATE OF "whatsapp_phone" ON "public"."visitors" FOR EACH ROW EXECUTE FUNCTION "public"."link_visitor_to_customer"();



CREATE OR REPLACE TRIGGER "trg_media_assets_updated_at" BEFORE UPDATE ON "public"."media_assets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_notification_preferences_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_notify_admins_on_access_request_insert" AFTER INSERT ON "public"."admin_access_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_admins_on_access_request"();



CREATE OR REPLACE TRIGGER "trg_notify_order_status_change" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."notify_order_status_change"();



CREATE OR REPLACE TRIGGER "trg_occasions_external_ref" BEFORE INSERT ON "public"."occasions" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_external_ref"();



CREATE OR REPLACE TRIGGER "trg_occasions_mark_sitemap" AFTER INSERT OR DELETE OR UPDATE ON "public"."occasions" FOR EACH STATEMENT EXECUTE FUNCTION "public"."mark_sitemap_dirty"();



CREATE OR REPLACE TRIGGER "trg_occasions_unique_slug" BEFORE INSERT OR UPDATE OF "slug" ON "public"."occasions" FOR EACH ROW EXECUTE FUNCTION "public"."check_taxonomy_slug_unique"();



CREATE OR REPLACE TRIGGER "trg_pages_mark_sitemap" AFTER INSERT OR DELETE OR UPDATE OF "slug", "status", "title" ON "public"."pages" FOR EACH STATEMENT EXECUTE FUNCTION "public"."mark_sitemap_dirty"();



CREATE OR REPLACE TRIGGER "trg_product_faqs_updated_at" BEFORE UPDATE ON "public"."product_faqs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_product_reviews_updated_at" BEFORE UPDATE ON "public"."product_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_product_slugs_normalize" BEFORE INSERT OR UPDATE OF "slug" ON "public"."product_slugs" FOR EACH ROW EXECUTE FUNCTION "public"."product_slugs_normalize"();



CREATE OR REPLACE TRIGGER "trg_product_slugs_updated_at" BEFORE UPDATE ON "public"."product_slugs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_products_bump_search" AFTER INSERT OR DELETE OR UPDATE ON "public"."products" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_search_cache_version"();



CREATE OR REPLACE TRIGGER "trg_products_external_ref" BEFORE INSERT ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_external_ref"();



CREATE OR REPLACE TRIGGER "trg_products_mark_sitemap" AFTER INSERT OR DELETE OR UPDATE OF "slug", "is_active", "name" ON "public"."products" FOR EACH STATEMENT EXECUTE FUNCTION "public"."mark_sitemap_dirty"();



CREATE OR REPLACE TRIGGER "trg_products_search_text" BEFORE INSERT OR UPDATE OF "name", "description", "long_description", "keywords" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."products_refresh_search_text"();



CREATE OR REPLACE TRIGGER "trg_products_sync_slugs" AFTER INSERT OR UPDATE OF "slug" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."sync_product_slugs_from_products"();



CREATE OR REPLACE TRIGGER "trg_products_track_version" AFTER INSERT OR UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."track_product_version"();



CREATE OR REPLACE TRIGGER "trg_products_weight_required" BEFORE INSERT ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_product_weight_on_insert"();



CREATE OR REPLACE TRIGGER "trg_redirect_on_slug_categories" BEFORE UPDATE OF "slug" ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_redirect_on_slug_change"();



CREATE OR REPLACE TRIGGER "trg_redirect_on_slug_occasions" BEFORE UPDATE OF "slug" ON "public"."occasions" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_redirect_on_slug_change"();



CREATE OR REPLACE TRIGGER "trg_redirect_on_slug_products" BEFORE UPDATE OF "slug" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_redirect_on_slug_change"();



CREATE OR REPLACE TRIGGER "trg_redirect_on_slug_tags" BEFORE UPDATE OF "slug" ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."auto_create_redirect_on_slug_change"();



CREATE OR REPLACE TRIGGER "trg_review_import_audit_updated" BEFORE UPDATE ON "public"."review_import_audit" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_search_boosts_normalize" BEFORE INSERT OR UPDATE ON "public"."search_boosts" FOR EACH ROW EXECUTE FUNCTION "public"."search_boosts_normalize"();



CREATE OR REPLACE TRIGGER "trg_search_boosts_updated" BEFORE UPDATE ON "public"."search_boosts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_search_synonyms_updated_at" BEFORE UPDATE ON "public"."search_synonyms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_segments_unique_slug" BEFORE INSERT OR UPDATE OF "slug" ON "public"."segments" FOR EACH ROW EXECUTE FUNCTION "public"."check_taxonomy_slug_unique"();



CREATE OR REPLACE TRIGGER "trg_seo_strategy_simulations_updated" BEFORE UPDATE ON "public"."seo_strategy_simulations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_shipping_providers_updated" BEFORE UPDATE ON "public"."shipping_providers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_shipping_rules_updated" BEFORE UPDATE ON "public"."shipping_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_shipping_settings_updated" BEFORE UPDATE ON "public"."shipping_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_synonyms_bump_search" AFTER INSERT OR DELETE OR UPDATE ON "public"."search_synonyms" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_search_cache_version"();



CREATE OR REPLACE TRIGGER "trg_tags_external_ref" BEFORE INSERT ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_external_ref"();



CREATE OR REPLACE TRIGGER "trg_tags_unique_slug" BEFORE INSERT OR UPDATE OF "slug" ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."check_taxonomy_slug_unique"();



CREATE OR REPLACE TRIGGER "trg_theme_hubs_updated" BEFORE UPDATE ON "public"."theme_hubs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_tracking_email_log_actor" BEFORE INSERT ON "public"."tracking_email_log" FOR EACH ROW EXECUTE FUNCTION "public"."tracking_email_log_set_actor"();



CREATE OR REPLACE TRIGGER "trg_trim_shipping_audit_logs" AFTER INSERT ON "public"."shipping_audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION "public"."trim_shipping_audit_logs"();



CREATE OR REPLACE TRIGGER "trg_user_roles_notify" AFTER INSERT ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."notify_role_change"();



CREATE OR REPLACE TRIGGER "trg_wishlist_shares_updated" BEFORE UPDATE ON "public"."wishlist_shares" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_coupons_updated_at" BEFORE UPDATE ON "public"."coupons" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_faqs_updated_at" BEFORE UPDATE ON "public"."faqs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_hero_slides_updated_at" BEFORE UPDATE ON "public"."hero_slides" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_homepage_blocks_updated_at" BEFORE UPDATE ON "public"."homepage_blocks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_instagram_feed_embeds_updated_at" BEFORE UPDATE ON "public"."instagram_feed_embeds" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_instagram_posts_updated_at" BEFORE UPDATE ON "public"."instagram_posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_kits_updated_at" BEFORE UPDATE ON "public"."kits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_media_backup_runs_updated_at" BEFORE UPDATE ON "public"."media_backup_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_occasion_landings_updated_at" BEFORE UPDATE ON "public"."occasion_landings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pages_updated_at" BEFORE UPDATE ON "public"."pages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_redirects_updated_at" BEFORE UPDATE ON "public"."redirects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_segments_updated_at" BEFORE UPDATE ON "public"."segments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_seo_strategy_memory_updated_at" BEFORE UPDATE ON "public"."seo_strategy_memory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_social_proof_settings_updated_at" BEFORE UPDATE ON "public"."social_proof_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_store_settings_updated_at" BEFORE UPDATE ON "public"."store_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_testimonials_updated_at" BEFORE UPDATE ON "public"."testimonials" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "visitors_updated_at" BEFORE UPDATE ON "public"."visitors" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."catalog_security_approvals"
    ADD CONSTRAINT "catalog_security_approvals_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "public"."security_scan_runs"("id");



ALTER TABLE ONLY "public"."collection_products"
    ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."collection_products"
    ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coupon_uses"
    ADD CONSTRAINT "coupon_uses_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coupon_uses"
    ADD CONSTRAINT "coupon_uses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."instagram_post_attempts"
    ADD CONSTRAINT "instagram_post_attempts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."instagram_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kit_products"
    ADD CONSTRAINT "kit_products_kit_id_fkey" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kit_products"
    ADD CONSTRAINT "kit_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_versions"
    ADD CONSTRAINT "page_versions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pdp_badge_events"
    ADD CONSTRAINT "pdp_badge_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_faqs"
    ADD CONSTRAINT "product_faqs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_occasions"
    ADD CONSTRAINT "product_occasions_occasion_id_fkey" FOREIGN KEY ("occasion_id") REFERENCES "public"."occasions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_occasions"
    ADD CONSTRAINT "product_occasions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_reviews"
    ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_segments"
    ADD CONSTRAINT "product_segments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_segments"
    ADD CONSTRAINT "product_segments_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_slugs"
    ADD CONSTRAINT "product_slugs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_tags"
    ADD CONSTRAINT "product_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."review_import_audit"
    ADD CONSTRAINT "review_import_audit_manual_product_id_fkey" FOREIGN KEY ("manual_product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."review_import_audit"
    ADD CONSTRAINT "review_import_audit_suggested_product_id_fkey" FOREIGN KEY ("suggested_product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."search_boosts"
    ADD CONSTRAINT "search_boosts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitor_pageviews"
    ADD CONSTRAINT "visitor_pageviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visitor_pageviews"
    ADD CONSTRAINT "visitor_pageviews_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visitor_pageviews"
    ADD CONSTRAINT "visitor_pageviews_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("visitor_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitor_sessions"
    ADD CONSTRAINT "visitor_sessions_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("visitor_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitors"
    ADD CONSTRAINT "visitors_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wishlists"
    ADD CONSTRAINT "wishlists_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



CREATE POLICY "Admin apaga solicitações de exclusão" ON "public"."data_deletion_requests" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin atualiza config do banner" ON "public"."cookie_consent_config" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin atualiza solicitações de exclusão" ON "public"."data_deletion_requests" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can insert store settings" ON "public"."store_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can update store settings" ON "public"."store_settings" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin can view store settings" ON "public"."store_settings" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin lê solicitações de exclusão" ON "public"."data_deletion_requests" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin manage product slugs" ON "public"."product_slugs" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admin manage reserved_slugs" ON "public"."reserved_slugs" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete consciousness fabric snapshots" ON "public"."seo_consciousness_fabric_snapshots" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete final governance snapshots" ON "public"."seo_final_governance_snapshots" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete orders" ON "public"."orders" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can delete strategic reality snapshots" ON "public"."seo_strategic_reality_snapshots" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert consciousness fabric snapshots" ON "public"."seo_consciousness_fabric_snapshots" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert final governance snapshots" ON "public"."seo_final_governance_snapshots" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert operational reality snapshots" ON "public"."seo_operational_reality_snapshots" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can insert strategic reality snapshots" ON "public"."seo_strategic_reality_snapshots" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage FAQs" ON "public"."faqs" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage all roles" ON "public"."user_roles" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage categories" ON "public"."categories" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage coupons" ON "public"."coupons" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage hero_slides" ON "public"."hero_slides" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage homepage blocks" ON "public"."homepage_blocks" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage instagram posts" ON "public"."instagram_posts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage landings" ON "public"."occasion_landings" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage menu_items" ON "public"."menu_items" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage occasions" ON "public"."occasions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage order items" ON "public"."order_items" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage page_versions" ON "public"."page_versions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage pages" ON "public"."pages" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage product faqs" ON "public"."product_faqs" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage product_occasions" ON "public"."product_occasions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage product_segments" ON "public"."product_segments" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage product_tags" ON "public"."product_tags" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage products" ON "public"."products" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage redirects" ON "public"."redirects" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage segments" ON "public"."segments" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage tags" ON "public"."tags" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage testimonials" ON "public"."testimonials" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read admin usage aggregates" ON "public"."admin_usage_aggregates" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read badge events" ON "public"."pdp_badge_events" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can read seo_url_status" ON "public"."seo_url_status" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update consciousness fabric snapshots" ON "public"."seo_consciousness_fabric_snapshots" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update orders" ON "public"."orders" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can update strategic reality snapshots" ON "public"."seo_strategic_reality_snapshots" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all landings" ON "public"."occasion_landings" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all menu_items" ON "public"."menu_items" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all order items" ON "public"."order_items" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all orders" ON "public"."orders" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all products" ON "public"."products" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view consciousness fabric snapshots" ON "public"."seo_consciousness_fabric_snapshots" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view coupon uses" ON "public"."coupon_uses" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view final governance snapshots" ON "public"."seo_final_governance_snapshots" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view gsc snapshots" ON "public"."seo_gsc_snapshots" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view media audit runs" ON "public"."media_audit_runs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view media backup runs" ON "public"."media_backup_runs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view merchant feed snapshots" ON "public"."merchant_feed_snapshots" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view operational reality snapshots" ON "public"."seo_operational_reality_snapshots" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view order status notifications" ON "public"."order_status_notifications" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view payment events" ON "public"."payment_events" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view role audit" ON "public"."role_promotion_audit" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view seo alert log" ON "public"."seo_alert_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view seo submission log" ON "public"."seo_submission_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view strategic reality snapshots" ON "public"."seo_strategic_reality_snapshots" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view telemetry alert state" ON "public"."telemetry_alert_state" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins delete ig_embed_failures" ON "public"."instagram_embed_failures" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins delete review_import_audit" ON "public"."review_import_audit" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins delete stale_bundle_logs" ON "public"."stale_bundle_logs" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access finalization snapshots" ON "public"."seo_system_finalization_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_adaptive_memory" ON "public"."seo_adaptive_memory" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_civilization_snapshots" ON "public"."seo_civilization_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_cognitive_snapshots" ON "public"."seo_cognitive_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_coherence_conflicts" ON "public"."seo_coherence_conflicts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_consciousness_memory" ON "public"."seo_consciousness_memory" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_decision_lineage" ON "public"."seo_decision_lineage" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_engine_conflicts" ON "public"."seo_engine_conflicts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_engine_registry" ON "public"."seo_engine_registry" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_executive_snapshots" ON "public"."seo_executive_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_kernel_snapshots" ON "public"."seo_kernel_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_meta_governance_snapshots" ON "public"."seo_meta_governance_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_meta_reasoning_snapshots" ON "public"."seo_meta_reasoning_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_metric_consistency" ON "public"."seo_metric_consistency" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_metric_lineage" ON "public"."seo_metric_lineage" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_metric_registry" ON "public"."seo_metric_registry" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_nervous_system_snapshots" ON "public"."seo_nervous_system_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_operational_snapshots" ON "public"."seo_operational_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_reasoning_conflicts" ON "public"."seo_reasoning_conflicts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_reasoning_drift_registry" ON "public"."seo_reasoning_drift_registry" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_simulation_runs" ON "public"."seo_simulation_runs" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_strategy_simulations" ON "public"."seo_strategy_simulations" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_system_health_snapshots" ON "public"."seo_system_health_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access seo_unified_bus_snapshots" ON "public"."seo_unified_bus_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access to consolidation snapshots" ON "public"."seo_consolidation_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access to continuum snapshots" ON "public"."seo_continuum_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access to execution orchestrator snapshots" ON "public"."seo_execution_orchestrator_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins full access to unified nexus snapshots" ON "public"."seo_unified_nexus_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins insert review_import_audit" ON "public"."review_import_audit" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins insert tracking_email_log" ON "public"."tracking_email_log" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage blog_posts" ON "public"."blog_posts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage combo registry" ON "public"."combination_pages_registry" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage executive core snapshots" ON "public"."seo_executive_core_snapshots" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage feed embeds" ON "public"."instagram_feed_embeds" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage governance matrix snapshots" ON "public"."seo_governance_matrix_snapshots" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage instagram_post_attempts" ON "public"."instagram_post_attempts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage instagram_sync_history" ON "public"."instagram_sync_history" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage kit_products" ON "public"."kit_products" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage kits" ON "public"."kits" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage media_assets" ON "public"."media_assets" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage notification preferences" ON "public"."notification_preferences" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage push subscriptions" ON "public"."push_subscriptions" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage reviews" ON "public"."product_reviews" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage seo_check_runs" ON "public"."seo_check_runs" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage seo_cluster_memory" ON "public"."seo_cluster_memory" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage seo_entity_snapshots" ON "public"."seo_entity_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage seo_execution_log" ON "public"."seo_execution_log" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage seo_snapshots" ON "public"."seo_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage seo_strategy_memory" ON "public"."seo_strategy_memory" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage shipping_providers" ON "public"."shipping_providers" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage shipping_rules" ON "public"."shipping_rules" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage shipping_settings" ON "public"."shipping_settings" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage strategy alignment registry" ON "public"."seo_strategy_alignment_registry" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage systemic risk registry" ON "public"."seo_systemic_risk_registry" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage theme_hubs" ON "public"."theme_hubs" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins manage web vitals reports" ON "public"."web_vitals_reports" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins read review_import_audit" ON "public"."review_import_audit" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins read security scans" ON "public"."security_scan_runs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins read shipping_audit_logs" ON "public"."shipping_audit_logs" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins update access requests" ON "public"."admin_access_requests" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins update review_import_audit" ON "public"."review_import_audit" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins view access requests" ON "public"."admin_access_requests" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins view access_request_notifications" ON "public"."access_request_notifications" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins view ig_embed_failures" ON "public"."instagram_embed_failures" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins view stale_bundle_logs" ON "public"."stale_bundle_logs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins view tracking_email_log" ON "public"."tracking_email_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins/editors manage image jobs" ON "public"."image_processing_jobs" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'editor'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'editor'::"public"."app_role")));



CREATE POLICY "Anyone can insert badge events" ON "public"."pdp_badge_events" FOR INSERT WITH CHECK (("event_name" = ANY (ARRAY['impression'::"text", 'click'::"text"])));



CREATE POLICY "Anyone can insert ig_embed_failures" ON "public"."instagram_embed_failures" FOR INSERT TO "authenticated", "anon" WITH CHECK (((COALESCE("length"("route"), 0) <= 500) AND (COALESCE("length"("post_url"), 0) <= 1000) AND (COALESCE("length"("user_agent"), 0) <= 1000) AND ((COALESCE("ms_to_fallback", 0) >= 0) AND (COALESCE("ms_to_fallback", 0) <= 600000))));



CREATE POLICY "Anyone can insert stale_bundle_logs" ON "public"."stale_bundle_logs" FOR INSERT TO "authenticated", "anon" WITH CHECK (((COALESCE("length"("route"), 0) <= 500) AND (COALESCE("length"("message"), 0) <= 2000) AND (COALESCE("length"("stack"), 0) <= 8000) AND (COALESCE("length"("user_agent"), 0) <= 1000)));



CREATE POLICY "Anyone can view active feed embeds" ON "public"."instagram_feed_embeds" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active products" ON "public"."products" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active redirects" ON "public"."redirects" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view approved theme_hubs" ON "public"."theme_hubs" FOR SELECT USING (("is_approved" = true));



CREATE POLICY "Anyone can view categories" ON "public"."categories" FOR SELECT USING (true);



CREATE POLICY "Anyone can view indexable combos" ON "public"."combination_pages_registry" FOR SELECT USING (("is_indexable" = true));



CREATE POLICY "Anyone can view menu_items" ON "public"."menu_items" FOR SELECT USING (("is_visible" = true));



CREATE POLICY "Anyone can view occasions" ON "public"."occasions" FOR SELECT USING (true);



CREATE POLICY "Anyone can view product_occasions" ON "public"."product_occasions" FOR SELECT USING (true);



CREATE POLICY "Anyone can view product_segments" ON "public"."product_segments" FOR SELECT USING (true);



CREATE POLICY "Anyone can view product_tags" ON "public"."product_tags" FOR SELECT USING (true);



CREATE POLICY "Anyone can view published landings" ON "public"."occasion_landings" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Anyone can view published pages" ON "public"."pages" FOR SELECT USING (("status" = 'published'::"text"));



CREATE POLICY "Anyone can view published posts" ON "public"."blog_posts" FOR SELECT USING (("is_published" = true));



CREATE POLICY "Anyone can view segments" ON "public"."segments" FOR SELECT USING (true);



CREATE POLICY "Anyone can view tags" ON "public"."tags" FOR SELECT USING (true);



CREATE POLICY "Anyone can view visible FAQs" ON "public"."faqs" FOR SELECT USING (("is_visible" = true));



CREATE POLICY "Anyone can view visible hero_slides" ON "public"."hero_slides" FOR SELECT USING (("is_visible" = true));



CREATE POLICY "Anyone can view visible homepage blocks" ON "public"."homepage_blocks" FOR SELECT USING (("is_visible" = true));



CREATE POLICY "Anyone can view visible instagram posts" ON "public"."instagram_posts" FOR SELECT USING (("is_visible" = true));



CREATE POLICY "Anyone can view visible reviews" ON "public"."product_reviews" FOR SELECT USING (("is_visible" = true));



CREATE POLICY "Anyone can view visible testimonials" ON "public"."testimonials" FOR SELECT USING (("is_visible" = true));



CREATE POLICY "Collection products admin write" ON "public"."collection_products" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Collection products public read" ON "public"."collection_products" FOR SELECT USING (true);



CREATE POLICY "Collections admin write" ON "public"."collections" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Collections public read" ON "public"."collections" FOR SELECT USING ((("is_active" = true) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Only admins can delete social proof settings" ON "public"."social_proof_settings" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Only admins can insert social proof settings" ON "public"."social_proof_settings" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Only admins can update social proof settings" ON "public"."social_proof_settings" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Owners manage their wishlist share" ON "public"."wishlist_shares" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Public can read shipping_settings" ON "public"."shipping_settings" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can view SEO settings" ON "public"."store_settings" FOR SELECT USING ((("key" = 'seo_config'::"text") OR ("key" = 'last_sitemap_update'::"text")));



CREATE POLICY "Public can view active kits" ON "public"."kits" FOR SELECT USING ((("is_active" = true) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Public can view active product faqs" ON "public"."product_faqs" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public can view footer config" ON "public"."store_settings" FOR SELECT USING (("key" = 'footer_config'::"text"));



CREATE POLICY "Public can view homepage settings" ON "public"."store_settings" FOR SELECT USING (("key" = ANY (ARRAY['homepage_config'::"text", 'contact_info'::"text", 'social_links'::"text"])));



CREATE POLICY "Public can view instagram feed embed config" ON "public"."store_settings" FOR SELECT USING (("key" = 'instagram_feed_embed_config'::"text"));



CREATE POLICY "Public can view kit_products of active kits" ON "public"."kit_products" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."kits" "k"
  WHERE (("k"."id" = "kit_products"."kit_id") AND (("k"."is_active" = true) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))))));



CREATE POLICY "Public can view merchant feed config" ON "public"."store_settings" FOR SELECT USING ((("key" = 'merchant_feed_config'::"text") OR ("key" = 'last_sitemap_submission'::"text")));



CREATE POLICY "Public can view payment settings" ON "public"."store_settings" FOR SELECT USING (("key" = 'payment_config'::"text"));



CREATE POLICY "Public can view robots config" ON "public"."store_settings" FOR SELECT USING (("key" = 'robots_config'::"text"));



CREATE POLICY "Public can view stale_bundle_config" ON "public"."store_settings" FOR SELECT USING (("key" = 'stale_bundle_config'::"text"));



CREATE POLICY "Public can view tracking config" ON "public"."store_settings" FOR SELECT USING (("key" = 'tracking_config'::"text"));



CREATE POLICY "Public can view trust badges config" ON "public"."store_settings" FOR SELECT USING (("key" = 'trust_badges_config'::"text"));



CREATE POLICY "Public read active product slugs" ON "public"."product_slugs" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Public read reserved_slugs" ON "public"."reserved_slugs" FOR SELECT USING (true);



CREATE POLICY "Public wishlist shares are readable" ON "public"."wishlist_shares" FOR SELECT TO "authenticated", "anon" USING (("is_public" = true));



CREATE POLICY "Qualquer um lê config do banner" ON "public"."cookie_consent_config" FOR SELECT USING (true);



CREATE POLICY "Social proof settings are public readable" ON "public"."social_proof_settings" FOR SELECT USING (true);



CREATE POLICY "Staff can read product versions" ON "public"."product_versions" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'editor'::"public"."app_role")));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage their own wishlist" ON "public"."wishlists" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view own access requests" ON "public"."admin_access_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."access_request_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin inserts contact_migration_audit" ON "public"."contact_migration_audit" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admin reads contact_migration_audit" ON "public"."contact_migration_audit" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admin reads profile_change_audit" ON "public"."profile_change_audit" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."admin_access_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_operational_settings" ON "public"."operational_settings" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admin_read_approvals" ON "public"."catalog_security_approvals" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."admin_usage_aggregates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins can read funnel events" ON "public"."pdp_funnel_events" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins delete search log" ON "public"."search_query_log" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins full access nexus convergence" ON "public"."seo_nexus_convergence_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins full access seo_causality_registry" ON "public"."seo_causality_registry" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins full access seo_coherence_matrix_snapshots" ON "public"."seo_coherence_matrix_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins full access seo_integrity_grid_snapshots" ON "public"."seo_integrity_grid_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins full access seo_operating_fabric_snapshots" ON "public"."seo_operating_fabric_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins full access seo_structural_dependencies" ON "public"."seo_structural_dependencies" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins full access stability fabric" ON "public"."seo_stability_fabric_snapshots" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "admins read search log" ON "public"."search_query_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."blog_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalog_security_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collection_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."combination_pages_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_migration_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cookie_consent_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cookie_consents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cookie_consents_admin_read" ON "public"."cookie_consents" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."coupon_uses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_admin_all" ON "public"."customers" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."data_deletion_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."faqs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hero_slides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."home_section_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_section_audit admin read" ON "public"."home_section_audit" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."home_sections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_sections admin delete" ON "public"."home_sections" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "home_sections admin insert" ON "public"."home_sections" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "home_sections admin update" ON "public"."home_sections" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "home_sections public read visible" ON "public"."home_sections" FOR SELECT USING (true);



ALTER TABLE "public"."homepage_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."image_processing_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_embed_failures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_feed_embeds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_post_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instagram_sync_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."internal_function_secrets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_function_secrets_no_public_access" ON "public"."internal_function_secrets" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."kit_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_audit_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_backup_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."merchant_feed_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."occasion_landings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."occasions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."operational_worker_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_status_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pdp_badge_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pdp_funnel_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pdp_section_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pdp_section_audit admin read" ON "public"."pdp_section_audit" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."pdp_sections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pdp_sections admin delete" ON "public"."pdp_sections" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "pdp_sections admin insert" ON "public"."pdp_sections" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "pdp_sections admin update" ON "public"."pdp_sections" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "pdp_sections public read visible" ON "public"."pdp_sections" FOR SELECT USING ((("is_visible" = true) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



ALTER TABLE "public"."product_faqs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_occasions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_slugs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_change_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."redirects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reserved_slugs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."review_import_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_promotion_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "search boosts admin all" ON "public"."search_boosts" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "search boosts public read" ON "public"."search_boosts" FOR SELECT TO "authenticated", "anon" USING ("is_active");



ALTER TABLE "public"."search_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "search_audit_log_admin_read" ON "public"."search_audit_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."search_boosts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_query_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_synonyms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_scan_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_adaptive_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_alert_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_causality_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_check_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_civilization_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_cluster_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_cognitive_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_coherence_conflicts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_coherence_matrix_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_consciousness_fabric_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_consciousness_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_consolidation_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_continuum_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_decision_lineage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_engine_conflicts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_engine_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_entity_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_execution_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_execution_orchestrator_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_executive_core_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_executive_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_final_governance_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_governance_matrix_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_gsc_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_integrity_grid_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_kernel_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_meta_governance_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_meta_reasoning_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_metric_consistency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_metric_lineage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_metric_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_nervous_system_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_nexus_convergence_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_operating_fabric_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_operational_reality_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_operational_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_reasoning_conflicts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_reasoning_drift_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_simulation_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_stability_fabric_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_strategic_reality_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_strategy_alignment_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_strategy_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_strategy_simulations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_structural_dependencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_submission_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_system_finalization_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_system_health_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_systemic_risk_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_unified_bus_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_unified_nexus_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seo_url_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipping_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipping_providers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipping_quote_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shipping_quote_cache_no_public_access" ON "public"."shipping_quote_cache" TO "authenticated", "anon" USING (false) WITH CHECK (false);



ALTER TABLE "public"."shipping_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shipping_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_proof_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stale_bundle_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."store_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "synonyms_admin_delete" ON "public"."search_synonyms" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "synonyms_admin_insert" ON "public"."search_synonyms" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "synonyms_admin_select_all" ON "public"."search_synonyms" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "synonyms_admin_update" ON "public"."search_synonyms" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "synonyms_public_read" ON "public"."search_synonyms" FOR SELECT USING (("active" = true));



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telemetry_alert_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."testimonials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."theme_hubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracking_email_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visitor_pageviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visitor_pageviews_admin_read" ON "public"."visitor_pageviews" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."visitor_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visitor_sessions_admin_read" ON "public"."visitor_sessions" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."visitors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visitors_admin_read" ON "public"."visitors" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."web_vitals_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlist_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wishlists" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_audit_anomalies"("_window_hours" integer, "_threshold" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_audit_anomalies"("_window_hours" integer, "_threshold" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_audit_anomalies"("_window_hours" integer, "_threshold" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_default_weight"("_default_kg" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_default_weight"("_default_kg" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_default_weight"("_default_kg" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_catalog_security"("_scan_id" "uuid", "_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_catalog_security"("_scan_id" "uuid", "_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_catalog_security"("_scan_id" "uuid", "_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_home_sections"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_home_sections"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_home_sections"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_pdp_sections"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_pdp_sections"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_pdp_sections"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_role_revocation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_role_revocation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_system_dump"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_system_dump"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_system_dump"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_create_redirect_on_slug_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_create_redirect_on_slug_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_search_cache_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."catalog_security_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."catalog_security_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."catalog_security_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_resend_email_cooldown"("_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_resend_email_cooldown"("_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_resend_email_cooldown"("_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_taxonomy_slug_unique"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_taxonomy_slug_unique"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_taxonomy_slug_unique"() TO "service_role";



GRANT ALL ON TABLE "public"."image_processing_jobs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE ON TABLE "public"."image_processing_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."image_processing_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_image_processing_jobs"("_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_image_processing_jobs"("_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_pdp_badge_events"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_pdp_badge_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_pdp_badge_events"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_pdp_funnel_events"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_pdp_funnel_events"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_seo_url_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_seo_url_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_stale_bundle_logs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_stale_bundle_logs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cleanup_web_vitals_history"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_web_vitals_history"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_order_with_items"("_order" "jsonb", "_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_order_with_items"("_order" "jsonb", "_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_order_with_items"("_order" "jsonb", "_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_order_with_items"("_order" "jsonb", "_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_catalog_security"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_catalog_security"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_catalog_security"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_product_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_product_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_product_category"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_product_weight_on_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_product_weight_on_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_external_ref"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_external_ref"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_external_ref"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fill_product_google_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."fill_product_google_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fill_product_google_category"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gen_external_ref"("_prefix" "text", "_slug" "text", "_fallback" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gen_external_ref"("_prefix" "text", "_slug" "text", "_fallback" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gen_external_ref"("_prefix" "text", "_slug" "text", "_fallback" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gen_img_ref"("_prefix" "text", "_hint" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gen_img_ref"("_prefix" "text", "_hint" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gen_img_ref"("_prefix" "text", "_hint" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unified_profile"("_kind" "text", "_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unified_profile"("_kind" "text", "_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unified_profile"("_kind" "text", "_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unified_timeline"("_visitor_ids" "text"[], "_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_unified_timeline"("_visitor_ids" "text"[], "_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unified_timeline"("_visitor_ids" "text"[], "_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";



GRANT ALL ON FUNCTION "public"."link_visitor_to_customer"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_visitor_to_customer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_visitor_to_customer"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_admin_audit_timeline"("_search" "text", "_status" "text", "_source" "text", "_from" timestamp with time zone, "_to" timestamp with time zone, "_sort_key" "text", "_sort_dir" "text", "_limit" integer, "_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_admin_audit_timeline"("_search" "text", "_status" "text", "_source" "text", "_from" timestamp with time zone, "_to" timestamp with time zone, "_sort_key" "text", "_sort_dir" "text", "_limit" integer, "_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_admin_audit_timeline"("_search" "text", "_status" "text", "_source" "text", "_from" timestamp with time zone, "_to" timestamp with time zone, "_sort_key" "text", "_sort_dir" "text", "_limit" integer, "_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_all_users"("_search" "text", "_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."list_all_users"("_search" "text", "_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_all_users"("_search" "text", "_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."list_all_users_paginated"("_search" "text", "_role" "text", "_source" "text", "_whatsapp" "text", "_ip" "text", "_sort_key" "text", "_sort_dir" "text", "_limit" integer, "_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_all_users_paginated"("_search" "text", "_role" "text", "_source" "text", "_whatsapp" "text", "_ip" "text", "_sort_key" "text", "_sort_dir" "text", "_limit" integer, "_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_all_users_paginated"("_search" "text", "_role" "text", "_source" "text", "_whatsapp" "text", "_ip" "text", "_sort_key" "text", "_sort_dir" "text", "_limit" integer, "_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_contact_migration_audit"("_search" "text", "_status" "text", "_kind" "text", "_limit" integer, "_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_contact_migration_audit"("_search" "text", "_status" "text", "_kind" "text", "_limit" integer, "_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_contact_migration_audit"("_search" "text", "_status" "text", "_kind" "text", "_limit" integer, "_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_cron_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_cron_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_cron_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_cron_runs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_cron_runs"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_cron_runs"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."list_user_audit"("_email" "text", "_from" timestamp with time zone, "_to" timestamp with time zone, "_status" "text", "_limit" integer, "_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_user_audit"("_email" "text", "_from" timestamp with time zone, "_to" timestamp with time zone, "_status" "text", "_limit" integer, "_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_user_audit"("_email" "text", "_from" timestamp with time zone, "_to" timestamp with time zone, "_status" "text", "_limit" integer, "_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_search"("_q" "text", "_result_count" integer, "_suggestion" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_search"("_q" "text", "_result_count" integer, "_suggestion" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_search"("_q" "text", "_result_count" integer, "_suggestion" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_search"("_q" "text", "_result_count" integer, "_suggestion" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_search_config_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_search_config_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_sitemap_dirty"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_sitemap_dirty"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_sitemap_dirty"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_visitor_as_lead"("_visitor_id" "uuid", "_trigger" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_visitor_as_lead"("_visitor_id" "uuid", "_trigger" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_visitor_as_lead"("_visitor_id" "uuid", "_trigger" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."media_gc_candidates"("_min_age_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."media_gc_candidates"("_min_age_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."media_relink_references"("_img_refs" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."media_relink_references"("_img_refs" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_customer_to_user_link"("_customer_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_customer_to_user_link"("_customer_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_customer_to_user_link"("_customer_id" "uuid", "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_visitor_to_customer"("_visitor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_visitor_to_customer"("_visitor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_visitor_to_customer"("_visitor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone_digits"("_v" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone_digits"("_v" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone_digits"("_v" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_search"("_s" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_search"("_s" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_search"("_s" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_slug"("_s" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_slug"("_s" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_slug"("_s" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_admins_on_access_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_admins_on_access_request"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_order_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_order_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_order_status_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_role_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_role_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."operational_worker_headers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."operational_worker_headers"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pdp_badge_stats"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."pdp_badge_stats"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pdp_badge_stats"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pdp_funnel_stats"("_from" timestamp with time zone, "_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pdp_funnel_stats"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pdp_funnel_stats"("_from" timestamp with time zone, "_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."product_slugs_normalize"() TO "anon";
GRANT ALL ON FUNCTION "public"."product_slugs_normalize"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."product_slugs_normalize"() TO "service_role";



GRANT ALL ON FUNCTION "public"."products_refresh_search_text"() TO "anon";
GRANT ALL ON FUNCTION "public"."products_refresh_search_text"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."products_refresh_search_text"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."promote_user_to_admin"("_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."promote_user_to_admin"("_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_user_to_admin"("_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rebuild_media_inventory"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rebuild_media_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rebuild_media_inventory"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rebuild_media_inventory_internal"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rebuild_media_inventory_internal"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_coupon_use"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_coupon_use"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_product_slug_hit"("_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_product_slug_hit"("_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_product_slug_hit"("_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_admin_audit_timeline"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_admin_audit_timeline"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_admin_audit_timeline"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_admin_request"("_user_id" "uuid", "_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_admin_request"("_user_id" "uuid", "_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_admin_request"("_user_id" "uuid", "_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_admin_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_admin_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_admin_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_product_slug"("_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_product_slug"("_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_product_slug"("_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."retry_image_processing_job"("_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retry_image_processing_job"("_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."retry_image_processing_job"("_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."revert_product_version"("_version_id" "uuid", "_fields" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."revert_product_version"("_version_id" "uuid", "_fields" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_product_full"("_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_product_full"("_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_product_full"("_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_product_full"("_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_boosts_normalize"() TO "anon";
GRANT ALL ON FUNCTION "public"."search_boosts_normalize"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_boosts_normalize"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_products"("_q" "text", "_limit" integer, "_category_id" "uuid", "_min_price" numeric, "_max_price" numeric, "_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_products"("_q" "text", "_limit" integer, "_category_id" "uuid", "_min_price" numeric, "_max_price" numeric, "_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_products"("_q" "text", "_limit" integer, "_category_id" "uuid", "_min_price" numeric, "_max_price" numeric, "_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_role"("_user_id" "uuid", "_role" "text", "_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_role"("_user_id" "uuid", "_role" "text", "_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_role"("_user_id" "uuid", "_role" "text", "_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_product_slugs_from_products"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_product_slugs_from_products"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_product_slugs_from_products"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_heartbeat"("_visitor_id" "text", "_pageview_id" "uuid", "_delta_seconds" integer, "_scroll_depth" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."track_heartbeat"("_visitor_id" "text", "_pageview_id" "uuid", "_delta_seconds" integer, "_scroll_depth" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_heartbeat"("_visitor_id" "text", "_pageview_id" "uuid", "_delta_seconds" integer, "_scroll_depth" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."track_pageview"("_visitor_id" "text", "_session_id" "uuid", "_path" "text", "_title" "text", "_product_slug" "text", "_referrer" "text", "_from_path" "text", "_cta_id" "text", "_event_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."track_pageview"("_visitor_id" "text", "_session_id" "uuid", "_path" "text", "_title" "text", "_product_slug" "text", "_referrer" "text", "_from_path" "text", "_cta_id" "text", "_event_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_pageview"("_visitor_id" "text", "_session_id" "uuid", "_path" "text", "_title" "text", "_product_slug" "text", "_referrer" "text", "_from_path" "text", "_cta_id" "text", "_event_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."track_pdp_funnel_batch"("_events" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."track_pdp_funnel_batch"("_events" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."track_pdp_funnel_batch"("_events" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_pdp_funnel_batch"("_events" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."track_product_version"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tracking_email_log_set_actor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tracking_email_log_set_actor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trim_shipping_audit_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."trim_shipping_audit_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trim_shipping_audit_logs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."unresolved_catalog_security_scan"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unresolved_catalog_security_scan"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_profile"("_user_id" "uuid", "_full_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_profile"("_user_id" "uuid", "_full_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_profile"("_user_id" "uuid", "_full_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."users_source_counts"() TO "anon";
GRANT ALL ON FUNCTION "public"."users_source_counts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_source_counts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_coupon"("_code" "text", "_subtotal" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_coupon"("_code" "text", "_subtotal" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."validate_coupon"("_code" "text", "_subtotal" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."validate_coupon"("_code" "text", "_subtotal" numeric) TO "authenticated";



GRANT ALL ON TABLE "public"."access_request_notifications" TO "anon";
GRANT ALL ON TABLE "public"."access_request_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."access_request_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."admin_access_requests" TO "anon";
GRANT ALL ON TABLE "public"."admin_access_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_access_requests" TO "service_role";



GRANT ALL ON TABLE "public"."role_promotion_audit" TO "anon";
GRANT ALL ON TABLE "public"."role_promotion_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."role_promotion_audit" TO "service_role";



GRANT ALL ON TABLE "public"."admin_audit_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."admin_usage_aggregates" TO "anon";
GRANT ALL ON TABLE "public"."admin_usage_aggregates" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_usage_aggregates" TO "service_role";



GRANT ALL ON TABLE "public"."blog_posts" TO "anon";
GRANT ALL ON TABLE "public"."blog_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_posts" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_security_approvals" TO "anon";
GRANT ALL ON TABLE "public"."catalog_security_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_security_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."collection_products" TO "anon";
GRANT ALL ON TABLE "public"."collection_products" TO "authenticated";
GRANT ALL ON TABLE "public"."collection_products" TO "service_role";



GRANT ALL ON TABLE "public"."collections" TO "anon";
GRANT ALL ON TABLE "public"."collections" TO "authenticated";
GRANT ALL ON TABLE "public"."collections" TO "service_role";



GRANT ALL ON TABLE "public"."combination_pages_registry" TO "anon";
GRANT ALL ON TABLE "public"."combination_pages_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."combination_pages_registry" TO "service_role";



GRANT ALL ON TABLE "public"."contact_migration_audit" TO "anon";
GRANT ALL ON TABLE "public"."contact_migration_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_migration_audit" TO "service_role";



GRANT ALL ON TABLE "public"."cookie_consent_config" TO "anon";
GRANT ALL ON TABLE "public"."cookie_consent_config" TO "authenticated";
GRANT ALL ON TABLE "public"."cookie_consent_config" TO "service_role";



GRANT ALL ON TABLE "public"."cookie_consents" TO "anon";
GRANT ALL ON TABLE "public"."cookie_consents" TO "authenticated";
GRANT ALL ON TABLE "public"."cookie_consents" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_uses" TO "anon";
GRANT ALL ON TABLE "public"."coupon_uses" TO "authenticated";
GRANT ALL ON TABLE "public"."coupon_uses" TO "service_role";



GRANT ALL ON TABLE "public"."coupons" TO "anon";
GRANT ALL ON TABLE "public"."coupons" TO "authenticated";
GRANT ALL ON TABLE "public"."coupons" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."visitors" TO "anon";
GRANT ALL ON TABLE "public"."visitors" TO "authenticated";
GRANT ALL ON TABLE "public"."visitors" TO "service_role";



GRANT ALL ON TABLE "public"."customer_overview" TO "anon";
GRANT ALL ON TABLE "public"."customer_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_overview" TO "service_role";



GRANT ALL ON TABLE "public"."data_deletion_requests" TO "anon";
GRANT ALL ON TABLE "public"."data_deletion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."data_deletion_requests" TO "service_role";



GRANT ALL ON TABLE "public"."faqs" TO "anon";
GRANT ALL ON TABLE "public"."faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."faqs" TO "service_role";



GRANT ALL ON TABLE "public"."hero_slides" TO "anon";
GRANT ALL ON TABLE "public"."hero_slides" TO "authenticated";
GRANT ALL ON TABLE "public"."hero_slides" TO "service_role";



GRANT ALL ON TABLE "public"."home_section_audit" TO "anon";
GRANT ALL ON TABLE "public"."home_section_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."home_section_audit" TO "service_role";



GRANT ALL ON TABLE "public"."home_sections" TO "anon";
GRANT ALL ON TABLE "public"."home_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."home_sections" TO "service_role";



GRANT ALL ON TABLE "public"."homepage_blocks" TO "anon";
GRANT ALL ON TABLE "public"."homepage_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."homepage_blocks" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_embed_failures" TO "anon";
GRANT ALL ON TABLE "public"."instagram_embed_failures" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_embed_failures" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_feed_embeds" TO "anon";
GRANT ALL ON TABLE "public"."instagram_feed_embeds" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_feed_embeds" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_post_attempts" TO "anon";
GRANT ALL ON TABLE "public"."instagram_post_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_post_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_posts" TO "anon";
GRANT ALL ON TABLE "public"."instagram_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_posts" TO "service_role";



GRANT ALL ON TABLE "public"."instagram_sync_history" TO "anon";
GRANT ALL ON TABLE "public"."instagram_sync_history" TO "authenticated";
GRANT ALL ON TABLE "public"."instagram_sync_history" TO "service_role";



GRANT ALL ON TABLE "public"."internal_function_secrets" TO "anon";
GRANT ALL ON TABLE "public"."internal_function_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_function_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."kit_products" TO "anon";
GRANT ALL ON TABLE "public"."kit_products" TO "authenticated";
GRANT ALL ON TABLE "public"."kit_products" TO "service_role";



GRANT ALL ON TABLE "public"."kits" TO "anon";
GRANT ALL ON TABLE "public"."kits" TO "authenticated";
GRANT ALL ON TABLE "public"."kits" TO "service_role";



GRANT ALL ON TABLE "public"."media_assets" TO "anon";
GRANT ALL ON TABLE "public"."media_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."media_assets" TO "service_role";



GRANT ALL ON TABLE "public"."media_audit_runs" TO "anon";
GRANT ALL ON TABLE "public"."media_audit_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."media_audit_runs" TO "service_role";



GRANT ALL ON TABLE "public"."media_backup_runs" TO "anon";
GRANT ALL ON TABLE "public"."media_backup_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."media_backup_runs" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."merchant_feed_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."merchant_feed_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."merchant_feed_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."occasion_landings" TO "anon";
GRANT ALL ON TABLE "public"."occasion_landings" TO "authenticated";
GRANT ALL ON TABLE "public"."occasion_landings" TO "service_role";



GRANT ALL ON TABLE "public"."occasions" TO "anon";
GRANT ALL ON TABLE "public"."occasions" TO "authenticated";
GRANT ALL ON TABLE "public"."occasions" TO "service_role";



GRANT ALL ON TABLE "public"."operational_settings" TO "anon";
GRANT ALL ON TABLE "public"."operational_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_settings" TO "service_role";



GRANT ALL ON TABLE "public"."operational_worker_credentials" TO "anon";
GRANT ALL ON TABLE "public"."operational_worker_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."operational_worker_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_notifications" TO "anon";
GRANT ALL ON TABLE "public"."order_status_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."page_versions" TO "anon";
GRANT ALL ON TABLE "public"."page_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."page_versions" TO "service_role";



GRANT ALL ON TABLE "public"."pages" TO "anon";
GRANT ALL ON TABLE "public"."pages" TO "authenticated";
GRANT ALL ON TABLE "public"."pages" TO "service_role";



GRANT ALL ON TABLE "public"."payment_events" TO "anon";
GRANT ALL ON TABLE "public"."payment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_events" TO "service_role";



GRANT ALL ON TABLE "public"."pdp_badge_events" TO "anon";
GRANT ALL ON TABLE "public"."pdp_badge_events" TO "authenticated";
GRANT ALL ON TABLE "public"."pdp_badge_events" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."pdp_funnel_events" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."pdp_funnel_events" TO "authenticated";
GRANT ALL ON TABLE "public"."pdp_funnel_events" TO "service_role";



GRANT ALL ON TABLE "public"."pdp_section_audit" TO "anon";
GRANT ALL ON TABLE "public"."pdp_section_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."pdp_section_audit" TO "service_role";



GRANT ALL ON TABLE "public"."pdp_sections" TO "anon";
GRANT ALL ON TABLE "public"."pdp_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."pdp_sections" TO "service_role";



GRANT ALL ON TABLE "public"."product_faqs" TO "anon";
GRANT ALL ON TABLE "public"."product_faqs" TO "authenticated";
GRANT ALL ON TABLE "public"."product_faqs" TO "service_role";



GRANT ALL ON TABLE "public"."product_occasions" TO "anon";
GRANT ALL ON TABLE "public"."product_occasions" TO "authenticated";
GRANT ALL ON TABLE "public"."product_occasions" TO "service_role";



GRANT ALL ON TABLE "public"."product_reviews" TO "anon";
GRANT ALL ON TABLE "public"."product_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."product_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."product_review_stats" TO "anon";
GRANT ALL ON TABLE "public"."product_review_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."product_review_stats" TO "service_role";



GRANT ALL ON TABLE "public"."product_segments" TO "anon";
GRANT ALL ON TABLE "public"."product_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."product_segments" TO "service_role";



GRANT ALL ON TABLE "public"."product_slugs" TO "anon";
GRANT ALL ON TABLE "public"."product_slugs" TO "authenticated";
GRANT ALL ON TABLE "public"."product_slugs" TO "service_role";



GRANT ALL ON TABLE "public"."product_tags" TO "anon";
GRANT ALL ON TABLE "public"."product_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."product_tags" TO "service_role";



GRANT ALL ON TABLE "public"."product_versions" TO "anon";
GRANT ALL ON TABLE "public"."product_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."product_versions" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profile_change_audit" TO "anon";
GRANT ALL ON TABLE "public"."profile_change_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_change_audit" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."redirects" TO "anon";
GRANT ALL ON TABLE "public"."redirects" TO "authenticated";
GRANT ALL ON TABLE "public"."redirects" TO "service_role";



GRANT ALL ON TABLE "public"."reserved_slugs" TO "anon";
GRANT ALL ON TABLE "public"."reserved_slugs" TO "authenticated";
GRANT ALL ON TABLE "public"."reserved_slugs" TO "service_role";



GRANT ALL ON TABLE "public"."review_import_audit" TO "anon";
GRANT ALL ON TABLE "public"."review_import_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."review_import_audit" TO "service_role";



GRANT ALL ON TABLE "public"."search_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."search_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."search_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."search_boosts" TO "anon";
GRANT ALL ON TABLE "public"."search_boosts" TO "authenticated";
GRANT ALL ON TABLE "public"."search_boosts" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."search_query_log" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."search_query_log" TO "authenticated";
GRANT ALL ON TABLE "public"."search_query_log" TO "service_role";



GRANT ALL ON TABLE "public"."search_insights_summary" TO "anon";
GRANT ALL ON TABLE "public"."search_insights_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."search_insights_summary" TO "service_role";



GRANT ALL ON TABLE "public"."search_synonyms" TO "anon";
GRANT ALL ON TABLE "public"."search_synonyms" TO "authenticated";
GRANT ALL ON TABLE "public"."search_synonyms" TO "service_role";



GRANT ALL ON TABLE "public"."security_scan_runs" TO "anon";
GRANT ALL ON TABLE "public"."security_scan_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."security_scan_runs" TO "service_role";



GRANT ALL ON TABLE "public"."segments" TO "anon";
GRANT ALL ON TABLE "public"."segments" TO "authenticated";
GRANT ALL ON TABLE "public"."segments" TO "service_role";



GRANT ALL ON TABLE "public"."seo_adaptive_memory" TO "anon";
GRANT ALL ON TABLE "public"."seo_adaptive_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_adaptive_memory" TO "service_role";



GRANT ALL ON TABLE "public"."seo_alert_log" TO "anon";
GRANT ALL ON TABLE "public"."seo_alert_log" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_alert_log" TO "service_role";



GRANT ALL ON TABLE "public"."seo_causality_registry" TO "anon";
GRANT ALL ON TABLE "public"."seo_causality_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_causality_registry" TO "service_role";



GRANT ALL ON TABLE "public"."seo_check_runs" TO "anon";
GRANT ALL ON TABLE "public"."seo_check_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_check_runs" TO "service_role";



GRANT ALL ON TABLE "public"."seo_civilization_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_civilization_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_civilization_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_cluster_memory" TO "anon";
GRANT ALL ON TABLE "public"."seo_cluster_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_cluster_memory" TO "service_role";



GRANT ALL ON TABLE "public"."seo_cognitive_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_cognitive_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_cognitive_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_coherence_conflicts" TO "anon";
GRANT ALL ON TABLE "public"."seo_coherence_conflicts" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_coherence_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."seo_coherence_matrix_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_coherence_matrix_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_coherence_matrix_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_consciousness_fabric_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_consciousness_fabric_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_consciousness_fabric_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_consciousness_memory" TO "anon";
GRANT ALL ON TABLE "public"."seo_consciousness_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_consciousness_memory" TO "service_role";



GRANT ALL ON TABLE "public"."seo_consolidation_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_consolidation_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_consolidation_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_continuum_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_continuum_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_continuum_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_decision_lineage" TO "anon";
GRANT ALL ON TABLE "public"."seo_decision_lineage" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_decision_lineage" TO "service_role";



GRANT ALL ON TABLE "public"."seo_engine_conflicts" TO "anon";
GRANT ALL ON TABLE "public"."seo_engine_conflicts" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_engine_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."seo_engine_registry" TO "anon";
GRANT ALL ON TABLE "public"."seo_engine_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_engine_registry" TO "service_role";



GRANT ALL ON TABLE "public"."seo_entity_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_entity_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_entity_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_execution_log" TO "anon";
GRANT ALL ON TABLE "public"."seo_execution_log" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_execution_log" TO "service_role";



GRANT ALL ON TABLE "public"."seo_execution_orchestrator_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_execution_orchestrator_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_execution_orchestrator_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_executive_core_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_executive_core_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_executive_core_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_executive_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_executive_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_executive_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_final_governance_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_final_governance_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_final_governance_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_governance_matrix_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_governance_matrix_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_governance_matrix_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_gsc_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_gsc_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_gsc_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_integrity_grid_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_integrity_grid_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_integrity_grid_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_kernel_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_kernel_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_kernel_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_meta_governance_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_meta_governance_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_meta_governance_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_meta_reasoning_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_meta_reasoning_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_meta_reasoning_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_metric_consistency" TO "anon";
GRANT ALL ON TABLE "public"."seo_metric_consistency" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_metric_consistency" TO "service_role";



GRANT ALL ON TABLE "public"."seo_metric_lineage" TO "anon";
GRANT ALL ON TABLE "public"."seo_metric_lineage" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_metric_lineage" TO "service_role";



GRANT ALL ON TABLE "public"."seo_metric_registry" TO "anon";
GRANT ALL ON TABLE "public"."seo_metric_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_metric_registry" TO "service_role";



GRANT ALL ON TABLE "public"."seo_nervous_system_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_nervous_system_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_nervous_system_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_nexus_convergence_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_nexus_convergence_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_nexus_convergence_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_operating_fabric_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_operating_fabric_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_operating_fabric_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_operational_reality_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_operational_reality_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_operational_reality_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_operational_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_operational_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_operational_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_reasoning_conflicts" TO "anon";
GRANT ALL ON TABLE "public"."seo_reasoning_conflicts" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_reasoning_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."seo_reasoning_drift_registry" TO "anon";
GRANT ALL ON TABLE "public"."seo_reasoning_drift_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_reasoning_drift_registry" TO "service_role";



GRANT ALL ON TABLE "public"."seo_simulation_runs" TO "anon";
GRANT ALL ON TABLE "public"."seo_simulation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_simulation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."seo_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_stability_fabric_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_stability_fabric_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_stability_fabric_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_strategic_reality_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_strategic_reality_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_strategic_reality_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_strategy_alignment_registry" TO "anon";
GRANT ALL ON TABLE "public"."seo_strategy_alignment_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_strategy_alignment_registry" TO "service_role";



GRANT ALL ON TABLE "public"."seo_strategy_memory" TO "anon";
GRANT ALL ON TABLE "public"."seo_strategy_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_strategy_memory" TO "service_role";



GRANT ALL ON TABLE "public"."seo_strategy_simulations" TO "anon";
GRANT ALL ON TABLE "public"."seo_strategy_simulations" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_strategy_simulations" TO "service_role";



GRANT ALL ON TABLE "public"."seo_structural_dependencies" TO "anon";
GRANT ALL ON TABLE "public"."seo_structural_dependencies" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_structural_dependencies" TO "service_role";



GRANT ALL ON TABLE "public"."seo_submission_log" TO "anon";
GRANT ALL ON TABLE "public"."seo_submission_log" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_submission_log" TO "service_role";



GRANT ALL ON TABLE "public"."seo_system_finalization_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_system_finalization_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_system_finalization_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_system_health_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_system_health_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_system_health_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_systemic_risk_registry" TO "anon";
GRANT ALL ON TABLE "public"."seo_systemic_risk_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_systemic_risk_registry" TO "service_role";



GRANT ALL ON TABLE "public"."seo_unified_bus_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_unified_bus_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_unified_bus_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_unified_nexus_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."seo_unified_nexus_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_unified_nexus_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seo_url_status" TO "anon";
GRANT ALL ON TABLE "public"."seo_url_status" TO "authenticated";
GRANT ALL ON TABLE "public"."seo_url_status" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."shipping_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_providers" TO "anon";
GRANT ALL ON TABLE "public"."shipping_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_providers" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_quote_cache" TO "anon";
GRANT ALL ON TABLE "public"."shipping_quote_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_quote_cache" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_rules" TO "anon";
GRANT ALL ON TABLE "public"."shipping_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_rules" TO "service_role";



GRANT ALL ON TABLE "public"."shipping_settings" TO "anon";
GRANT ALL ON TABLE "public"."shipping_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."shipping_settings" TO "service_role";



GRANT ALL ON TABLE "public"."social_proof_settings" TO "anon";
GRANT ALL ON TABLE "public"."social_proof_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."social_proof_settings" TO "service_role";



GRANT ALL ON TABLE "public"."stale_bundle_logs" TO "anon";
GRANT ALL ON TABLE "public"."stale_bundle_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."stale_bundle_logs" TO "service_role";



GRANT ALL ON TABLE "public"."store_settings" TO "anon";
GRANT ALL ON TABLE "public"."store_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."store_settings" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."taxonomy_registry" TO "anon";
GRANT ALL ON TABLE "public"."taxonomy_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."taxonomy_registry" TO "service_role";



GRANT ALL ON TABLE "public"."telemetry_alert_state" TO "anon";
GRANT ALL ON TABLE "public"."telemetry_alert_state" TO "authenticated";
GRANT ALL ON TABLE "public"."telemetry_alert_state" TO "service_role";



GRANT ALL ON TABLE "public"."testimonials" TO "anon";
GRANT ALL ON TABLE "public"."testimonials" TO "authenticated";
GRANT ALL ON TABLE "public"."testimonials" TO "service_role";



GRANT ALL ON TABLE "public"."theme_hubs" TO "anon";
GRANT ALL ON TABLE "public"."theme_hubs" TO "authenticated";
GRANT ALL ON TABLE "public"."theme_hubs" TO "service_role";



GRANT ALL ON TABLE "public"."tracking_email_log" TO "anon";
GRANT ALL ON TABLE "public"."tracking_email_log" TO "authenticated";
GRANT ALL ON TABLE "public"."tracking_email_log" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."visitor_pageviews" TO "anon";
GRANT ALL ON TABLE "public"."visitor_pageviews" TO "authenticated";
GRANT ALL ON TABLE "public"."visitor_pageviews" TO "service_role";



GRANT ALL ON TABLE "public"."visitor_sessions" TO "anon";
GRANT ALL ON TABLE "public"."visitor_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."visitor_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."web_vitals_reports" TO "anon";
GRANT ALL ON TABLE "public"."web_vitals_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."web_vitals_reports" TO "service_role";



GRANT ALL ON TABLE "public"."wishlist_shares" TO "anon";
GRANT ALL ON TABLE "public"."wishlist_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlist_shares" TO "service_role";



GRANT ALL ON TABLE "public"."wishlists" TO "anon";
GRANT ALL ON TABLE "public"."wishlists" TO "authenticated";
GRANT ALL ON TABLE "public"."wishlists" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";







