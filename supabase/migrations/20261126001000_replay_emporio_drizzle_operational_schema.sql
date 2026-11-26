-- Reconcile the Emporio Drizzle layer that is not represented in the 199 Supabase migrations.
-- Source: hrq16000-a11y/emporiolelecute-2026 @ d01d843c266b5a32d03af22eeaac6eda4a7fcf0f
-- Commercial rows, auth users, media objects and secrets are intentionally not imported.

ALTER TABLE "papelemi_engine"."review_import_audit"
  ADD COLUMN IF NOT EXISTS "decision_reason" text;

CREATE TABLE IF NOT EXISTS "papelemi_engine"."user_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "papelemi_engine"."profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "user_preferences_user_id_key_unique" UNIQUE ("user_id", "key")
);

CREATE TABLE IF NOT EXISTS "papelemi_engine"."after_sales_rules" (
  "scope_key" text PRIMARY KEY,
  "enabled" boolean NOT NULL DEFAULT false,
  "trigger_event" text NOT NULL DEFAULT 'delivered'
    CHECK ("trigger_event" IN ('paid', 'customer_confirmed', 'delivered')),
  "delay_days" integer NOT NULL DEFAULT 3
    CHECK ("delay_days" BETWEEN 1 AND 365),
  "subject" text NOT NULL DEFAULT 'Seu pedido chegou bem? — PapeLemi',
  "message" text NOT NULL DEFAULT 'Olá, {nome}! Seu pedido {pedido} chegou bem? Responda e me conte como foi receber sua encomenda.',
  "repurchase_enabled" boolean NOT NULL DEFAULT false,
  "repurchase_text" text NOT NULL DEFAULT '',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "papelemi_engine"."after_sales_followups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL,
  "event" text NOT NULL
    CHECK ("event" IN ('paid', 'customer_confirmed', 'delivered')),
  "occurred_at" timestamptz NOT NULL,
  "due_at" timestamptz NOT NULL,
  "status" text NOT NULL DEFAULT 'scheduled'
    CHECK ("status" IN ('scheduled', 'cancelled', 'sent', 'blocked')),
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "after_sales_followups_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "papelemi_engine"."orders"("id"),
  CONSTRAINT "after_sales_followups_order_event_unique" UNIQUE ("order_id", "event")
);

CREATE TABLE IF NOT EXISTS "papelemi_engine"."editorial_stories" (
  "story_key" text PRIMARY KEY,
  "title" text NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "image_url" text,
  "is_published" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "papelemi_engine"."support_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "title" text NOT NULL DEFAULT 'Nova conversa',
  "status" text NOT NULL DEFAULT 'open'
    CHECK ("status" IN ('open', 'human', 'resolved')),
  "handoff_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "processing_until" timestamptz
);

CREATE TABLE IF NOT EXISTS "papelemi_engine"."support_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "thread_id" uuid NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant')),
  "author_id" uuid,
  "ui_message" jsonb NOT NULL,
  "request_id" uuid UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "support_messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "papelemi_engine"."support_threads"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "after_sales_followups_due"
  ON "papelemi_engine"."after_sales_followups" ("due_at")
  WHERE "status" = 'scheduled';

CREATE INDEX IF NOT EXISTS "support_threads_owner"
  ON "papelemi_engine"."support_threads" ("user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "support_messages_thread"
  ON "papelemi_engine"."support_messages" ("thread_id", "created_at");

ALTER TABLE "papelemi_engine"."user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "papelemi_engine"."after_sales_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "papelemi_engine"."after_sales_followups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "papelemi_engine"."editorial_stories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "papelemi_engine"."support_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "papelemi_engine"."support_messages" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  "papelemi_engine"."user_preferences",
  "papelemi_engine"."after_sales_rules",
  "papelemi_engine"."after_sales_followups",
  "papelemi_engine"."editorial_stories",
  "papelemi_engine"."support_threads",
  "papelemi_engine"."support_messages"
FROM PUBLIC, anon;

REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  "papelemi_engine"."user_preferences",
  "papelemi_engine"."after_sales_rules",
  "papelemi_engine"."after_sales_followups",
  "papelemi_engine"."editorial_stories",
  "papelemi_engine"."support_threads",
  "papelemi_engine"."support_messages"
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "papelemi_engine"."user_preferences" TO authenticated;
GRANT ALL PRIVILEGES ON TABLE "papelemi_engine"."user_preferences" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "papelemi_engine"."after_sales_rules" TO authenticated;
GRANT ALL PRIVILEGES ON TABLE "papelemi_engine"."after_sales_rules" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "papelemi_engine"."after_sales_followups" TO authenticated;
GRANT ALL PRIVILEGES ON TABLE "papelemi_engine"."after_sales_followups" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "papelemi_engine"."editorial_stories" TO authenticated;
GRANT ALL PRIVILEGES ON TABLE "papelemi_engine"."editorial_stories" TO service_role;

GRANT SELECT, INSERT, DELETE ON TABLE "papelemi_engine"."support_threads" TO authenticated;
GRANT ALL PRIVILEGES ON TABLE "papelemi_engine"."support_threads" TO service_role;

GRANT SELECT ON TABLE "papelemi_engine"."support_messages" TO authenticated;
GRANT ALL PRIVILEGES ON TABLE "papelemi_engine"."support_messages" TO service_role;

CREATE POLICY "Users can read own preferences"
  ON "papelemi_engine"."user_preferences" FOR SELECT TO authenticated
  USING ("user_id" = auth.uid());

CREATE POLICY "Users can insert own preferences"
  ON "papelemi_engine"."user_preferences" FOR INSERT TO authenticated
  WITH CHECK ("user_id" = auth.uid());

CREATE POLICY "Users can update own preferences"
  ON "papelemi_engine"."user_preferences" FOR UPDATE TO authenticated
  USING ("user_id" = auth.uid())
  WITH CHECK ("user_id" = auth.uid());

CREATE POLICY "Users can delete own preferences"
  ON "papelemi_engine"."user_preferences" FOR DELETE TO authenticated
  USING ("user_id" = auth.uid());

CREATE POLICY "after_sales_rules_admin"
  ON "papelemi_engine"."after_sales_rules" FOR ALL TO authenticated
  USING ("papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role"))
  WITH CHECK ("papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role"));

CREATE POLICY "after_sales_followups_admin"
  ON "papelemi_engine"."after_sales_followups" FOR ALL TO authenticated
  USING ("papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role"))
  WITH CHECK ("papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role"));

CREATE POLICY "editorial_stories_public"
  ON "papelemi_engine"."editorial_stories" FOR SELECT TO anon, authenticated
  USING ("is_published");

CREATE POLICY "editorial_stories_admin"
  ON "papelemi_engine"."editorial_stories" FOR ALL TO authenticated
  USING ("papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role"))
  WITH CHECK ("papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role"));

CREATE POLICY "support_threads_read"
  ON "papelemi_engine"."support_threads" FOR SELECT TO authenticated
  USING (
    "user_id" = auth.uid()
    OR "papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role")
  );

CREATE POLICY "support_threads_create"
  ON "papelemi_engine"."support_threads" FOR INSERT TO authenticated
  WITH CHECK (
    "user_id" = auth.uid()
    AND "status" = 'open'
    AND "handoff_reason" IS NULL
    AND "processing_until" IS NULL
  );

CREATE POLICY "support_threads_delete"
  ON "papelemi_engine"."support_threads" FOR DELETE TO authenticated
  USING ("user_id" = auth.uid());

CREATE POLICY "support_messages_read"
  ON "papelemi_engine"."support_messages" FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "papelemi_engine"."support_threads" t
      WHERE t.id = "thread_id"
        AND (
          t.user_id = auth.uid()
          OR "papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role")
        )
    )
  );

CREATE OR REPLACE FUNCTION "papelemi_engine"."validate_followup_schedule"()
RETURNS trigger
LANGUAGE plpgsql
SET "search_path" TO 'papelemi_engine', 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status <> 'cancelled'
     AND EXISTS (
       SELECT 1
       FROM "papelemi_engine"."orders"
       WHERE id = NEW.order_id AND status = 'cancelled'
     ) THEN
    RAISE EXCEPTION 'Cancelled orders cannot receive followups';
  END IF;

  IF NEW.due_at <= NEW.occurred_at THEN
    RAISE EXCEPTION 'Followup must be after the event';
  END IF;

  IF btrim(NEW.note) = '' THEN
    RAISE EXCEPTION 'Confirmation reason is required';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'sent' THEN
    RAISE EXCEPTION 'Sent followups cannot be rescheduled';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "validate_followup_schedule"
  BEFORE INSERT OR UPDATE ON "papelemi_engine"."after_sales_followups"
  FOR EACH ROW EXECUTE FUNCTION "papelemi_engine"."validate_followup_schedule"();

REVOKE ALL ON FUNCTION "papelemi_engine"."validate_followup_schedule"()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION "papelemi_engine"."claim_support_thread"("_thread_id" uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET "search_path" TO 'papelemi_engine', 'pg_catalog', 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE "papelemi_engine"."support_threads"
     SET "processing_until" = now() + interval '3 minutes'
   WHERE "id" = _thread_id
     AND ("processing_until" IS NULL OR "processing_until" < now());

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION "papelemi_engine"."claim_support_thread"(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION "papelemi_engine"."claim_support_thread"(uuid) TO service_role;

DO $migration$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(
    'papelemi_engine.search_products(text,integer,uuid,numeric,numeric,integer)'::regprocedure
  ) INTO definition;

  definition := replace(
    definition,
    'FUNCTION "papelemi_engine"."search_products"(',
    'FUNCTION "papelemi_engine"."admin_search_preview_rank"('
  );
  definition := replace(
    definition,
    'FUNCTION papelemi_engine.search_products(',
    'FUNCTION papelemi_engine.admin_search_preview_rank('
  );
  definition := replace(
    definition,
    '"_offset" integer DEFAULT 0)',
    '"_offset" integer DEFAULT 0, "_draft" jsonb DEFAULT NULL)'
  );
  definition := replace(
    definition,
    '_offset integer DEFAULT 0)',
    '_offset integer DEFAULT 0, _draft jsonb DEFAULT NULL)'
  );
  definition := replace(
    definition,
    'BEGIN' || chr(10) || '  v_q :=',
    'BEGIN' || chr(10) ||
      '  IF NOT papelemi_engine.has_role(auth.uid(), ''admin'') THEN RAISE EXCEPTION ''Admin access required'' USING ERRCODE = ''42501''; END IF;' || chr(10) ||
      '  v_q :='
  );
  definition := replace(
    definition,
    'FROM "papelemi_engine"."search_boosts" b',
    'FROM papelemi_engine.search_boosts b'
  );
  definition := replace(
    definition,
    'FROM papelemi_engine.search_boosts b',
    'FROM (
      SELECT existing.*
        FROM papelemi_engine.search_boosts existing
       WHERE _draft IS NULL
          OR NOT (
            existing.term_normalized = trim(regexp_replace(lower(public.unaccent(_draft->>''term'')), ''\s+'', '' '', ''g''))
            AND existing.product_id = (_draft->>''product_id'')::uuid
          )
      UNION ALL
      SELECT draft.*
        FROM jsonb_populate_record(
          NULL::papelemi_engine.search_boosts,
          _draft || jsonb_build_object(
            ''term_normalized'', trim(regexp_replace(lower(public.unaccent(_draft->>''term'')), ''\s+'', '' '', ''g'')),
            ''created_at'', coalesce((
              SELECT created_at
                FROM papelemi_engine.search_boosts
               WHERE term_normalized = trim(regexp_replace(lower(public.unaccent(_draft->>''term'')), ''\s+'', '' '', ''g''))
                 AND product_id = (_draft->>''product_id'')::uuid
            ), now())
          )
        ) draft
       WHERE _draft IS NOT NULL
    ) b'
  );
  definition := replace(definition, 'IF _offset = 0 THEN', 'IF false THEN');

  IF definition NOT LIKE '%Admin access required%'
     OR definition NOT LIKE '%_draft jsonb%'
     OR definition NOT LIKE '%jsonb_populate_record%' THEN
    RAISE EXCEPTION 'Unexpected search function definition for admin_search_preview_rank';
  END IF;

  EXECUTE definition;
END;
$migration$;

REVOKE ALL ON FUNCTION "papelemi_engine"."admin_search_preview_rank"(text, integer, uuid, numeric, numeric, integer, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "papelemi_engine"."admin_search_preview_rank"(text, integer, uuid, numeric, numeric, integer, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION "papelemi_engine"."preview_search_boost"("_draft" jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET "search_path" TO 'papelemi_engine', 'pg_catalog', 'public', 'pg_temp'
AS $$
DECLARE
  current_result jsonb;
  proposed_result jsonb;
BEGIN
  IF NOT "papelemi_engine"."has_role"(auth.uid(), 'admin'::"papelemi_engine"."app_role") THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF length(trim(regexp_replace(lower(public.unaccent(_draft->>'term')), '\s+', ' ', 'g'))) < 2
     OR (_draft->>'weight')::numeric NOT BETWEEN 1 AND 1000
     OR (_draft->>'weight')::numeric <> trunc((_draft->>'weight')::numeric)
     OR NOT EXISTS (
       SELECT 1
       FROM "papelemi_engine"."products"
       WHERE id = (_draft->>'product_id')::uuid AND is_active = true
     ) THEN
    RAISE EXCEPTION 'Invalid boost';
  END IF;

  IF (_draft->>'starts_at')::timestamptz >= (_draft->>'ends_at')::timestamptz THEN
    RAISE EXCEPTION 'Invalid campaign period';
  END IF;

  current_result := "papelemi_engine"."admin_search_preview_rank"(
    _draft->>'term', 12, NULL, NULL, NULL, 0, NULL
  );
  proposed_result := "papelemi_engine"."admin_search_preview_rank"(
    _draft->>'term', 12, NULL, NULL, NULL, 0, _draft
  );

  RETURN jsonb_build_object('before', current_result, 'after', proposed_result);
END;
$$;

REVOKE ALL ON FUNCTION "papelemi_engine"."preview_search_boost"(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "papelemi_engine"."preview_search_boost"(jsonb)
  TO authenticated;

-- Reproduce the latest Drizzle 0014 checkout function. It derives every item price
-- from the engine catalog (including legacy product slugs) and calculates totals
-- and discounts server-side. It never trusts client-supplied unit_price/subtotal.
CREATE OR REPLACE FUNCTION "papelemi_engine"."create_order_with_items"(_order jsonb, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET "search_path" TO 'papelemi_engine', 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  new_order_id uuid;
  new_order_code text;
  item_count int;
  v_coupon_code text;
  v_subtotal numeric;
  v_discount numeric;
  v_total numeric;
  v_shipping numeric;
  v_email text;
  v_item jsonb;
  v_qty int;
  v_price numeric;
  v_product_id uuid;
  v_name text;
  v_items jsonb := '[]'::jsonb;
  c record;
BEGIN
  IF _order IS NULL OR _items IS NULL THEN
    RAISE EXCEPTION 'Missing order or items';
  END IF;

  item_count := jsonb_array_length(_items);
  IF item_count = 0 OR item_count > 200 THEN
    RAISE EXCEPTION 'Invalid items count';
  END IF;

  IF coalesce(length(_order->>'customer_name'),0) = 0
     OR coalesce(length(_order->>'customer_email'),0) = 0
     OR coalesce(length(_order->>'order_code'),0) = 0 THEN
    RAISE EXCEPTION 'Missing required customer fields';
  END IF;

  IF length(_order->>'customer_name') > 200
     OR length(_order->>'customer_email') > 320
     OR length(coalesce(_order->>'customer_phone','')) > 40
     OR length(_order->>'order_code') > 32 THEN
    RAISE EXCEPTION 'Field too long';
  END IF;

  v_email := lower(trim(_order->>'customer_email'));
  IF v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  IF (_order->>'order_code') !~ '^[A-Za-z0-9-]{4,32}$' THEN
    RAISE EXCEPTION 'Invalid order_code format';
  END IF;

  v_coupon_code := NULLIF(_order->>'coupon_code','');
  v_subtotal := 0;
  v_shipping := 0;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    IF v_qty <= 0 OR v_qty > 10000 THEN
      RAISE EXCEPTION 'Invalid item quantity';
    END IF;
    IF coalesce(length(v_item->>'personalization'),0) > 1000 THEN
      RAISE EXCEPTION 'Personalization too long';
    END IF;
    IF coalesce(length(v_item->>'product_slug'),0) = 0 OR length(v_item->>'product_slug') > 300 THEN
      RAISE EXCEPTION 'Invalid product on item';
    END IF;

    SELECT p.id, p.price, p.name
      INTO v_product_id, v_price, v_name
      FROM "papelemi_engine"."products" p
     WHERE p.slug = v_item->>'product_slug'
     LIMIT 1;

    IF v_product_id IS NULL THEN
      SELECT p.id, p.price, p.name
        INTO v_product_id, v_price, v_name
        FROM "papelemi_engine"."product_slugs" s
        JOIN "papelemi_engine"."products" p ON p.id = s.product_id
       WHERE s.slug = lower(v_item->>'product_slug')
       LIMIT 1;
    END IF;

    IF v_product_id IS NULL OR v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Produto indisponível no catálogo';
    END IF;

    v_subtotal := v_subtotal + v_price * v_qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_name', v_name,
      'product_slug', v_item->>'product_slug',
      'product_image', left(v_item->>'product_image', 1000),
      'quantity', v_qty,
      'unit_price', v_price,
      'personalization', v_item->>'personalization'
    ));

    v_product_id := NULL;
    v_price := NULL;
    v_name := NULL;
  END LOOP;

  IF v_subtotal > 1000000 THEN
    RAISE EXCEPTION 'Unrealistic order total';
  END IF;

  v_discount := 0;
  IF v_coupon_code IS NOT NULL THEN
    SELECT * INTO c
      FROM "papelemi_engine"."coupons"
     WHERE upper(code) = upper(v_coupon_code)
     FOR UPDATE;

    IF NOT FOUND OR NOT c.is_active THEN
      RAISE EXCEPTION 'Cupom inválido ou inativo';
    END IF;
    IF c.valid_from IS NOT NULL AND now() < c.valid_from THEN
      RAISE EXCEPTION 'Cupom ainda não disponível';
    END IF;
    IF c.valid_until IS NOT NULL AND now() > c.valid_until THEN
      RAISE EXCEPTION 'Cupom expirado';
    END IF;
    IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
      RAISE EXCEPTION 'Cupom esgotado';
    END IF;
    IF v_subtotal < c.min_subtotal THEN
      RAISE EXCEPTION 'Valor mínimo não atingido para o cupom';
    END IF;

    IF c.discount_type = 'percent' THEN
      v_discount := round((v_subtotal * c.discount_value / 100)::numeric, 2);
    ELSE
      v_discount := least(c.discount_value, v_subtotal);
    END IF;
    IF v_discount < 0 THEN v_discount := 0; END IF;
    IF v_discount > v_subtotal THEN v_discount := v_subtotal; END IF;
  END IF;

  v_total := v_subtotal - v_discount + v_shipping;
  IF v_total < 0 THEN v_total := 0; END IF;

  INSERT INTO "papelemi_engine"."orders" (
    order_code, customer_name, customer_email, customer_phone,
    address_cep, address_street, address_number, address_complement,
    address_neighborhood, address_city, address_state,
    shipping_method, shipping_company, shipping_days, shipping_price,
    subtotal, total, status, coupon_code, discount_amount
  ) VALUES (
    _order->>'order_code',
    _order->>'customer_name',
    v_email,
    _order->>'customer_phone',
    _order->>'address_cep',
    _order->>'address_street',
    _order->>'address_number',
    _order->>'address_complement',
    _order->>'address_neighborhood',
    _order->>'address_city',
    _order->>'address_state',
    'A calcular via WhatsApp',
    NULL,
    NULL,
    v_shipping,
    v_subtotal,
    v_total,
    'pending',
    v_coupon_code,
    v_discount
  )
  RETURNING id, order_code INTO new_order_id, new_order_code;

  INSERT INTO "papelemi_engine"."order_items" (
    order_id, product_name, product_slug, product_image, quantity, unit_price, personalization
  )
  SELECT
    new_order_id,
    item->>'product_name',
    item->>'product_slug',
    item->>'product_image',
    (item->>'quantity')::int,
    (item->>'unit_price')::numeric,
    item->>'personalization'
  FROM jsonb_array_elements(v_items) AS item;

  IF v_coupon_code IS NOT NULL THEN
    INSERT INTO "papelemi_engine"."coupon_uses" (coupon_id, order_id, subtotal, discount_applied)
    VALUES (c.id, new_order_id, v_subtotal, v_discount);

    UPDATE "papelemi_engine"."coupons"
       SET used_count = used_count + 1, updated_at = now()
     WHERE id = c.id;
  END IF;

  RETURN jsonb_build_object(
    'id', new_order_id,
    'order_code', new_order_code,
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'total', v_total,
    'items', (
      SELECT coalesce(
        jsonb_agg(jsonb_build_object(
          'product_slug', e->>'product_slug',
          'quantity', (e->>'quantity')::int,
          'unit_price', (e->>'unit_price')::numeric
        )),
        '[]'::jsonb
      )
      FROM jsonb_array_elements(v_items) e
    )
  );
END;
$function$;
