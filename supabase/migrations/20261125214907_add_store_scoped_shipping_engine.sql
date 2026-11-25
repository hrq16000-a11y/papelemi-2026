-- Store-scoped shipping engine for PapeLemi.
-- Provider credentials are intentionally blank; no Emporio secrets or data are imported.

DO $shipping_types$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='shipping_condition_type') THEN
    CREATE TYPE public.shipping_condition_type AS ENUM ('min_cart_value','specific_state','zip_code_range');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='shipping_discount_type') THEN
    CREATE TYPE public.shipping_discount_type AS ENUM ('free_shipping','fixed_discount','percentage_discount');
  END IF;
END;
$shipping_types$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_kg numeric(10,3),
  ADD COLUMN IF NOT EXISTS length_cm numeric(10,2),
  ADD COLUMN IF NOT EXISTS width_cm numeric(10,2),
  ADD COLUMN IF NOT EXISTS height_cm numeric(10,2),
  ADD COLUMN IF NOT EXISTS requires_shipping boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD CONSTRAINT products_weight_nonnegative_check CHECK (weight_kg IS NULL OR weight_kg >= 0),
  ADD CONSTRAINT products_length_positive_check CHECK (length_cm IS NULL OR length_cm > 0),
  ADD CONSTRAINT products_width_positive_check CHECK (width_cm IS NULL OR width_cm > 0),
  ADD CONSTRAINT products_height_positive_check CHECK (height_cm IS NULL OR height_cm > 0);

CREATE TABLE IF NOT EXISTS public.shipping_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi'
    REFERENCES public.stores(store_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  origin_zip_code text NOT NULL DEFAULT '',
  default_box_weight_kg numeric NOT NULL DEFAULT 0.150 CHECK (default_box_weight_kg > 0 AND default_box_weight_kg <= 30),
  default_box_length_cm numeric NOT NULL DEFAULT 16 CHECK (default_box_length_cm > 0 AND default_box_length_cm <= 200),
  default_box_width_cm numeric NOT NULL DEFAULT 11 CHECK (default_box_width_cm > 0 AND default_box_width_cm <= 200),
  default_box_height_cm numeric NOT NULL DEFAULT 6 CHECK (default_box_height_cm > 0 AND default_box_height_cm <= 200),
  handling_fee numeric NOT NULL DEFAULT 0 CHECK (handling_fee >= 0),
  shipping_markup_percentage numeric NOT NULL DEFAULT 0 CHECK (shipping_markup_percentage BETWEEN 0 AND 100),
  singleton boolean NOT NULL DEFAULT true,
  is_enabled boolean NOT NULL DEFAULT false,
  pickup_enabled boolean NOT NULL DEFAULT false,
  pickup_label text NOT NULL DEFAULT 'Retirada no ateliê',
  pickup_address text NOT NULL DEFAULT '',
  pickup_instructions text NOT NULL DEFAULT '',
  free_shipping_enabled boolean NOT NULL DEFAULT false,
  free_shipping_threshold numeric NOT NULL DEFAULT 299 CHECK (free_shipping_threshold >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipping_settings_store_singleton_key UNIQUE (store_key,singleton)
);

CREATE TABLE IF NOT EXISTS public.shipping_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi'
    REFERENCES public.stores(store_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  provider_name text NOT NULL,
  provider_code text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  api_key text,
  api_secret text,
  endpoint_url text,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipping_providers_store_code_key UNIQUE (store_key,provider_code)
);

CREATE TABLE IF NOT EXISTS public.shipping_quote_cache (
  store_key text NOT NULL DEFAULT 'papelemi'
    REFERENCES public.stores(store_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  cache_key text NOT NULL,
  options jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipping_quote_cache_pkey PRIMARY KEY (store_key,cache_key)
);

CREATE TABLE IF NOT EXISTS public.shipping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi'
    REFERENCES public.stores(store_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  rule_name text NOT NULL,
  condition_type public.shipping_condition_type NOT NULL,
  condition_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  discount_type public.shipping_discount_type NOT NULL,
  discount_value numeric NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipping_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi'
    REFERENCES public.stores(store_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  destination_zip text,
  cart_snapshot jsonb,
  provider_name text,
  error_message text,
  http_status integer,
  event_type text NOT NULL DEFAULT 'provider_error',
  total_weight_kg numeric,
  melhor_envio_has_key boolean,
  estimated boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipping_quote_rate_limits (
  store_key text NOT NULL DEFAULT 'papelemi'
    REFERENCES public.stores(store_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  CONSTRAINT shipping_quote_rate_limits_pkey PRIMARY KEY (store_key,ip_hash,window_start)
);

CREATE INDEX IF NOT EXISTS shipping_settings_store_idx ON public.shipping_settings(store_key);
CREATE INDEX IF NOT EXISTS shipping_providers_store_active_idx ON public.shipping_providers(store_key,is_active);
CREATE INDEX IF NOT EXISTS shipping_rules_store_active_priority_idx ON public.shipping_rules(store_key,is_active,priority DESC);
CREATE INDEX IF NOT EXISTS shipping_audit_store_created_idx ON public.shipping_audit_logs(store_key,created_at DESC);
CREATE INDEX IF NOT EXISTS shipping_quote_cache_created_idx ON public.shipping_quote_cache(store_key,created_at DESC);
CREATE INDEX IF NOT EXISTS shipping_quote_rate_limits_window_idx ON public.shipping_quote_rate_limits(window_start);

CREATE OR REPLACE FUNCTION public.consume_shipping_quote_rate_limit(
  _ip_hash text,
  _window_start timestamptz,
  _limit integer DEFAULT 20
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_count integer;
BEGIN
  IF _ip_hash IS NULL OR length(_ip_hash) <> 64 OR _limit < 1 OR _limit > 120 THEN
    RAISE EXCEPTION 'invalid shipping quote rate-limit arguments';
  END IF;

  DELETE FROM public.shipping_quote_rate_limits
  WHERE store_key='papelemi' AND window_start < now() - interval '1 day';

  INSERT INTO public.shipping_quote_rate_limits(store_key,ip_hash,window_start,request_count)
  VALUES ('papelemi',_ip_hash,_window_start,1)
  ON CONFLICT (store_key,ip_hash,window_start)
  DO UPDATE SET request_count = public.shipping_quote_rate_limits.request_count + 1
  RETURNING request_count INTO current_count;

  RETURN current_count;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_shipping_quote_rate_limit(text,timestamptz,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_shipping_quote_rate_limit(text,timestamptz,integer) TO service_role;

ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_quote_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_quote_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.shipping_settings,public.shipping_providers,public.shipping_quote_cache,public.shipping_rules,public.shipping_audit_logs,public.shipping_quote_rate_limits
  FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.shipping_settings,public.shipping_providers,public.shipping_rules TO authenticated;
GRANT SELECT ON TABLE public.shipping_audit_logs TO authenticated;
GRANT ALL ON TABLE public.shipping_settings,public.shipping_providers,public.shipping_quote_cache,public.shipping_rules,public.shipping_audit_logs,public.shipping_quote_rate_limits TO service_role;

CREATE POLICY shipping_settings_admin_select ON public.shipping_settings
  FOR SELECT TO authenticated USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_settings_admin_insert ON public.shipping_settings
  FOR INSERT TO authenticated WITH CHECK (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_settings_admin_update ON public.shipping_settings
  FOR UPDATE TO authenticated
  USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'))
  WITH CHECK (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_settings_admin_delete ON public.shipping_settings
  FOR DELETE TO authenticated USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));

CREATE POLICY shipping_providers_admin_select ON public.shipping_providers
  FOR SELECT TO authenticated USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_providers_admin_insert ON public.shipping_providers
  FOR INSERT TO authenticated WITH CHECK (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_providers_admin_update ON public.shipping_providers
  FOR UPDATE TO authenticated
  USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'))
  WITH CHECK (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_providers_admin_delete ON public.shipping_providers
  FOR DELETE TO authenticated USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));

CREATE POLICY shipping_rules_admin_select ON public.shipping_rules
  FOR SELECT TO authenticated USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_rules_admin_insert ON public.shipping_rules
  FOR INSERT TO authenticated WITH CHECK (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_rules_admin_update ON public.shipping_rules
  FOR UPDATE TO authenticated
  USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'))
  WITH CHECK (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));
CREATE POLICY shipping_rules_admin_delete ON public.shipping_rules
  FOR DELETE TO authenticated USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));

CREATE POLICY shipping_audit_admin_select ON public.shipping_audit_logs
  FOR SELECT TO authenticated USING (store_key='papelemi' AND public.has_store_role((SELECT auth.uid()),'admin'::public.app_role,'papelemi'));

INSERT INTO public.shipping_settings(store_key,singleton,origin_zip_code,is_enabled,free_shipping_enabled)
VALUES ('papelemi',true,'',false,false)
ON CONFLICT (store_key,singleton) DO NOTHING;

INSERT INTO public.shipping_providers(store_key,provider_name,provider_code,is_active,api_key,endpoint_url)
VALUES ('papelemi','Melhor Envio','melhor_envio',false,NULL,NULL)
ON CONFLICT (store_key,provider_code) DO NOTHING;

COMMENT ON TABLE public.shipping_settings IS 'Store-scoped shipping configuration. PapeLemi origin ZIP must be configured before live freight quotes.';
COMMENT ON TABLE public.shipping_providers IS 'Store-scoped shipping providers. Credentials are configured per store and are not copied from Emporio.';
COMMENT ON TABLE public.shipping_audit_logs IS 'Private operational shipping audit events, scoped to a store.';
COMMENT ON TABLE public.shipping_quote_rate_limits IS 'Hashed-IP rate-limit buckets for public shipping quote requests.';
