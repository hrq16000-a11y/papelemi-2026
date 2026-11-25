BEGIN;
SELECT plan(44);

SELECT ok(to_regtype('public.payment_status') IS NOT NULL, 'payment_status enum exists');
SELECT has_column('public','orders','order_code','orders has a human-readable order code');
SELECT has_column('public','orders','address_cep','orders stores normalized postal code');
SELECT has_column('public','orders','address_city','orders stores normalized city');
SELECT has_column('public','orders','shipping_method','orders stores shipping method');
SELECT has_column('public','orders','shipping_price','orders exposes generated shipping price');
SELECT has_column('public','orders','discount_amount','orders exposes generated discount amount');
SELECT has_column('public','orders','payment_status','orders separates payment status');
SELECT has_column('public','orders','payment_id','orders stores provider payment id');
SELECT has_column('public','orders','payment_method','orders stores payment method');
SELECT has_column('public','orders','tracking_code','orders stores tracking code');
SELECT has_column('public','orders','tracking_carrier','orders stores tracking carrier');
SELECT has_column('public','orders','tracking_url','orders stores tracking URL');
SELECT has_column('public','orders','notes','orders stores admin notes');
SELECT has_column('public','orders','updated_at','orders has updated timestamp');

SELECT has_table('public','order_status_history','order status history table exists');
SELECT has_table('public','order_status_notifications','order status notification log exists');
SELECT has_table('public','tracking_email_log','tracking email log exists');
SELECT has_table('public','payment_events','payment event log exists');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.order_status_history'::regclass),'order status history has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.payment_events'::regclass),'payment events have RLS enabled');
SELECT ok(NOT has_table_privilege('authenticated','public.order_status_history','SELECT'),'authenticated clients cannot read order history directly');
SELECT ok(NOT has_table_privilege('anon','public.payment_events','SELECT'),'anonymous clients cannot read payment events');
SELECT ok(to_regprocedure('public.admin_update_order(uuid,uuid,text,text,text,text,numeric,text,text,text,text)') IS NOT NULL,'admin order update RPC exists');
SELECT ok(to_regprocedure('public.check_resend_email_cooldown(uuid,text,integer)') IS NOT NULL,'email cooldown RPC exists');
SELECT ok(has_function_privilege('service_role','public.admin_update_order(uuid,uuid,text,text,text,text,numeric,text,text,text,text)','EXECUTE'),'service role can execute admin order update');
SELECT ok(NOT has_function_privilege('authenticated','public.admin_update_order(uuid,uuid,text,text,text,text,numeric,text,text,text,text)','EXECUTE'),'authenticated clients cannot execute privileged order update');
SELECT ok(EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_papelemi_sync_order_metadata' AND tgrelid='public.orders'::regclass AND NOT tgisinternal),'order metadata trigger exists');
SELECT ok(EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_papelemi_record_order_status_history' AND tgrelid='public.orders'::regclass AND NOT tgisinternal),'order history trigger exists');

CREATE TEMP TABLE qa_order_id (id uuid);
WITH created AS (
  INSERT INTO public.orders (
    store_key, customer_name, customer_email, customer_phone, address, items,
    subtotal, discount, shipping, coupon_code, total, status, source, accepted_privacy
  )
  VALUES (
    'papelemi', 'QA Order', 'qa-order@example.test', '41999999999',
    '{"cep":"80010000","street":"Rua QA","number":"10","complement":"Sala 2","district":"Centro","city":"Curitiba","state":"PR"}'::jsonb,
    '[]'::jsonb, 100, 10, 12, NULL, 102, 'pending', 'test', true
  )
  RETURNING id
)
INSERT INTO qa_order_id SELECT id FROM created;

SELECT ok((SELECT order_code ~ '^PL-[A-F0-9]{8}$' FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),'order code is generated');
SELECT is((SELECT address_cep FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),'80010000','CEP is copied from address snapshot');
SELECT is((SELECT address_city FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),'Curitiba','city is copied from address snapshot');
SELECT is((SELECT payment_status::text FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),'pending','new orders start with pending payment status');
SELECT is((SELECT shipping_price FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),12::numeric,'generated shipping price matches shipping');
SELECT is((SELECT discount_amount FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),10::numeric,'generated discount amount matches discount');
SELECT is((SELECT count(*)::integer FROM public.order_status_history WHERE order_id=(SELECT id FROM qa_order_id)),1,'new order creates initial status history');

DO $qa_user$
DECLARE
  v_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (v_user_id, 'authenticated', 'authenticated', 'qa-admin-' || replace(v_user_id::text,'-','') || '@example.test', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
  INSERT INTO public.user_roles (user_id, role, store_key) VALUES (v_user_id, 'admin', 'papelemi');
  PERFORM set_config('app.qa_admin_id', v_user_id::text, true);
END
$qa_user$;

SELECT is(
  public.admin_update_order(
    current_setting('app.qa_admin_id', true)::uuid,
    (SELECT id FROM qa_order_id),
    'shipped',
    'Correios',
    'Correios',
    '3 a 5 dias úteis',
    18.90,
    'QA123456789BR',
    'Correios',
    'https://rastreamento.correios.com.br/app/index.php?codigo=QA123456789BR',
    'Atualizado em teste'
  )->>'status',
  'shipped',
  'admin RPC updates order status'
);
SELECT is((SELECT total FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),108.90::numeric,'shipping update recalculates order total');
SELECT is((SELECT tracking_code FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),'QA123456789BR','admin RPC saves tracking code');
SELECT is((SELECT shipping_method FROM public.orders WHERE id=(SELECT id FROM qa_order_id)),'Correios','admin RPC saves shipping method');
SELECT is((SELECT count(*)::integer FROM public.order_status_history WHERE order_id=(SELECT id FROM qa_order_id)),2,'status change is audited');
SELECT is((SELECT to_status FROM public.order_status_history WHERE order_id=(SELECT id FROM qa_order_id) ORDER BY created_at DESC LIMIT 1),'shipped','history records new status');
SELECT is((SELECT note FROM public.order_status_history WHERE order_id=(SELECT id FROM qa_order_id) ORDER BY created_at DESC LIMIT 1),'Atualizado em teste','history records admin note');
SELECT ok((public.check_resend_email_cooldown((SELECT id FROM qa_order_id),'tracking',300)->>'allowed')::boolean,'email cooldown allows first notification');

SELECT * FROM finish();
ROLLBACK;
