-- PapeLemi-first shared engine foundation.
-- Additive only: preserve existing PapeLemi catalog, roles and orders.
-- No Emporio business data, assets or credentials are imported.

CREATE TABLE IF NOT EXISTS public.stores (
  store_key text PRIMARY KEY,
  name text NOT NULL,
  primary_domain text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stores_store_key_format_check CHECK (store_key ~ '^[a-z0-9][a-z0-9_-]{1,39}$')
);

INSERT INTO public.stores (store_key, name, primary_domain)
VALUES ('papelemi', 'PapeLemi', 'www.papelemi.com.br')
ON CONFLICT (store_key) DO NOTHING;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS store_key text NOT NULL DEFAULT 'papelemi';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS store_key text NOT NULL DEFAULT 'papelemi';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS store_key text NOT NULL DEFAULT 'papelemi';
ALTER TABLE public.curated_phrases ADD COLUMN IF NOT EXISTS store_key text NOT NULL DEFAULT 'papelemi';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS store_key text NOT NULL DEFAULT 'papelemi';

ALTER TABLE public.categories ADD CONSTRAINT categories_store_key_fkey
  FOREIGN KEY (store_key) REFERENCES public.stores (store_key) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.products ADD CONSTRAINT products_store_key_fkey
  FOREIGN KEY (store_key) REFERENCES public.stores (store_key) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_store_key_fkey
  FOREIGN KEY (store_key) REFERENCES public.stores (store_key) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.curated_phrases ADD CONSTRAINT curated_phrases_store_key_fkey
  FOREIGN KEY (store_key) REFERENCES public.stores (store_key) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_store_key_fkey
  FOREIGN KEY (store_key) REFERENCES public.stores (store_key) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.orders ADD CONSTRAINT orders_store_key_fkey
  FOREIGN KEY (store_key) REFERENCES public.stores (store_key) ON UPDATE CASCADE ON DELETE RESTRICT;

-- Tenant-scoped natural keys allow equal slugs/codes in different stores.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_slug_fkey;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_pkey;
ALTER TABLE public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (store_key, slug);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_pkey;
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (store_key, slug);
ALTER TABLE public.products ADD CONSTRAINT products_category_store_fkey
  FOREIGN KEY (store_key, category_slug)
  REFERENCES public.categories (store_key, slug) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_pkey;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_pkey PRIMARY KEY (store_key, code);
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_store_user_role_key UNIQUE (store_key, user_id, role);
ALTER TABLE public.orders ADD CONSTRAINT orders_store_key_id_key UNIQUE (store_key, id);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi'
    REFERENCES public.stores (store_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  name text NOT NULL,
  email text,
  email_normalized text,
  phone text,
  whatsapp text,
  city text,
  state text,
  source text,
  status text NOT NULL DEFAULT 'active',
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_store_id_key UNIQUE (store_key, id),
  CONSTRAINT customers_store_email_unique UNIQUE (store_key, email_normalized),
  CONSTRAINT customers_email_normalized_check
    CHECK (email_normalized IS NULL OR (email IS NOT NULL AND email_normalized = lower(btrim(email))))
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id uuid;

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL DEFAULT 'papelemi'
    REFERENCES public.stores (store_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  order_id uuid NOT NULL,
  line_number integer NOT NULL,
  product_name text NOT NULL,
  product_slug text,
  product_image text,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  personalization jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_store_order_line_key UNIQUE (store_key, order_id, line_number),
  CONSTRAINT order_items_store_order_fkey
    FOREIGN KEY (store_key, order_id) REFERENCES public.orders (store_key, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

-- Backfill customers from PapeLemi's own orders only.
INSERT INTO public.customers (store_key, name, email, email_normalized, phone, source, created_at, updated_at)
SELECT DISTINCT ON (o.store_key, lower(btrim(o.customer_email)))
  o.store_key, o.customer_name, o.customer_email, lower(btrim(o.customer_email)),
  o.customer_phone, COALESCE(o.source, 'storefront'), o.created_at, o.created_at
FROM public.orders AS o
WHERE NULLIF(btrim(o.customer_email), '') IS NOT NULL
ORDER BY o.store_key, lower(btrim(o.customer_email)), o.created_at DESC, o.id DESC
ON CONFLICT (store_key, email_normalized) DO NOTHING;

UPDATE public.orders AS o
SET customer_id = c.id
FROM public.customers AS c
WHERE o.customer_id IS NULL
  AND c.store_key = o.store_key
  AND c.email_normalized = lower(btrim(o.customer_email));

-- Keep the existing JSONB snapshot and normalize its line items alongside it.
INSERT INTO public.order_items (
  store_key, order_id, line_number, product_name, product_slug,
  product_image, quantity, unit_price, line_total, personalization
)
SELECT
  o.store_key, o.id, line.ordinality::integer,
  COALESCE(NULLIF(line.value ->> 'name', ''), NULLIF(line.value ->> 'product_name', ''), 'Item do pedido'),
  NULLIF(line.value ->> 'slug', ''), NULLIF(line.value ->> 'image', ''),
  normalized.quantity, normalized.unit_price,
  round(normalized.unit_price * normalized.quantity, 2),
  CASE WHEN jsonb_typeof(line.value -> 'options') = 'object' THEN line.value -> 'options' ELSE '{}'::jsonb END
FROM public.orders AS o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
) WITH ORDINALITY AS line(value, ordinality)
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN COALESCE(line.value ->> 'qty', '') ~ '^[1-9][0-9]{0,2}$'
      THEN (line.value ->> 'qty')::integer ELSE 1 END AS quantity,
    CASE WHEN COALESCE(line.value ->> 'unit_price', '') ~ '^[0-9]+([.][0-9]{1,2})?$'
      THEN (line.value ->> 'unit_price')::numeric(12,2) ELSE 0::numeric(12,2) END AS unit_price
) AS normalized
WHERE jsonb_typeof(line.value) = 'object'
ON CONFLICT (store_key, order_id, line_number) DO NOTHING;

ALTER TABLE public.orders ADD CONSTRAINT orders_store_customer_fkey
  FOREIGN KEY (store_key, customer_id) REFERENCES public.customers (store_key, id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX customers_store_updated_idx ON public.customers (store_key, updated_at DESC);
CREATE INDEX customers_store_phone_idx ON public.customers (store_key, phone) WHERE phone IS NOT NULL;
CREATE INDEX orders_store_customer_created_idx ON public.orders (store_key, customer_id, created_at DESC);
CREATE INDEX order_items_store_order_idx ON public.order_items (store_key, order_id, line_number);
CREATE INDEX curated_phrases_store_active_created_idx ON public.curated_phrases (store_key, active, created_at DESC);

CREATE OR REPLACE FUNCTION public.has_store_role(_user_id uuid, _role public.app_role, _store_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles AS ur
      WHERE ur.user_id = _user_id AND ur.role = _role AND ur.store_key = _store_key
    );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT public.has_store_role(_user_id, _role, 'papelemi');
$$;

REVOKE ALL ON FUNCTION public.has_store_role(uuid, public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_store_role(uuid, public.app_role, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "Categorias públicas anon" ON public.categories;
DROP POLICY IF EXISTS "Categorias públicas autenticadas" ON public.categories;
DROP POLICY IF EXISTS "Admins inserem categorias" ON public.categories;
DROP POLICY IF EXISTS "Admins atualizam categorias" ON public.categories;
DROP POLICY IF EXISTS "Admins removem categorias" ON public.categories;
CREATE POLICY "Categorias públicas anon" ON public.categories FOR SELECT TO anon USING (store_key = 'papelemi');
CREATE POLICY "Categorias públicas autenticadas" ON public.categories FOR SELECT TO authenticated USING (store_key = 'papelemi');
CREATE POLICY "Admins inserem categorias" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));
CREATE POLICY "Admins atualizam categorias" ON public.categories FOR UPDATE TO authenticated
  USING (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'))
  WITH CHECK (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));
CREATE POLICY "Admins removem categorias" ON public.categories FOR DELETE TO authenticated
  USING (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));

DROP POLICY IF EXISTS "Produtos publicados anon" ON public.products;
DROP POLICY IF EXISTS "Produtos publicados ou admin autenticado" ON public.products;
DROP POLICY IF EXISTS "Admins inserem produtos" ON public.products;
DROP POLICY IF EXISTS "Admins atualizam produtos" ON public.products;
DROP POLICY IF EXISTS "Admins removem produtos" ON public.products;
CREATE POLICY "Produtos publicados anon" ON public.products FOR SELECT TO anon USING (store_key = 'papelemi' AND published = true);
CREATE POLICY "Produtos publicados ou admin autenticado" ON public.products FOR SELECT TO authenticated
  USING (store_key = 'papelemi' AND (published = true OR public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi')));
CREATE POLICY "Admins inserem produtos" ON public.products FOR INSERT TO authenticated
  WITH CHECK (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));
CREATE POLICY "Admins atualizam produtos" ON public.products FOR UPDATE TO authenticated
  USING (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'))
  WITH CHECK (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));
CREATE POLICY "Admins removem produtos" ON public.products FOR DELETE TO authenticated
  USING (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));

DROP POLICY IF EXISTS "Cupons ativos anon" ON public.coupons;
DROP POLICY IF EXISTS "Cupons ativos ou admin autenticado" ON public.coupons;
DROP POLICY IF EXISTS "Admins inserem cupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins atualizam cupons" ON public.coupons;
DROP POLICY IF EXISTS "Admins removem cupons" ON public.coupons;
CREATE POLICY "Cupons ativos anon" ON public.coupons FOR SELECT TO anon USING (store_key = 'papelemi' AND active = true);
CREATE POLICY "Cupons ativos ou admin autenticado" ON public.coupons FOR SELECT TO authenticated
  USING (store_key = 'papelemi' AND (active = true OR public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi')));
CREATE POLICY "Admins inserem cupons" ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));
CREATE POLICY "Admins atualizam cupons" ON public.coupons FOR UPDATE TO authenticated
  USING (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'))
  WITH CHECK (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));
CREATE POLICY "Admins removem cupons" ON public.coupons FOR DELETE TO authenticated
  USING (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));

DROP POLICY IF EXISTS "Frases ativas anon" ON public.curated_phrases;
DROP POLICY IF EXISTS "Frases ativas ou admin autenticado" ON public.curated_phrases;
DROP POLICY IF EXISTS "Admins inserem frases" ON public.curated_phrases;
DROP POLICY IF EXISTS "Admins atualizam frases" ON public.curated_phrases;
DROP POLICY IF EXISTS "Admins removem frases" ON public.curated_phrases;
CREATE POLICY "Frases ativas anon" ON public.curated_phrases FOR SELECT TO anon USING (store_key = 'papelemi' AND active = true);
CREATE POLICY "Frases ativas ou admin autenticado" ON public.curated_phrases FOR SELECT TO authenticated
  USING (store_key = 'papelemi' AND (active = true OR public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi')));
CREATE POLICY "Admins inserem frases" ON public.curated_phrases FOR INSERT TO authenticated
  WITH CHECK (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));
CREATE POLICY "Admins atualizam frases" ON public.curated_phrases FOR UPDATE TO authenticated
  USING (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'))
  WITH CHECK (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));
CREATE POLICY "Admins removem frases" ON public.curated_phrases FOR DELETE TO authenticated
  USING (store_key = 'papelemi' AND public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi'));

DROP POLICY IF EXISTS "Usuário lê o próprio papel" ON public.user_roles;
CREATE POLICY "Usuário lê o próprio papel" ON public.user_roles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stores, public.customers, public.order_items, public.orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stores, public.customers, public.order_items, public.orders TO service_role;

GRANT SELECT ON TABLE public.categories, public.products, public.coupons, public.curated_phrases TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.categories, public.products, public.coupons, public.curated_phrases TO authenticated;
GRANT ALL ON TABLE public.categories, public.products, public.coupons, public.curated_phrases TO service_role;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

COMMENT ON TABLE public.stores IS 'Registry for isolated storefronts sharing the PapeLemi central PostgreSQL engine.';
COMMENT ON TABLE public.customers IS 'Normalized CRM records, isolated by store_key. Private to trusted server-side operations.';
COMMENT ON TABLE public.order_items IS 'Normalized order line items. The orders.items JSONB snapshot remains for compatibility.';
COMMENT ON COLUMN public.orders.customer_id IS 'Optional normalized CRM link; legacy order customer snapshots remain intact.';
