alter table public.orders
  add column store_key text not null default 'papelemi',
  add column customer_notes text not null default '' check (char_length(customer_notes) <= 1000),
  add column accepted_privacy boolean not null default false,
  add column privacy_consent_at timestamptz,
  add column source text not null default 'storefront';

create index orders_store_created_at_idx
  on public.orders (store_key, created_at desc);

drop table public.store_order_request_items;
drop table public.store_order_requests;
