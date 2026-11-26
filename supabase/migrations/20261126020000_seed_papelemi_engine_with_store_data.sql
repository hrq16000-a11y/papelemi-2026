-- Move only PapeLemi's own existing storefront data into the imported engine.
-- Public source rows are preserved; no Emporio customer/order/product data is imported.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.products p
    LEFT JOIN papelemi_engine.categories c
      ON c.external_ref = 'papelemi:category:' || p.category_slug
    WHERE p.store_key = 'papelemi' AND c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'PapeLemi catalog seed aborted: a product has no matching engine category';
  END IF;
END;
$$;

INSERT INTO papelemi_engine.categories (
  name, slug, description, image_url, position, is_indexed, is_draft,
  external_ref, image_ref
)
SELECT
  c.name, c.slug, c.description, NULLIF(c.image, ''), c.sort, true, false,
  'papelemi:category:' || c.slug, NULLIF(c.image, '')
FROM public.categories c
WHERE c.store_key = 'papelemi'
ON CONFLICT (external_ref) DO NOTHING;

INSERT INTO papelemi_engine.products (
  name, slug, description, price, original_price, min_quantity, production_days,
  weight, category_id, images, features, keywords, is_active,
  personalization_enabled, external_ref, rating, weight_kg, length_cm, width_cm,
  height_cm, requires_shipping, image_refs, personalization_options, seo_noindex,
  featured_weight, show_min_quantity, colors, sizes, finishes, stock
)
SELECT
  p.name, p.slug, p.description,
  COALESCE(p.promo_price, p.price),
  CASE WHEN p.promo_price IS NOT NULL THEN p.price ELSE NULL END,
  COALESCE(p.min_qty, 1),
  NULLIF(regexp_replace(COALESCE(p.production_days, ''), '[^0-9]', '', 'g'), '')::integer,
  p.weight_kg, c.id, COALESCE(p.images, '{}'::text[]),
  '{}'::text[], '{}'::text[], p.published, p.personalizable,
  'papelemi:product:' || p.slug, NULL, p.weight_kg, p.length_cm, p.width_cm,
  p.height_cm, p.requires_shipping, COALESCE(p.images, '{}'::text[]),
  COALESCE(p.personalization, '[]'::jsonb), false,
  CASE WHEN p.best_seller THEN 100 ELSE 0 END,
  p.min_qty IS NOT NULL, COALESCE(p.colors, '{}'::text[]),
  COALESCE(p.sizes, '{}'::text[]), COALESCE(p.finishes, '{}'::text[]),
  COALESCE(p.stock, 0)
FROM public.products p
JOIN papelemi_engine.categories c
  ON c.external_ref = 'papelemi:category:' || p.category_slug
WHERE p.store_key = 'papelemi'
ON CONFLICT (external_ref) DO NOTHING;

INSERT INTO papelemi_engine.customers (
  id, name, email, email_normalized, phone, whatsapp, city, state,
  source, status, tags, notes, created_by, created_at, updated_at
)
SELECT
  c.id, c.name, c.email, COALESCE(c.email_normalized, lower(trim(c.email))),
  c.phone, c.whatsapp, c.city, c.state, c.source, c.status,
  COALESCE(c.tags, '{}'::text[]), c.notes, c.created_by, c.created_at, c.updated_at
FROM public.customers c
WHERE c.store_key = 'papelemi'
ON CONFLICT (id) DO NOTHING;

INSERT INTO papelemi_engine.coupons (
  code, discount_type, discount_value, min_subtotal, is_active, created_at, updated_at
)
SELECT c.code, 'percent', c.percent, 0, c.active, now(), now()
FROM public.coupons c
WHERE c.store_key = 'papelemi'
ON CONFLICT (code) DO NOTHING;

INSERT INTO papelemi_engine.shipping_settings (
  id, origin_zip_code, default_box_weight_kg, default_box_length_cm,
  default_box_width_cm, default_box_height_cm, handling_fee,
  shipping_markup_percentage, singleton, created_at, updated_at, is_enabled,
  free_shipping_threshold, pickup_enabled, pickup_label, pickup_address,
  pickup_instructions, free_shipping_enabled
)
SELECT
  s.id, s.origin_zip_code, s.default_box_weight_kg, s.default_box_length_cm,
  s.default_box_width_cm, s.default_box_height_cm, s.handling_fee,
  s.shipping_markup_percentage, s.singleton, s.created_at, s.updated_at,
  s.is_enabled, s.free_shipping_threshold, s.pickup_enabled, s.pickup_label,
  s.pickup_address, s.pickup_instructions, s.free_shipping_enabled
FROM public.shipping_settings s
WHERE s.store_key = 'papelemi' AND s.singleton = true
ON CONFLICT (id) DO NOTHING;

INSERT INTO papelemi_engine.shipping_providers (
  id, provider_name, provider_code, is_active, api_key, api_secret,
  endpoint_url, config_json, created_at, updated_at
)
SELECT
  p.id, p.provider_name, p.provider_code, p.is_active, p.api_key, p.api_secret,
  p.endpoint_url, p.config_json, p.created_at, p.updated_at
FROM public.shipping_providers p
WHERE p.store_key = 'papelemi'
ON CONFLICT (id) DO NOTHING;

INSERT INTO papelemi_engine.shipping_rules (
  id, rule_name, condition_type, condition_value, discount_type,
  discount_value, is_active, priority, created_at, updated_at
)
SELECT
  r.id, r.rule_name,
  r.condition_type::text::papelemi_engine.shipping_condition_type,
  r.condition_value,
  r.discount_type::text::papelemi_engine.shipping_discount_type,
  r.discount_value, r.is_active, r.priority, r.created_at, r.updated_at
FROM public.shipping_rules r
WHERE r.store_key = 'papelemi'
ON CONFLICT (id) DO NOTHING;

INSERT INTO papelemi_engine.shipping_audit_logs (
  id, destination_zip, cart_snapshot, provider_name, error_message, http_status,
  event_type, total_weight_kg, melhor_envio_has_key, estimated, created_at
)
SELECT
  a.id, a.destination_zip, a.cart_snapshot, a.provider_name, a.error_message,
  a.http_status, a.event_type, a.total_weight_kg, a.melhor_envio_has_key,
  a.estimated, a.created_at
FROM public.shipping_audit_logs a
WHERE a.store_key = 'papelemi'
ON CONFLICT (id) DO NOTHING;

INSERT INTO papelemi_engine.orders (
  id, order_code, customer_name, customer_email, customer_phone,
  address_cep, address_street, address_number, address_complement,
  address_neighborhood, address_city, address_state, shipping_method,
  shipping_company, shipping_days, shipping_price, subtotal, total, status,
  notes, created_at, updated_at, coupon_code, discount_amount, payment_status,
  payment_method, payment_id, customer_id, customer_notes, accepted_privacy,
  privacy_consent_at, source, shipping_snapshot
)
SELECT
  o.id,
  'PL-' || upper(substr(replace(o.id::text, '-', ''), 1, 12)),
  o.customer_name, lower(trim(o.customer_email)), COALESCE(o.customer_phone, ''),
  COALESCE(o.address->>'cep', ''), NULLIF(o.address->>'street', ''),
  NULLIF(o.address->>'number', ''), NULLIF(o.address->>'complement', ''),
  NULLIF(o.address->>'district', ''), COALESCE(o.address->>'city', ''),
  COALESCE(o.address->>'state', ''),
  COALESCE(NULLIF(o.address->'shipping'->>'service_name', ''), 'A combinar'),
  NULLIF(o.address->'shipping'->>'provider', ''),
  NULLIF(o.address->'shipping'->>'estimated_delivery_days', ''),
  COALESCE(o.shipping, 0), o.subtotal, o.total,
  COALESCE(o.status, 'pending'), COALESCE(o.customer_notes, ''),
  o.created_at, o.created_at, o.coupon_code, COALESCE(o.discount, 0),
  CASE
    WHEN lower(COALESCE(o.status, 'pending')) IN ('paid', 'confirmed') THEN 'approved'::papelemi_engine.payment_status
    WHEN lower(COALESCE(o.status, 'pending')) = 'cancelled' THEN 'cancelled'::papelemi_engine.payment_status
    ELSE 'pending'::papelemi_engine.payment_status
  END,
  CASE WHEN o.mp_payment_id IS NOT NULL THEN 'mercadopago' ELSE NULL END,
  o.mp_payment_id, o.customer_id, COALESCE(o.customer_notes, ''),
  COALESCE(o.accepted_privacy, false), o.privacy_consent_at,
  COALESCE(o.source, 'storefront'), COALESCE(o.address->'shipping', '{}'::jsonb)
FROM public.orders o
WHERE o.store_key = 'papelemi'
ON CONFLICT (id) DO NOTHING;

INSERT INTO papelemi_engine.order_items (
  id, order_id, product_name, product_slug, product_image, quantity,
  unit_price, personalization, created_at, line_total, personalization_data
)
SELECT
  i.id, i.order_id, i.product_name, i.product_slug, i.product_image,
  i.quantity, i.unit_price, COALESCE(i.personalization::text, ''),
  i.created_at, i.line_total, COALESCE(i.personalization, '{}'::jsonb)
FROM public.order_items i
JOIN public.orders o ON o.id = i.order_id AND o.store_key = i.store_key
WHERE i.store_key = 'papelemi'
ON CONFLICT (id) DO NOTHING;

-- Legacy order snapshots without normalized item rows are expanded once.
INSERT INTO papelemi_engine.order_items (
  order_id, product_name, product_slug, product_image, quantity,
  unit_price, personalization, created_at, line_total, personalization_data
)
SELECT
  o.id, COALESCE(item->>'name', 'Produto'), item->>'slug', item->>'image',
  GREATEST(COALESCE(NULLIF(item->>'qty', '')::integer, NULLIF(item->>'quantity', '')::integer, 1), 1),
  COALESCE(NULLIF(item->>'unit_price', '')::numeric, 0),
  COALESCE(item->'options', '{}'::jsonb)::text, o.created_at,
  COALESCE(NULLIF(item->>'line_total', '')::numeric,
    COALESCE(NULLIF(item->>'unit_price', '')::numeric, 0)
      * GREATEST(COALESCE(NULLIF(item->>'qty', '')::integer, NULLIF(item->>'quantity', '')::integer, 1), 1)),
  COALESCE(item->'options', '{}'::jsonb)
FROM public.orders o
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS item
WHERE o.store_key = 'papelemi'
  AND NOT EXISTS (
    SELECT 1 FROM public.order_items i
    WHERE i.store_key = 'papelemi' AND i.order_id = o.id
  );

DO $$
DECLARE
  public_products integer;
  engine_products integer;
  public_categories integer;
  engine_categories integer;
  public_orders integer;
  engine_orders integer;
BEGIN
  SELECT count(*) INTO public_products FROM public.products WHERE store_key = 'papelemi';
  SELECT count(*) INTO engine_products FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%';
  SELECT count(*) INTO public_categories FROM public.categories WHERE store_key = 'papelemi';
  SELECT count(*) INTO engine_categories FROM papelemi_engine.categories WHERE external_ref LIKE 'papelemi:category:%';
  SELECT count(*) INTO public_orders FROM public.orders WHERE store_key = 'papelemi';
  SELECT count(*) INTO engine_orders
  FROM papelemi_engine.orders
  WHERE order_code LIKE 'PL-%'
    AND id IN (SELECT id FROM public.orders WHERE store_key = 'papelemi');

  IF public_products <> engine_products THEN
    RAISE EXCEPTION 'PapeLemi product seed mismatch: public %, engine %', public_products, engine_products;
  END IF;
  IF public_categories <> engine_categories THEN
    RAISE EXCEPTION 'PapeLemi category seed mismatch: public %, engine %', public_categories, engine_categories;
  END IF;
  IF public_orders <> engine_orders THEN
    RAISE EXCEPTION 'PapeLemi order seed mismatch: public %, engine %', public_orders, engine_orders;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.store_key = 'papelemi'
      AND jsonb_array_length(COALESCE(o.items, '[]'::jsonb)) > 0
      AND NOT EXISTS (SELECT 1 FROM papelemi_engine.order_items i WHERE i.order_id = o.id)
  ) THEN
    RAISE EXCEPTION 'PapeLemi order item seed mismatch';
  END IF;
END;
$$;
