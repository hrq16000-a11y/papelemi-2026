-- Additive lifecycle controls for the PapeLemi catalog.
-- Products use published for storefront activation; archived_at is a separate reversible state.
-- Categories gain an explicit active flag and reversible archive state.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS products_store_lifecycle_idx
  ON public.products (store_key, archived_at, published, name);

CREATE INDEX IF NOT EXISTS categories_store_lifecycle_idx
  ON public.categories (store_key, active, archived_at, sort);

DROP POLICY IF EXISTS "Categorias públicas anon" ON public.categories;
DROP POLICY IF EXISTS "Categorias públicas autenticadas" ON public.categories;
CREATE POLICY "Categorias públicas anon" ON public.categories
  FOR SELECT TO anon
  USING (store_key = 'papelemi' AND active = true AND archived_at IS NULL);
CREATE POLICY "Categorias públicas autenticadas" ON public.categories
  FOR SELECT TO authenticated
  USING (store_key = 'papelemi' AND active = true AND archived_at IS NULL);

DROP POLICY IF EXISTS "Produtos publicados anon" ON public.products;
DROP POLICY IF EXISTS "Produtos publicados ou admin autenticado" ON public.products;
CREATE POLICY "Produtos publicados anon" ON public.products
  FOR SELECT TO anon
  USING (
    store_key = 'papelemi'
    AND published = true
    AND archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.categories AS category
      WHERE category.store_key = products.store_key
        AND category.slug = products.category_slug
        AND category.active = true
        AND category.archived_at IS NULL
    )
  );
CREATE POLICY "Produtos publicados ou admin autenticado" ON public.products
  FOR SELECT TO authenticated
  USING (
    store_key = 'papelemi'
    AND (
      (
        published = true
        AND archived_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.categories AS category
          WHERE category.store_key = products.store_key
            AND category.slug = products.category_slug
            AND category.active = true
            AND category.archived_at IS NULL
        )
      )
      OR public.has_store_role((SELECT auth.uid()), 'admin'::public.app_role, 'papelemi')
    )
  );
