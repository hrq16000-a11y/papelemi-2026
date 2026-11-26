-- PapeLemi-specific fields and server-only rate limiting on the imported Emporio engine.
-- Additive only: no source-store data, credentials, or destructive changes.

ALTER TABLE papelemi_engine.products
  ADD COLUMN IF NOT EXISTS colors text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sizes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS finishes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 0;

ALTER TABLE papelemi_engine.customers
  ADD COLUMN IF NOT EXISTS email_normalized text;

UPDATE papelemi_engine.customers
SET email_normalized = lower(trim(email))
WHERE email IS NOT NULL AND email_normalized IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_normalized_uniq
  ON papelemi_engine.customers (email_normalized)
  WHERE email_normalized IS NOT NULL;

ALTER TABLE papelemi_engine.orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES papelemi_engine.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS accepted_privacy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS customer_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_snapshot jsonb NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS orders_request_id_uniq
  ON papelemi_engine.orders (request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE papelemi_engine.order_items
  ADD COLUMN IF NOT EXISTS line_total numeric(10,2),
  ADD COLUMN IF NOT EXISTS personalization_data jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS papelemi_engine.shipping_quote_rate_limits (
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (ip_hash, window_start)
);

ALTER TABLE papelemi_engine.shipping_quote_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE papelemi_engine.shipping_quote_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE papelemi_engine.shipping_quote_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION papelemi_engine.consume_shipping_quote_rate_limit(
  _ip_hash text,
  _window_start timestamptz,
  _limit integer DEFAULT 20
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO papelemi_engine, pg_catalog, public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF _ip_hash IS NULL OR _ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid rate-limit fingerprint';
  END IF;
  IF _window_start IS NULL THEN
    _window_start := date_trunc('minute', now());
  ELSE
    _window_start := date_trunc('minute', _window_start);
  END IF;
  IF _limit IS NULL OR _limit < 1 OR _limit > 1000 THEN
    _limit := 20;
  END IF;

  INSERT INTO papelemi_engine.shipping_quote_rate_limits (ip_hash, window_start, request_count)
  VALUES (_ip_hash, _window_start, 1)
  ON CONFLICT (ip_hash, window_start)
  DO UPDATE SET request_count = papelemi_engine.shipping_quote_rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION papelemi_engine.consume_shipping_quote_rate_limit(text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION papelemi_engine.consume_shipping_quote_rate_limit(text, timestamptz, integer) TO service_role;
