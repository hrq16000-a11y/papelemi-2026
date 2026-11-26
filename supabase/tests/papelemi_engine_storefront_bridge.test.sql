BEGIN;
SELECT plan(24);

SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%'),
  (SELECT count(*)::int FROM public.products WHERE store_key = 'papelemi'),
  'all existing PapeLemi products are copied into the engine'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.categories WHERE external_ref LIKE 'papelemi:category:%'),
  (SELECT count(*)::int FROM public.categories WHERE store_key = 'papelemi'),
  'all existing PapeLemi categories are copied into the engine'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%' AND category_id IS NOT NULL),
  (SELECT count(*)::int FROM public.products WHERE store_key = 'papelemi'),
  'every PapeLemi product is linked to its engine category'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%' AND personalization_enabled IS TRUE),
  (SELECT count(*)::int FROM public.products WHERE store_key = 'papelemi' AND personalizable IS TRUE),
  'personalization flags are preserved'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%' AND jsonb_array_length(personalization_options) > 0),
  (SELECT count(*)::int FROM public.products WHERE store_key = 'papelemi' AND jsonb_array_length(personalization) > 0),
  'personalization options are preserved'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%' AND cardinality(images) > 0),
  (SELECT count(*)::int FROM public.products WHERE store_key = 'papelemi' AND cardinality(images) > 0),
  'product images are preserved'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%' AND production_days IS NOT NULL),
  (SELECT count(*)::int FROM public.products WHERE store_key = 'papelemi' AND NULLIF(regexp_replace(production_days, '[^0-9]', '', 'g'), '') IS NOT NULL),
  'production-day values are preserved as numeric engine values'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%' AND stock = 0),
  (SELECT count(*)::int FROM public.products WHERE store_key = 'papelemi' AND stock = 0),
  'made-to-order stock values are preserved'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.products WHERE external_ref LIKE 'papelemi:product:%' AND colors = '{}'::text[] AND sizes = '{}'::text[] AND finishes = '{}'::text[]),
  (SELECT count(*)::int FROM public.products WHERE store_key = 'papelemi' AND cardinality(colors) = 0 AND cardinality(sizes) = 0 AND cardinality(finishes) = 0),
  'variation fields are preserved'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.shipping_settings),
  (SELECT count(*)::int FROM public.shipping_settings WHERE store_key = 'papelemi' AND singleton IS TRUE),
  'PapeLemi shipping settings are copied into the engine'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.shipping_providers),
  (SELECT count(*)::int FROM public.shipping_providers WHERE store_key = 'papelemi'),
  'PapeLemi shipping provider configuration is copied into its own engine'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.shipping_rules),
  (SELECT count(*)::int FROM public.shipping_rules WHERE store_key = 'papelemi'),
  'PapeLemi shipping rules are copied'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.coupons),
  (SELECT count(*)::int FROM public.coupons WHERE store_key = 'papelemi'),
  'PapeLemi coupons are copied'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.customers),
  (SELECT count(*)::int FROM public.customers WHERE store_key = 'papelemi'),
  'PapeLemi customers are copied'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.orders o JOIN public.orders p ON p.id = o.id WHERE p.store_key = 'papelemi'),
  (SELECT count(*)::int FROM public.orders WHERE store_key = 'papelemi'),
  'PapeLemi orders are copied with their original identifiers'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.order_items i JOIN public.order_items p ON p.id = i.id WHERE p.store_key = 'papelemi'),
  (SELECT count(*)::int FROM public.order_items WHERE store_key = 'papelemi'),
  'normalized order items are copied with their original identifiers'
);
SELECT is(
  (SELECT count(*)::int FROM papelemi_engine.orders WHERE customer_id IS NOT NULL),
  (SELECT count(*)::int FROM public.orders WHERE store_key = 'papelemi' AND customer_id IS NOT NULL),
  'order-to-customer links are preserved'
);
SELECT has_column('papelemi_engine', 'products', 'stock', 'engine product stock extension exists');
SELECT has_column('papelemi_engine', 'products', 'colors', 'engine product colors extension exists');
SELECT has_column('papelemi_engine', 'orders', 'request_id', 'order idempotency key extension exists');
SELECT has_column('papelemi_engine', 'orders', 'accepted_privacy', 'order privacy consent extension exists');
SELECT has_column('papelemi_engine', 'order_items', 'personalization_data', 'structured personalization extension exists');
SELECT has_column('papelemi_engine', 'customers', 'email_normalized', 'normalized customer email extension exists');
SELECT ok(to_regclass('papelemi_engine.shipping_quote_rate_limits') IS NOT NULL, 'engine shipping rate-limit table exists');
SELECT ok(to_regprocedure('papelemi_engine.consume_shipping_quote_rate_limit(text,timestamp with time zone,integer)') IS NOT NULL, 'engine shipping rate-limit RPC exists');

SELECT * FROM finish();
ROLLBACK;
