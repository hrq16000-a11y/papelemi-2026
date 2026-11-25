create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select _user_id = (select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = _user_id and ur.role = _role
    );
$$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
do $
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$;

drop policy if exists "Admins gerenciam categorias" on public.categories;
drop policy if exists "Categorias visíveis a todos" on public.categories;
create policy "Categorias públicas anon" on public.categories for select to anon using (true);
create policy "Categorias públicas autenticadas" on public.categories for select to authenticated using (true);
create policy "Admins inserem categorias" on public.categories for insert to authenticated with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins atualizam categorias" on public.categories for update to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))) with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins removem categorias" on public.categories for delete to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

drop policy if exists "Admins gerenciam produtos" on public.products;
drop policy if exists "Produtos publicados visíveis a todos" on public.products;
create policy "Produtos publicados anon" on public.products for select to anon using (published = true);
create policy "Produtos publicados ou admin autenticado" on public.products for select to authenticated using (published = true or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins inserem produtos" on public.products for insert to authenticated with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins atualizam produtos" on public.products for update to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))) with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins removem produtos" on public.products for delete to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

drop policy if exists "Admins gerenciam cupons" on public.coupons;
drop policy if exists "Cupons ativos visíveis" on public.coupons;
create policy "Cupons ativos anon" on public.coupons for select to anon using (active = true);
create policy "Cupons ativos ou admin autenticado" on public.coupons for select to authenticated using (active = true or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins inserem cupons" on public.coupons for insert to authenticated with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins atualizam cupons" on public.coupons for update to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))) with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins removem cupons" on public.coupons for delete to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

drop policy if exists "Admins gerenciam frases" on public.curated_phrases;
drop policy if exists "Frases ativas visíveis" on public.curated_phrases;
create policy "Frases ativas anon" on public.curated_phrases for select to anon using (active = true);
create policy "Frases ativas ou admin autenticado" on public.curated_phrases for select to authenticated using (active = true or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins inserem frases" on public.curated_phrases for insert to authenticated with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins atualizam frases" on public.curated_phrases for update to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))) with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins removem frases" on public.curated_phrases for delete to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

drop policy if exists "Admins veem pedidos" on public.orders;
drop policy if exists "Admins atualizam pedidos" on public.orders;
create policy "Admins veem pedidos" on public.orders for select to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));
create policy "Admins atualizam pedidos" on public.orders for update to authenticated using ((select public.has_role((select auth.uid()), 'admin'::public.app_role))) with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

drop policy if exists "Usuário lê o próprio papel" on public.user_roles;
create policy "Usuário lê o próprio papel" on public.user_roles for select to authenticated using ((select auth.uid()) = user_id);

create index if not exists products_category_slug_idx on public.products (category_slug);
create index if not exists coupons_code_active_idx on public.coupons (code) where active = true;
create index if not exists curated_phrases_active_occasion_idx on public.curated_phrases (occasion) where active = true;
