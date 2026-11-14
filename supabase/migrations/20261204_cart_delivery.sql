-- Корзина и доставка: цена доставки у бутика (по своему городу и по республике), бесплатная доставка от суммы,
-- стоимость доставки сохраняется в каждом заказе. Деньги за доставку покупатель отдаёт курьеру — в сумму товаров не входят.

alter table public.boutiques add column if not exists delivery_fee_city integer;
alter table public.boutiques add column if not exists delivery_fee_region integer;
alter table public.boutiques add column if not exists free_delivery_from integer;
do $$ begin
  alter table public.boutiques add constraint boutiques_fee_chk check (
    (delivery_fee_city is null or delivery_fee_city between 0 and 10000)
    and (delivery_fee_region is null or delivery_fee_region between 0 and 20000)
    and (free_delivery_from is null or free_delivery_from between 1 and 1000000));
exception when duplicate_object then null; end $$;
grant select (delivery_fee_city, delivery_fee_region, free_delivery_from) on public.boutiques to anon, authenticated;
grant update (delivery_fee_city, delivery_fee_region, free_delivery_from) on public.boutiques to authenticated;

alter table public.orders add column if not exists delivery_fee_rub integer;
do $$ begin
  alter table public.orders add constraint orders_fee_chk check (delivery_fee_rub is null or delivery_fee_rub between 0 and 20000);
exception when duplicate_object then null; end $$;

-- Цена доставки для адреса: в городе бутика (или город в адресе не указан) — по городу, в другой город — по республике.
-- От суммы free_delivery_from — бесплатно. null — бутик цену не указал (сообщит сам).
create or replace function public.delivery_fee_for(bid uuid, addr text, amount integer) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when b.free_delivery_from is not null and amount >= b.free_delivery_from then 0
    when b.city is null or coalesce(addr, '') ilike '%' || b.city || '%'
      or not exists (select 1 from unnest(array['Грозный','Аргун','Гудермес','Урус-Мартан','Шали','Курчалой','Ачхой-Мартан','Наурская','Ведено']) c
                     where c <> b.city and coalesce(addr, '') ilike '%' || c || '%')
      then b.delivery_fee_city
    else coalesce(b.delivery_fee_region, b.delivery_fee_city)
  end
  from public.boutiques b where b.id = bid
$$;
revoke all on function public.delivery_fee_for(uuid, text, integer) from public, anon, authenticated;

-- Что умеют бутики корзины: + город, логотип и цены доставки
create or replace function public.checkout_options(pids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'name', b.name, 'city', b.city, 'logo', b.logo_path, 'pickup', b.delivery_pickup, 'courier', b.delivery_courier, 'reserve', b.allow_reserve,
    'cash', b.pay_cash, 'transfer', b.pay_transfer, 'prepay', b.pay_prepay and b.sbp_phone is not null,
    'fee_city', b.delivery_fee_city, 'fee_region', b.delivery_fee_region, 'free_from', b.free_delivery_from, 'address', b.address)), '[]'::jsonb)
  from public.boutiques b
  where b.is_approved and b.id in (select boutique_id from public.products where id = any (pids[1:50]));
$$;

-- Оформление заказа: то же, что раньше, + стоимость доставки в заказе
create or replace function public.place_order(items jsonb, contact jsonb, idem uuid DEFAULT NULL::uuid)
 returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); ids uuid[] := '{}'; oid uuid; b record; r record; n integer; total integer;
  ph text; dl text; ad text; cm text; key text; have int; hold timestamptz; shops int; qsum int; pay text; tr jsonb;
  q jsonb; promo uuid; pcode text; pby text; pshop uuid; disc int := 0; left_disc int; base int; part int; k int := 0; cnt int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and is_blocked) then raise exception 'blocked'; end if;
  if idem is not null then
    select coalesce(array_agg(id order by created_at), '{}') into ids from public.orders where buyer_id = uid and idempotency_key = idem;
    if cardinality(ids) > 0 then return ids; end if;
  end if;
  -- есть неоплаченный заказ — новые нельзя, пока вопрос не решён
  if public.buyer_has_debt(uid) then raise exception 'unpaid debt'; end if;
  perform public.rate_limit('order_min', 3, 60);
  perform public.rate_limit('order_day', 30, 86400);
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 50 then raise exception 'bad items'; end if;
  ph := regexp_replace(coalesce(contact ->> 'phone', ''), '[^0-9+]', '', 'g');
  if ph !~ '^\+?[0-9]{10,15}$' then raise exception 'bad phone'; end if;
  dl := contact ->> 'delivery';
  if dl is null or dl not in ('pickup', 'courier', 'reserve') then raise exception 'bad delivery'; end if;
  ad := nullif(btrim(left(coalesce(contact ->> 'address', ''), 200)), '');
  if dl = 'courier' and ad is null then raise exception 'address required'; end if;
  cm := nullif(btrim(left(coalesce(contact ->> 'comment', ''), 300)), '');
  -- оплата: при доставке — выбор покупателя из включённых бутиком, при самовывозе и примерке — в бутике
  pay := case when dl = 'courier' then coalesce(contact ->> 'payment', 'cash') else 'on_delivery' end;
  if pay not in ('on_delivery', 'cash', 'transfer', 'prepay') then raise exception 'bad payment'; end if;
  if dl = 'reserve' then
    hold := ((public.msk_today() + case when contact ->> 'day' = 'tomorrow' then 1 else 0 end)::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Moscow';
    if (select count(*) from public.orders where buyer_id = uid and delivery = 'reserve' and status in ('new', 'confirmed') and hold_until > now()) >= 3 then
      raise exception 'reserve limit';
    end if;
  end if;
  if nullif(btrim(coalesce(contact ->> 'promo', '')), '') is not null then
    q := public.promo_quote(contact ->> 'promo', items);
    if not (q ->> 'ok')::boolean then raise exception 'promo %', q ->> 'error'; end if;
    promo := (q ->> 'promo_id')::uuid; pcode := q ->> 'code'; pby := q ->> 'by'; pshop := nullif(q ->> 'boutique_id', '')::uuid; disc := (q ->> 'discount')::int;
  end if;
  create temp table if not exists _kl_cart (pid uuid, size text, qty int, boutique uuid, title text, price int) on commit drop;
  truncate pg_temp._kl_cart;
  for r in select (e ->> 'product_id')::uuid pid, nullif(e ->> 'size', '') size, (e ->> 'qty')::int qty from jsonb_array_elements(items) e loop
    if r.qty is null or r.qty < 1 or r.qty > 99 then raise exception 'bad qty'; end if;
    insert into pg_temp._kl_cart select r.pid, r.size, r.qty, p.boutique_id, p.title, p.price_rub
      from public.products p join public.boutiques bq on bq.id = p.boutique_id
      where p.id = r.pid and p.is_published and p.moderation = 'ok' and bq.is_approved
        and (dl <> 'reserve' or bq.allow_reserve)
        and (r.size is null and coalesce(cardinality(p.sizes), 0) = 0 or r.size = any (p.sizes));
    get diagnostics n = row_count;
    if n = 0 then raise exception 'product unavailable'; end if;
    key := coalesce(r.size, '_');
    select (stock ->> key)::int into have from public.products where id = r.pid and stock ? key for update;
    if found and have is not null then
      if have < r.qty then raise exception 'out of stock'; end if;
      update public.products set stock = jsonb_set(stock, array[key], to_jsonb(have - r.qty)) where id = r.pid;
    end if;
  end loop;
  if dl = 'reserve' then
    select count(distinct boutique), sum(qty) into shops, qsum from pg_temp._kl_cart;
    if shops <> 1 or qsum > 3 then raise exception 'reserve limit'; end if;
  end if;
  -- способ оплаты должен быть включён у каждого бутика корзины
  if dl = 'courier' and exists (
    select 1 from public.boutiques bq where bq.id in (select boutique from pg_temp._kl_cart) and not (
      (pay = 'cash' and bq.pay_cash) or (pay = 'transfer' and bq.pay_transfer) or (pay = 'prepay' and bq.pay_prepay and bq.sbp_phone is not null))) then
    raise exception 'payment unavailable';
  end if;
  select count(distinct boutique), sum(price * qty) into cnt, base from pg_temp._kl_cart;
  -- лимит доверия для доставки с оплатой при получении
  if dl = 'courier' and pay in ('cash', 'transfer') then
    tr := public.buyer_trust(uid);
    if (tr ->> 'active_n')::int + cnt > (tr ->> 'lim_n')::int or (tr ->> 'active_sum')::int + base - disc > (tr ->> 'lim_sum')::int then
      raise exception 'cod limit % %', tr ->> 'lim_n', tr ->> 'lim_sum';
    end if;
  end if;
  left_disc := disc;
  for b in select c.boutique, sum(c.price * c.qty) s, bool_or(bq.auto_accept) auto from pg_temp._kl_cart c join public.boutiques bq on bq.id = c.boutique group by c.boutique order by sum(c.price * c.qty) loop
    k := k + 1;
    part := 0;
    if promo is not null then
      if pby = 'boutique' then part := case when b.boutique = pshop then disc else 0 end;
      else part := case when k = cnt then left_disc else floor(disc::numeric * b.s / base)::int end; left_disc := left_disc - part;
      end if;
      part := least(part, b.s - 1);
    end if;
    insert into public.orders (buyer_id, boutique_id, total_rub, idempotency_key, delivery, phone, address, comment, hold_until,
      subtotal_rub, discount_rub, promo_id, promo_code, discount_by, payment, status, accepted_at, delivery_fee_rub)
      values (uid, b.boutique, 1, idem, dl, ph, case when dl = 'courier' then ad end, cm, hold,
        b.s, part, case when part > 0 then promo end, case when part > 0 then pcode end, case when part > 0 then pby end,
        pay, case when b.auto then 'confirmed' else 'new' end::public.order_status, case when b.auto then now() end,
        case when dl = 'courier' then public.delivery_fee_for(b.boutique, ad, b.s - part) end) returning id into oid;
    insert into public.order_items (order_id, product_id, boutique_id, title, price_rub, qty, size)
      select oid, pid, boutique, title, price, qty, size from pg_temp._kl_cart where boutique = b.boutique;
    select sum(price_rub * qty) into total from public.order_items where order_id = oid;
    update public.orders set total_rub = total - part, subtotal_rub = total where id = oid;
    ids := ids || oid;
  end loop;
  if promo is not null then insert into public.promo_uses (promo_id, user_id, order_ids) values (promo, uid, ids); end if;
  return ids;
end $$;
