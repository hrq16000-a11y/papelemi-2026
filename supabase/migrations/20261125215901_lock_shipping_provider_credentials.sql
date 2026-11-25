-- Shipping provider credentials must never be readable from the browser.
-- Admin server functions use the service role and return only configured-state booleans.
REVOKE ALL ON TABLE public.shipping_providers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.shipping_providers TO service_role;

DROP POLICY IF EXISTS shipping_providers_admin_select ON public.shipping_providers;
DROP POLICY IF EXISTS shipping_providers_admin_insert ON public.shipping_providers;
DROP POLICY IF EXISTS shipping_providers_admin_update ON public.shipping_providers;
DROP POLICY IF EXISTS shipping_providers_admin_delete ON public.shipping_providers;

COMMENT ON TABLE public.shipping_providers IS
  'Store-scoped provider credentials. Access is restricted to trusted server-side service-role operations; client responses expose configuration state only.';
