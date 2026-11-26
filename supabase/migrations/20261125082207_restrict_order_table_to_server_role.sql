revoke all on table public.orders from anon, authenticated;
grant select, insert, update, delete on table public.orders to service_role;
drop policy if exists "Admins veem pedidos" on public.orders;
drop policy if exists "Admins atualizam pedidos" on public.orders;
