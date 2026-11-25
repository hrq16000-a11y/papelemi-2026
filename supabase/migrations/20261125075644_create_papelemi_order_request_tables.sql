-- Dedicated PapeLemi order-request storage.
-- Customer PII is only accessible through trusted server-side code.
create table public.store_order_requests (
  id uuid primary key default gen_random_uuid(),
  store_key text not null default 'papelemi',
  order_number text not null,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_email text not null check (char_length(customer_email) between 3 and 180),
  customer_phone text not null check (char_length(customer_phone) between 10 and 30),
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  city text not null check (char_length(city) between 2 and 100),
  state text not null check (state ~ '^[A-Z]{2}$'),
  street text not null check (char_length(street) between 2 and 180),
  address_number text not null check (char_length(address_number) between 1 and 30),
  complement text not null default '' check (char_length(complement) <= 120),
  notes text not null default '' check (char_length(notes) <= 1000),
  accepted_privacy boolean not null default false check (accepted_privacy is true),
  privacy_consent_at timestamptz not null default now(),
  status text not null default 'received'
    check (status in ('received', 'reviewing', 'awaiting_customer', 'accepted', 'declined', 'cancelled', 'fulfilled')),
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal_reference numeric(12,2) not null check (subtotal_reference >= 0),
  ip_hash text,
  user_agent text check (char_length(user_agent) <= 500),
  source text not null default 'storefront' check (source = 'storefront'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_order_requests_store_order_unique unique (store_key, order_number),
  constraint store_order_requests_store_id_unique unique (store_key, id)
);

create table public.store_order_request_items (
  id uuid primary key default gen_random_uuid(),
  store_key text not null default 'papelemi',
  order_request_id uuid not null,
  product_slug text not null check (char_length(product_slug) between 1 and 120),
  product_name text not null check (char_length(product_name) between 1 and 180),
  unit_price_reference numeric(12,2) not null check (unit_price_reference >= 0),
  quantity integer not null check (quantity between 1 and 100),
  line_total_reference numeric(12,2) not null check (line_total_reference >= 0),
  personalization jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint store_order_request_items_parent_fk
    foreign key (store_key, order_request_id)
    references public.store_order_requests (store_key, id)
    on delete cascade
);

create index store_order_requests_created_at_idx
  on public.store_order_requests (created_at desc);
create index store_order_requests_status_created_at_idx
  on public.store_order_requests (status, created_at desc);
create index store_order_requests_ip_created_at_idx
  on public.store_order_requests (ip_hash, created_at desc)
  where ip_hash is not null;
create index store_order_request_items_order_idx
  on public.store_order_request_items (store_key, order_request_id);

alter table public.store_order_requests enable row level security;
alter table public.store_order_request_items enable row level security;

revoke all on table public.store_order_requests from anon, authenticated;
revoke all on table public.store_order_request_items from anon, authenticated;
grant select, insert, update, delete on table public.store_order_requests to service_role;
grant select, insert, update, delete on table public.store_order_request_items to service_role;

comment on table public.store_order_requests is
  'Private PapeLemi storefront order requests. Customer PII is only accessed by trusted server-side code using service_role/secret key.';
comment on table public.store_order_request_items is
  'Private item snapshots for PapeLemi storefront order requests.';
