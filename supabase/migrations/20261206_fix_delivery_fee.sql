-- Исправление: оформление заказа передаёт сумму как bigint — добавляем вариант функции, который её принимает.
create or replace function public.delivery_fee_for(bid uuid, addr text, amount bigint) returns integer
language sql stable security definer set search_path = '' as $$
  select public.delivery_fee_for(bid, addr, least(amount, 2147483647)::integer)
$$;
revoke all on function public.delivery_fee_for(uuid, text, bigint) from public, anon, authenticated;
