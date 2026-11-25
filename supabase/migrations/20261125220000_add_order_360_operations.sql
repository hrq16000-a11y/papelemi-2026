-- Orders 360: parity foundation for order lifecycle, payment audit and fulfillment.
DO $payment_status_type$
BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'approved', 'refunded', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$payment_status_type$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_code text,
  ADD COLUMN IF NOT EXISTS address_cep text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS address_neighborhood text,
  ADD COLUMN IF NOT EXISTS address_city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_state text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_method text NOT NULL DEFAULT 'A combinar',
  ADD COLUMN IF NOT EXISTS shipping_company text,
  ADD COLUMN IF NOT EXISTS shipping_days text,
  ADD COLUMN IF NOT EXISTS shipping_price numeric GENERATED ALWAYS AS (shipping) STORED,
  ADD COLUMN IF NOT EXISTS discount_amount numeric GENERATED ALWAYS AS (discount) STORED,
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_id text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS tracking_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.orders
SET order_code = 'PL-' || upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE order_code IS NULL OR btrim(order_code) = '';

UPDATE public.orders
SET address_cep = COALESCE(NULLIF(address_cep, ''), address->>'cep', ''),
    address_street = COALESCE(address_street, address->>'street'),
    address_number = COALESCE(address_number, address->>'number'),
    address_complement = COALESCE(address_complement, address->>'complement'),
    address_neighborhood = COALESCE(address_neighborhood, address->>'district'),
    address_city = COALESCE(NULLIF(address_city, ''), address->>'city', ''),
    address_state = COALESCE(NULLIF(address_state, ''), address->>'state', ''),
    payment_id = COALESCE(payment_id, mp_payment_id),
    payment_status = CASE WHEN status = 'paid' THEN 'approved'::public.payment_status ELSE payment_status END,
    paid_at = CASE WHEN status = 'paid' THEN COALESCE(paid_at, created_at) ELSE paid_at END;

ALTER TABLE public.orders ALTER COLUMN order_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_store_order_code_uidx
  ON public.orders (store_key, order_code);
CREATE INDEX IF NOT EXISTS orders_store_payment_status_created_idx
  ON public.orders (store_key, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_store_tracking_code_idx
  ON public.orders (store_key, tracking_code)
  WHERE tracking_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi' REFERENCES public.stores(store_key) ON UPDATE CASCADE,
  order_id uuid NOT NULL,
  order_code text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_status_history_store_order_fkey
    FOREIGN KEY (store_key, order_id)
    REFERENCES public.orders(store_key, id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.order_status_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi' REFERENCES public.stores(store_key) ON UPDATE CASCADE,
  order_id uuid NOT NULL,
  order_code text NOT NULL,
  status text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  success boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_status_notifications_store_order_fkey
    FOREIGN KEY (store_key, order_id)
    REFERENCES public.orders(store_key, id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.tracking_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi' REFERENCES public.stores(store_key) ON UPDATE CASCADE,
  order_id uuid NOT NULL,
  order_code text NOT NULL,
  email_type text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  tracking_carrier text,
  tracking_code text,
  tracking_url text,
  triggered_by uuid,
  triggered_by_email text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_email_log_store_order_fkey
    FOREIGN KEY (store_key, order_id)
    REFERENCES public.orders(store_key, id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi' REFERENCES public.stores(store_key) ON UPDATE CASCADE,
  provider text NOT NULL DEFAULT 'mercadopago',
  payment_id text NOT NULL,
  event_id text NOT NULL,
  order_id uuid,
  order_code text,
  provider_status text,
  applied_status public.payment_status,
  result text NOT NULL DEFAULT 'received',
  error_message text,
  duration_ms integer,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_events_store_provider_event_key UNIQUE (store_key, provider, event_id)
);

CREATE INDEX IF NOT EXISTS order_status_history_store_order_created_idx
  ON public.order_status_history (store_key, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_status_notifications_store_order_created_idx
  ON public.order_status_notifications (store_key, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tracking_email_log_store_order_created_idx
  ON public.tracking_email_log (store_key, order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_store_order_created_idx
  ON public.payment_events (store_key, order_id, created_at DESC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_status_history, public.order_status_notifications,
  public.tracking_email_log, public.payment_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.order_status_history, public.order_status_notifications,
  public.tracking_email_log, public.payment_events TO service_role;

CREATE OR REPLACE FUNCTION public.papelemi_sync_order_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.order_code IS NULL OR btrim(NEW.order_code) = '' THEN
    NEW.order_code := 'PL-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8));
  END IF;
  IF NEW.address_cep IS NULL OR btrim(NEW.address_cep) = '' THEN
    NEW.address_cep := COALESCE(NEW.address->>'cep', '');
  END IF;
  IF NEW.address_street IS NULL THEN NEW.address_street := NEW.address->>'street'; END IF;
  IF NEW.address_number IS NULL THEN NEW.address_number := NEW.address->>'number'; END IF;
  IF NEW.address_complement IS NULL THEN NEW.address_complement := NEW.address->>'complement'; END IF;
  IF NEW.address_neighborhood IS NULL THEN NEW.address_neighborhood := NEW.address->>'district'; END IF;
  IF NEW.address_city IS NULL OR btrim(NEW.address_city) = '' THEN
    NEW.address_city := COALESCE(NEW.address->>'city', '');
  END IF;
  IF NEW.address_state IS NULL OR btrim(NEW.address_state) = '' THEN
    NEW.address_state := COALESCE(NEW.address->>'state', '');
  END IF;
  IF NEW.status = 'shipped' AND NEW.shipped_at IS NULL THEN NEW.shipped_at := now(); END IF;
  IF NEW.status = 'delivered' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_papelemi_sync_order_metadata ON public.orders;
CREATE TRIGGER trg_papelemi_sync_order_metadata
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.papelemi_sync_order_metadata();

CREATE OR REPLACE FUNCTION public.papelemi_record_order_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor_id uuid;
  v_note text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history (store_key, order_id, order_code, from_status, to_status, note)
    VALUES (NEW.store_key, NEW.id, NEW.order_code, NULL, NEW.status, 'Pedido recebido');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
    EXCEPTION WHEN others THEN
      v_actor_id := NULL;
    END;
    v_note := NULLIF(current_setting('app.order_change_note', true), '');
    INSERT INTO public.order_status_history (store_key, order_id, order_code, from_status, to_status, note, changed_by)
    VALUES (NEW.store_key, NEW.id, NEW.order_code, OLD.status, NEW.status, v_note, v_actor_id);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_papelemi_record_order_status_history ON public.orders;
CREATE TRIGGER trg_papelemi_record_order_status_history
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.papelemi_record_order_status_history();

CREATE OR REPLACE FUNCTION public.admin_update_order(
  _actor_id uuid,
  _order_id uuid,
  _status text,
  _shipping_method text,
  _shipping_company text,
  _shipping_days text,
  _shipping_price numeric,
  _tracking_code text,
  _tracking_carrier text,
  _tracking_url text,
  _notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _actor_id
      AND store_key = 'papelemi'
      AND role = 'admin'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador da PapeLemi' USING ERRCODE = '42501';
  END IF;

  IF _status NOT IN ('pending', 'paid', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Status de pedido inválido' USING ERRCODE = '22023';
  END IF;
  IF _shipping_price IS NULL OR _shipping_price < 0 THEN
    RAISE EXCEPTION 'Valor de frete inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = _order_id AND store_key = 'papelemi'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('app.actor_id', _actor_id::text, true);
  PERFORM set_config('app.order_change_note', COALESCE(_notes, ''), true);

  UPDATE public.orders
  SET status = _status,
      shipping_method = COALESCE(NULLIF(btrim(_shipping_method), ''), shipping_method),
      shipping_company = NULLIF(btrim(_shipping_company), ''),
      shipping_days = NULLIF(btrim(_shipping_days), ''),
      shipping = _shipping_price,
      total = round(subtotal - discount + _shipping_price, 2),
      tracking_code = NULLIF(btrim(_tracking_code), ''),
      tracking_carrier = NULLIF(btrim(_tracking_carrier), ''),
      tracking_url = NULLIF(btrim(_tracking_url), ''),
      notes = NULLIF(btrim(_notes), ''),
      shipped_at = CASE WHEN _status = 'shipped' THEN COALESCE(shipped_at, now()) ELSE shipped_at END,
      delivered_at = CASE WHEN _status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      updated_at = now()
  WHERE id = _order_id AND store_key = 'papelemi';

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'order_code', v_order.order_code,
    'status', _status
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_update_order(uuid, uuid, text, text, text, text, numeric, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_order(uuid, uuid, text, text, text, text, numeric, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.check_resend_email_cooldown(
  _order_id uuid,
  _email_type text,
  _cooldown_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $fn$
  WITH last_sent AS (
    SELECT max(created_at) AS last_sent_at
    FROM public.tracking_email_log
    WHERE store_key = 'papelemi'
      AND order_id = _order_id
      AND email_type = _email_type
      AND status = 'sent'
  )
  SELECT jsonb_build_object(
    'allowed',
      last_sent_at IS NULL OR last_sent_at <= now() - make_interval(secs => greatest(_cooldown_seconds, 0)),
    'wait_seconds',
      CASE
        WHEN last_sent_at IS NULL THEN 0
        ELSE greatest(0, ceil(extract(epoch FROM (
          last_sent_at + make_interval(secs => greatest(_cooldown_seconds, 0)) - now()
        )))::integer)
      END,
    'last_sent_at', last_sent_at
  )
  FROM last_sent;
$fn$;

REVOKE ALL ON FUNCTION public.check_resend_email_cooldown(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_resend_email_cooldown(uuid, text, integer)
  TO service_role;

COMMENT ON TABLE public.order_status_history IS
  'Store-scoped audit trail for order lifecycle changes. Read/write only through trusted server functions.';
COMMENT ON TABLE public.payment_events IS
  'Store-scoped, idempotent payment webhook audit; raw payloads must contain only minimized provider fields.';
COMMENT ON TABLE public.tracking_email_log IS
  'Store-scoped transactional email attempt log; sender credentials remain server-side.';
