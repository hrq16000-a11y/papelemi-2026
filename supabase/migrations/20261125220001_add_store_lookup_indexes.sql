-- Covering indexes for the composite catalog and role foreign keys.
CREATE INDEX IF NOT EXISTS products_store_category_idx
  ON public.products(store_key,category_slug);
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx
  ON public.user_roles(user_id);
