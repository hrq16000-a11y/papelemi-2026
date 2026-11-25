create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Usuário lê o próprio papel" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create table public.categories (
  slug text primary key,
  name text not null,
  description text not null default '',
  image text not null default '',
  sort int not null default 0
);
grant select on public.categories to anon, authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "Categorias visíveis a todos" on public.categories for select to anon, authenticated using (true);
create policy "Admins gerenciam categorias" on public.categories for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.products (
  slug text primary key,
  category_slug text not null references public.categories(slug) on update cascade,
  name text not null,
  description text not null default '',
  images text[] not null default '{}',
  price numeric(10,2) not null,
  promo_price numeric(10,2),
  colors text[] not null default '{}',
  sizes text[] not null default '{}',
  finishes text[] not null default '{}',
  production_days text not null default '',
  stock int not null default 0,
  published boolean not null default true,
  best_seller boolean not null default false,
  personalizable boolean not null default false,
  personalization jsonb not null default '[]',
  min_qty int
);
grant select on public.products to anon, authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "Produtos publicados visíveis a todos" on public.products for select to anon, authenticated using (published or public.has_role(auth.uid(), 'admin'));
create policy "Admins gerenciam produtos" on public.products for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.coupons (
  code text primary key,
  percent int not null check (percent between 1 and 90),
  active boolean not null default true
);
grant select on public.coupons to anon, authenticated;
grant all on public.coupons to service_role;
alter table public.coupons enable row level security;
create policy "Cupons ativos visíveis" on public.coupons for select to anon, authenticated using (active or public.has_role(auth.uid(), 'admin'));
create policy "Admins gerenciam cupons" on public.coupons for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.curated_phrases (
  id uuid primary key default gen_random_uuid(),
  phrase text not null,
  occasion text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.curated_phrases to anon, authenticated;
grant all on public.curated_phrases to service_role;
alter table public.curated_phrases enable row level security;
create policy "Frases ativas visíveis" on public.curated_phrases for select to anon, authenticated using (active or public.has_role(auth.uid(), 'admin'));
create policy "Admins gerenciam frases" on public.curated_phrases for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  address jsonb not null default '{}',
  items jsonb not null default '[]',
  subtotal numeric(10,2) not null,
  shipping numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  coupon_code text,
  total numeric(10,2) not null,
  status text not null default 'pending',
  mp_payment_id text,
  created_at timestamptz not null default now()
);
grant all on public.orders to service_role;
grant select, update on public.orders to authenticated;
alter table public.orders enable row level security;
create policy "Admins veem pedidos" on public.orders for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins atualizam pedidos" on public.orders for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

insert into public.categories (slug, name, description, image, sort) values
('agendas-e-planners','Agendas e planners','Para organizar dias com intenção e beleza.','https://images.unsplash.com/photo-1517842645767-c639042777db?w=900&q=75&auto=format&fit=crop',1),
('cadernos','Cadernos','Páginas prontas para ideias, memórias e listas.','https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=900&q=75&auto=format&fit=crop',2),
('lembrancas','Lembranças','Pequenos mimos que guardam grandes momentos.','https://images.unsplash.com/photo-1513201099705-a9746e1e201f?w=900&q=75&auto=format&fit=crop',3),
('kits','Kits','Combinações pensadas para presentear com afeto.','https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=900&q=75&auto=format&fit=crop',4),
('brindes-corporativos','Brindes corporativos','Sua marca lembrada com delicadeza e cuidado.','https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?w=900&q=75&auto=format&fit=crop',5);

insert into public.coupons (code, percent) values ('BEMVINDO10', 10);

insert into public.curated_phrases (phrase, occasion) values
('Que cada página guarda um pedacinho da nossa história.','aniversario'),
('Para os dias corridos, um lembrete: você é amada demais.','carinho'),
('Feito à mão, pensado com o coração.','generico'),
('Que este caderno seja o começo de muitas ideias lindas.','generico');