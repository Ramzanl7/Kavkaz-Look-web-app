-- Точка бутика на карте: нужна курьеру, чтобы построить маршрут «курьер → бутик → покупатель».
alter table public.boutiques add column if not exists lat numeric(9, 6);
alter table public.boutiques add column if not exists lng numeric(9, 6);
do $$ begin
  alter table public.boutiques add constraint boutiques_point_chk check (
    (lat is null and lng is null) or (lat between 40 and 46 and lng between 42 and 49));
exception when duplicate_object then null; end $$;
grant select (lat, lng) on public.boutiques to anon, authenticated;
grant update (lat, lng) on public.boutiques to authenticated;

-- Заявка курьеру — теперь и с точкой бутика
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
    'cod', cod, 'fee', o.delivery_fee_rub, 'payment', o.payment, 'comment', o.comment, 'lat', o.delivery_lat, 'lng', o.delivery_lng, 'shop_lat', b.lat, 'shop_lng', b.lng,
    'service', jsonb_build_object('name', s.name, 'mode', s.mode, 'phone', s.phone, 'whatsapp', s.whatsapp, 'telegram', s.telegram, 'app_url', s.app_url));
end $$;
