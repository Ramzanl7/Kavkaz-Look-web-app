-- Точка доставки на карте: координаты в заказе (их видят покупатель, продавец и курьер в заявке).
-- Удаляются вместе с адресом после закрытия заказа.
alter table public.orders add column if not exists delivery_lat numeric(9, 6);
alter table public.orders add column if not exists delivery_lng numeric(9, 6);
do $$ begin
  alter table public.orders add constraint orders_point_chk check (
    (delivery_lat is null and delivery_lng is null)
    or (delivery_lat between 40 and 46 and delivery_lng between 42 and 49));
exception when duplicate_object then null; end $$;

-- Покупатель ставит точку на только что оформленные заказы с доставкой (в течение 15 минут)
create or replace function public.set_order_point(ids uuid[], lat numeric, lng numeric) returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if lat is null or lng is null or lat not between 40 and 46 or lng not between 42 and 49 then raise exception 'bad point'; end if;
  update public.orders set delivery_lat = round(lat, 6), delivery_lng = round(lng, 6)
    where id = any (ids[1:20]) and buyer_id = auth.uid() and delivery = 'courier' and address is not null
      and status in ('new', 'confirmed') and created_at > now() - interval '15 minutes';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_order_point(uuid[], numeric, numeric) from public, anon;
grant execute on function public.set_order_point(uuid[], numeric, numeric) to authenticated;

-- адрес стёрли (автопилот после закрытия) — стираем и точку
create or replace function public.orders_clear_point() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.address is null then new.delivery_lat := null; new.delivery_lng := null; end if;
  return new;
end $$;
drop trigger if exists orders_clear_point on public.orders;
create trigger orders_clear_point before update of address on public.orders for each row execute function public.orders_clear_point();

-- Заявка курьеру — теперь с точкой на карте
create or replace function public.seller_call_courier(oid uuid, sid uuid, note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders; s public.delivery_services; b public.boutiques; did uuid; cod int; n int;
begin
  select * into o from public.orders where id = oid;
  if not found or not public.owns_boutique(o.boutique_id) then raise exception 'forbidden'; end if;
  if o.delivery <> 'courier' then raise exception 'not courier order'; end if;
  if o.status <> 'confirmed' then raise exception 'order not confirmed'; end if;
  if exists (select 1 from public.deliveries where order_id = oid and status in ('requested', 'assigned', 'picked_up')) then raise exception 'courier already called'; end if;
  select * into s from public.delivery_services where id = sid and is_active;
  if not found then raise exception 'service unavailable'; end if;
  perform public.rate_limit('courier_call', 30, 3600);
  select * into b from public.boutiques where id = o.boutique_id;
  cod := case when o.payment in ('cash', 'transfer') and o.unpaid_at is null then o.total_rub else 0 end;
  insert into public.deliveries (order_id, boutique_id, service_id, service_name, fee_rub, cod_rub, note)
    values (oid, o.boutique_id, sid, s.name, o.delivery_fee_rub, cod, nullif(btrim(left(coalesce(note, ''), 200)), ''))
    returning id into did;
  insert into public.delivery_events (delivery_id, status, source) values (did, 'requested', 'seller');
  perform public.notify(o.buyer_id, 'delivery_requested', o.id, 'Курьер вызван',
    'Бутик «' || b.name || '» вызвал курьера (' || s.name || '). Скоро он заберёт ваш заказ.', '/orders');
  select coalesce(sum(qty), 0) into n from public.order_items where order_id = oid;
  return jsonb_build_object('delivery_id', did, 'order', upper(left(oid::text, 6)), 'shop', b.name, 'shop_phone', b.phone,
    'pickup', concat_ws(', ', b.city, b.address), 'dropoff', o.address, 'phone', o.phone, 'items', n,
    'cod', cod, 'fee', o.delivery_fee_rub, 'payment', o.payment, 'comment', o.comment, 'lat', o.delivery_lat, 'lng', o.delivery_lng,
    'service', jsonb_build_object('name', s.name, 'mode', s.mode, 'phone', s.phone, 'whatsapp', s.whatsapp, 'telegram', s.telegram, 'app_url', s.app_url));
end $$;
