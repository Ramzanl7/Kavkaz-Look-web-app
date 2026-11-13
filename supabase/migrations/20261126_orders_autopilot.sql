-- Заказы на автопилоте: продавец нажимает «Принять» (или включает автоприём) и действует только при проблемах.
-- Способы оплаты на выбор бутика, предоплата по СБП, лимиты доверия, «Не оплатил» с уведомлением админу.

-- ===== 1. Настройки бутика =====
alter table public.boutiques add column if not exists auto_accept boolean not null default false;
alter table public.boutiques add column if not exists pay_cash boolean not null default true;
alter table public.boutiques add column if not exists pay_transfer boolean not null default true;
alter table public.boutiques add column if not exists pay_prepay boolean not null default false;
alter table public.boutiques add column if not exists sbp_phone text check (sbp_phone is null or sbp_phone ~ '^\+?[0-9]{10,15}$');
alter table public.boutiques add column if not exists sbp_bank text check (sbp_bank is null or char_length(sbp_bank) <= 40);
-- Номер для СБП и банк не публичные: читать таблицу целиком больше нельзя, только перечисленные колонки
revoke select on public.boutiques from anon, authenticated;
grant select (id, owner_id, name, description, city, is_approved, created_at, logo_path, cover_path, address, hours, phone, whatsapp, telegram,
  delivery_pickup, delivery_courier, courier_note, allow_reserve, auto_accept, pay_cash, pay_transfer, pay_prepay) on public.boutiques to anon, authenticated;
grant update (auto_accept, pay_cash, pay_transfer, pay_prepay, sbp_phone, sbp_bank) on public.boutiques to authenticated;

-- ===== 2. Заказы: оплата и жизненный цикл =====
alter table public.orders drop constraint if exists orders_payment_check;
alter table public.orders add constraint orders_payment_check check (payment in ('on_delivery', 'cash', 'transfer', 'prepay'));
alter table public.orders add column if not exists accepted_at timestamptz;
alter table public.orders add column if not exists closed_at timestamptz;
alter table public.orders add column if not exists closed_by text check (closed_by is null or closed_by in ('buyer', 'seller', 'auto', 'admin'));
alter table public.orders add column if not exists unpaid_at timestamptz;
alter table public.orders add column if not exists unpaid_resolved_at timestamptz;
alter table public.orders add column if not exists paid_claim_at timestamptz;
alter table public.orders add column if not exists reminded boolean not null default false;
alter table public.orders add column if not exists hold_reminded boolean not null default false;
grant select (accepted_at, closed_at, closed_by, unpaid_at, unpaid_resolved_at, paid_claim_at) on public.orders to authenticated;
create index if not exists orders_autopilot_idx on public.orders (status, created_at) where status in ('new', 'confirmed');
create index if not exists orders_buyer_unpaid_idx on public.orders (buyer_id) where unpaid_at is not null and unpaid_resolved_at is null;

-- Оплата при получении курьеру — та, где возможна неоплата
create or replace function public.is_cod(o public.orders) returns boolean language sql immutable set search_path = '' as $$
  select o.delivery = 'courier' and o.payment in ('cash', 'transfer', 'on_delivery');
$$;

-- Долг покупателя: продавец сообщил о неоплате, вопрос не решён
create or replace function public.buyer_has_debt(uid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders where buyer_id = uid and unpaid_at is not null and unpaid_resolved_at is null);
$$;
revoke all on function public.buyer_has_debt(uuid) from public, anon, authenticated;

-- Доверие: сколько заказов покупатель уже выкупил и какой у него лимит на доставку с оплатой при получении
create or replace function public.buyer_trust(uid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  with p as (
    select count(*) filter (where status = 'done' and (unpaid_at is null or unpaid_resolved_at is not null)) paid,
           count(*) filter (where status in ('new', 'confirmed') and delivery = 'courier' and payment in ('cash', 'transfer', 'on_delivery')) active_n,
           coalesce(sum(total_rub) filter (where status in ('new', 'confirmed') and delivery = 'courier' and payment in ('cash', 'transfer', 'on_delivery')), 0) active_sum
    from public.orders where buyer_id = uid
  )
  select jsonb_build_object('paid', paid, 'active_n', active_n, 'active_sum', active_sum,
    'lim_n', case when paid >= 3 then 3 when paid >= 1 then 2 else 1 end,
    'lim_sum', case when paid >= 3 then 50000 when paid >= 1 then 25000 else 10000 end,
    'debt', public.buyer_has_debt(uid))
  from p;
$$;
revoke all on function public.buyer_trust(uuid) from public, anon, authenticated;

create or replace function public.my_trust() returns jsonb language sql stable security definer set search_path = '' as $$
  select case when (select auth.uid()) is null then null else public.buyer_trust((select auth.uid())) end;
$$;
revoke all on function public.my_trust() from public, anon;
grant execute on function public.my_trust() to authenticated;

-- ===== 3. Оформление: какие способы получения и оплаты есть у бутиков корзины =====
create or replace function public.checkout_options(pids uuid[]) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'name', b.name, 'pickup', b.delivery_pickup, 'courier', b.delivery_courier, 'reserve', b.allow_reserve,
    'cash', b.pay_cash, 'transfer', b.pay_transfer, 'prepay', b.pay_prepay and b.sbp_phone is not null)), '[]'::jsonb)
  from public.boutiques b
  where b.is_approved and b.id in (select boutique_id from public.products where id = any (pids[1:50]));
$$;
revoke all on function public.checkout_options(uuid[]) from public;
grant execute on function public.checkout_options(uuid[]) to anon, authenticated;

-- Реквизиты для предоплаты — только покупателю этого заказа
create or replace function public.order_pay_info(oid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('phone', b.sbp_phone, 'bank', b.sbp_bank, 'name', b.name, 'total', o.total_rub)
  from public.orders o join public.boutiques b on b.id = o.boutique_id
  where o.id = oid and o.buyer_id = (select auth.uid()) and o.payment = 'prepay';
$$;
revoke all on function public.order_pay_info(uuid) from public, anon;
grant execute on function public.order_pay_info(uuid) to authenticated;

-- Настройки оплаты бутика (номер СБП не публичный — только владельцу)
create or replace function public.my_boutique_pay(bid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('auto_accept', auto_accept, 'pay_cash', pay_cash, 'pay_transfer', pay_transfer, 'pay_prepay', pay_prepay, 'sbp_phone', sbp_phone, 'sbp_bank', sbp_bank)
  from public.boutiques where id = bid and owner_id = (select auth.uid());
$$;
revoke all on function public.my_boutique_pay(uuid) from public, anon;
grant execute on function public.my_boutique_pay(uuid) to authenticated;

-- ===== 4. Новый заказ =====
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
      subtotal_rub, discount_rub, promo_id, promo_code, discount_by, payment, status, accepted_at)
      values (uid, b.boutique, 1, idem, dl, ph, case when dl = 'courier' then ad end, cm, hold,
        b.s, part, case when part > 0 then promo end, case when part > 0 then pcode end, case when part > 0 then pby end,
        pay, case when b.auto then 'confirmed' else 'new' end::public.order_status, case when b.auto then now() end) returning id into oid;
    insert into public.order_items (order_id, product_id, boutique_id, title, price_rub, qty, size)
      select oid, pid, boutique, title, price, qty, size from pg_temp._kl_cart where boutique = b.boutique;
    select sum(price_rub * qty) into total from public.order_items where order_id = oid;
    update public.orders set total_rub = total - part, subtotal_rub = total where id = oid;
    ids := ids || oid;
  end loop;
  if promo is not null then insert into public.promo_uses (promo_id, user_id, order_ids) values (promo, uid, ids); end if;
  return ids;
end $$;

-- Уведомление продавцу о новом заказе: ссылка прямо на заказ (в пуше на Android — кнопка «Принять»)
create or replace function public.on_order_item_new() returns trigger language plpgsql security definer set search_path = '' as $$
declare owner uuid; st public.order_status;
begin
  select b.owner_id into owner from public.boutiques b where b.id = new.boutique_id;
  select status into st from public.orders where id = new.order_id;
  perform public.notify(owner, 'order_new', new.order_id,
    case when st = 'confirmed' then 'Новый заказ — принят автоматически' else 'Новый заказ' end,
    new.title || ' × ' || new.qty, '/seller/orders/' || new.order_id);
  return new;
end $$;

-- ===== 5. Смена статуса =====
create or replace function public.set_order_status(oid uuid, new_status public.order_status)
 returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); o public.orders; ok boolean := false; who text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.rate_limit('order_status', 40, 60);
  select * into o from public.orders where id = oid;
  if not found then raise exception 'order not found'; end if;
  if public.is_admin() then ok := true; who := 'admin';
  elsif o.buyer_id = uid and o.status = 'new' and new_status = 'cancelled' then ok := true; who := 'buyer';
  -- покупатель сам закрывает заказ: «Получил»
  elsif o.buyer_id = uid and o.status = 'confirmed' and new_status = 'done' and o.delivery in ('courier', 'pickup') then ok := true; who := 'buyer';
  elsif new_status in ('confirmed', 'done', 'cancelled')
    and exists (select 1 from public.order_items where order_id = oid)
    and not exists (select 1 from public.order_items i where i.order_id = oid and not public.owns_boutique(i.boutique_id)) then ok := true; who := 'seller';
  end if;
  if not ok then raise exception 'forbidden'; end if;
  if o.status = new_status then return; end if;
  if o.status in ('done', 'cancelled') and who <> 'admin' then raise exception 'order closed'; end if;
  update public.orders set status = new_status,
    accepted_at = case when new_status = 'confirmed' then coalesce(accepted_at, now()) else accepted_at end,
    closed_by = case when new_status in ('done', 'cancelled') then who else closed_by end
  where id = oid;
end $$;

-- Закрытие: время закрытия, возврат остатков при отмене, удаление контакта.
-- При доставке с оплатой при получении телефон хранится ещё 3 дня — на случай «Не оплатил» (чистит автопилот).
create or replace function public.on_order_closed() returns trigger language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status in ('done', 'cancelled') then new.closed_at := now(); end if;
  if new.status = 'cancelled' then
    for i in select product_id, coalesce(size, '_') k, qty from public.order_items where order_id = new.id loop
      update public.products set stock = jsonb_set(stock, array[i.k], to_jsonb((stock ->> i.k)::int + i.qty))
        where id = i.product_id and stock ? i.k and (stock ->> i.k) ~ '^[0-9]+$';
    end loop;
  end if;
  if new.status = 'cancelled' or (new.status = 'done' and not public.is_cod(new)) then new.phone := null; new.address := null; end if;
  return new;
end $$;

-- Уведомления покупателю и продавцу о смене статуса
create or replace function public.on_order_status() returns trigger language plpgsql security definer set search_path = '' as $$
declare t text; body text; o record;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.buyer_id is not null and new.buyer_id is distinct from auth.uid() and not (new.status = 'done' and new.unpaid_at is not null) then
    t := case
      when new.status = 'confirmed' then 'Бутик принял ваш заказ'
      when new.status = 'done' then 'Заказ выполнен — как вам покупка?'
      when new.status = 'cancelled' and new.closed_by = 'auto' and new.delivery = 'reserve' then 'Бронь закончилась'
      when new.status = 'cancelled' and new.closed_by = 'auto' then 'Бутик не ответил — заказ отменён'
      when new.status = 'cancelled' then 'Заказ отменён'
      else 'Статус заказа изменён' end;
    body := case when new.status = 'done' then 'Оцените товар — это поможет другим покупателям.'
      when new.status = 'cancelled' and new.closed_by = 'auto' and new.delivery <> 'reserve' then 'Извините! Деньги не списывались. Посмотрите похожие вещи в других бутиках.'
      else 'Сумма: ' || new.total_rub || ' ₽' end;
    perform public.notify(new.buyer_id, 'order_' || new.status, new.id, t, body, '/orders');
  end if;
  if new.status = 'cancelled' and (new.buyer_id = auth.uid() or new.closed_by = 'auto') then
    for o in select distinct b.owner_id from public.order_items i join public.boutiques b on b.id = i.boutique_id where i.order_id = new.id loop
      if new.closed_by = 'auto' and new.delivery <> 'reserve' then
        perform public.notify(o.owner_id, 'order_autocancel', new.id, 'Заказ отменён автоматически', 'Вы не приняли его за 24 часа. Включите автоприём в профиле бутика, чтобы не пропускать заказы.', '/seller/orders');
      elsif new.closed_by <> 'auto' then
        perform public.notify(o.owner_id, 'order_cancelled_by_buyer', new.id, 'Покупатель отменил заказ', 'Сумма: ' || new.total_rub || ' ₽', '/seller/orders');
      end if;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.expire_reservations() returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.orders set status = 'cancelled', closed_by = 'auto'
  where delivery = 'reserve' and status in ('new', 'confirmed') and hold_until < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ===== 6. Неоплата =====
-- Продавец: «Покупатель не оплатил». Только доставка с оплатой при получении, до 3 дней после закрытия.
create or replace function public.order_unpaid(oid uuid) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; bq record; who record; a record; info text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.rate_limit('order_unpaid', 10, 3600);
  select * into o from public.orders where id = oid;
  if not found then raise exception 'order not found'; end if;
  select b.id, b.name, b.owner_id into bq from public.boutiques b where b.id = o.boutique_id;
  if not (bq.owner_id = auth.uid() or public.is_admin()) then raise exception 'forbidden'; end if;
  if not public.is_cod(o) or o.unpaid_at is not null or o.status not in ('confirmed', 'done')
     or (o.status = 'done' and o.closed_at < now() - interval '3 days') then raise exception 'not allowed'; end if;
  update public.orders set unpaid_at = now(),
    status = case when status = 'confirmed' then 'done'::public.order_status else status end,
    closed_by = case when status = 'confirmed' then 'seller' else closed_by end
  where id = oid;
  select coalesce(p.display_name, '') nm, coalesce(u.email, '') em into who
    from public.profiles p left join auth.users u on u.id = p.id where p.id = o.buyer_id;
  info := left(concat_ws(' · ', nullif(who.nm, ''), nullif(who.em, ''), o.phone, bq.name, o.total_rub || ' ₽', o.address), 300);
  for a in select id from public.profiles where role = 'admin' and not is_blocked loop
    perform public.notify(a.id, 'order_unpaid', oid, 'Неоплаченный заказ', info, '/admin/tools/unpaid');
  end loop;
  perform public.notify(o.buyer_id, 'order_unpaid_buyer', oid, 'Бутик сообщил, что заказ не оплачен',
    'Новые заказы недоступны, пока вопрос не решится. Если вы оплатили — нажмите «Я оплатил» в заказе.', '/orders');
end $$;
revoke all on function public.order_unpaid(uuid) from public, anon;
grant execute on function public.order_unpaid(uuid) to authenticated;

-- Продавец или админ: «Оплата получена» — ограничения снимаются
create or replace function public.order_paid(oid uuid) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into o from public.orders where id = oid;
  if not found then raise exception 'order not found'; end if;
  if not (public.is_admin() or exists (select 1 from public.boutiques where id = o.boutique_id and owner_id = auth.uid())) then raise exception 'forbidden'; end if;
  if o.unpaid_at is null or o.unpaid_resolved_at is not null then return; end if;
  update public.orders set unpaid_resolved_at = now() where id = oid;
  perform public.notify(o.buyer_id, 'order_unpaid_resolved', oid, 'Ограничение снято', 'Спасибо! Вы снова можете оформлять заказы.', '/orders');
end $$;
revoke all on function public.order_paid(uuid) from public, anon;
grant execute on function public.order_paid(uuid) to authenticated;

-- Покупатель: «Я оплатил» — для неоплаты и для предоплаты по СБП (сообщает продавцу, при неоплате — и админу)
create or replace function public.order_paid_claim(oid uuid) returns void language plpgsql security definer set search_path = '' as $$
declare o public.orders; owner uuid; a record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.rate_limit('order_paid_claim', 10, 3600);
  select * into o from public.orders where id = oid and buyer_id = auth.uid();
  if not found then raise exception 'order not found'; end if;
  if not ((o.unpaid_at is not null and o.unpaid_resolved_at is null) or (o.payment = 'prepay' and o.status in ('new', 'confirmed'))) then raise exception 'not allowed'; end if;
  if o.paid_claim_at is not null and o.paid_claim_at > now() - interval '1 hour' then return; end if;
  update public.orders set paid_claim_at = now() where id = oid;
  select owner_id into owner from public.boutiques where id = o.boutique_id;
  if o.payment = 'prepay' and o.unpaid_at is null then
    perform public.notify(owner, 'order_prepaid', oid, 'Покупатель сообщил о предоплате', 'Проверьте поступление ' || o.total_rub || ' ₽ по СБП и отправляйте заказ.', '/seller/orders/' || oid);
  else
    perform public.notify(owner, 'order_paid_claim', oid, 'Покупатель сообщает, что оплатил', 'Проверьте поступление ' || o.total_rub || ' ₽. Если деньги пришли — нажмите «Оплата получена».', '/seller/orders/' || oid);
    for a in select id from public.profiles where role = 'admin' and not is_blocked loop
      perform public.notify(a.id, 'order_paid_claim_admin', oid, 'Покупатель оспаривает неоплату', 'Заказ на ' || o.total_rub || ' ₽ — покупатель сообщает, что оплатил.', '/admin/tools/unpaid');
    end loop;
  end if;
end $$;
revoke all on function public.order_paid_claim(uuid) from public, anon;
grant execute on function public.order_paid_claim(uuid) to authenticated;

-- Продавцу в заказах: надёжность покупателя (выкуплено заказов, есть ли долг) — только по своим заказам
create or replace function public.buyer_flags(oids uuid[]) returns table (order_id uuid, paid int, debt boolean)
language sql stable security definer set search_path = '' as $$
  select o.id, (public.buyer_trust(o.buyer_id) ->> 'paid')::int, public.buyer_has_debt(o.buyer_id)
  from public.orders o
  where o.id = any (oids[1:200]) and exists (select 1 from public.boutiques b where b.id = o.boutique_id and b.owner_id = (select auth.uid()));
$$;
revoke all on function public.buyer_flags(uuid[]) from public, anon;
grant execute on function public.buyer_flags(uuid[]) to authenticated;

-- Админу: неоплаченные заказы с данными покупателя
create or replace function public.admin_unpaid_list() returns table (
  order_id uuid, created_at timestamptz, unpaid_at timestamptz, resolved_at timestamptz, paid_claim_at timestamptz,
  total_rub int, phone text, address text, boutique text, boutique_phone text, buyer_id uuid, buyer_name text, buyer_email text, buyer_paid int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select o.id, o.created_at, o.unpaid_at, o.unpaid_resolved_at, o.paid_claim_at, o.total_rub, o.phone, o.address,
      b.name, coalesce(b.phone, b.whatsapp), o.buyer_id, p.display_name, u.email::text, (public.buyer_trust(o.buyer_id) ->> 'paid')::int
    from public.orders o join public.boutiques b on b.id = o.boutique_id
      left join public.profiles p on p.id = o.buyer_id left join auth.users u on u.id = o.buyer_id
    where o.unpaid_at is not null
    order by (o.unpaid_resolved_at is null) desc, o.unpaid_at desc
    limit 200;
end $$;
revoke all on function public.admin_unpaid_list() from public, anon;
grant execute on function public.admin_unpaid_list() to authenticated;

-- ===== 7. Автопилот (каждые 15 минут) =====
create or replace function public.orders_autopilot() returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; n_rem int := 0; n_cancel int := 0; n_close int := 0; n_hold int := 0; n_clean int := 0;
begin
  -- 1) Напоминание продавцу: заказ не принят 2 часа
  for r in update public.orders o set reminded = true
    where o.status = 'new' and not o.reminded and o.delivery <> 'reserve' and o.created_at < now() - interval '2 hours'
    returning o.id, o.boutique_id, o.total_rub loop
    perform public.notify((select owner_id from public.boutiques where id = r.boutique_id), 'order_remind', r.id,
      'Заказ ждёт подтверждения', 'Примите заказ на ' || r.total_rub || ' ₽ — через 24 часа после оформления он отменится автоматически.', '/seller/orders/' || r.id);
    n_rem := n_rem + 1;
  end loop;
  -- 2) Не принят 24 часа — отменяем, товар возвращается в продажу
  update public.orders set status = 'cancelled', closed_by = 'auto'
    where status = 'new' and delivery <> 'reserve' and created_at < now() - interval '24 hours';
  get diagnostics n_cancel = row_count;
  -- 3) Принят 3 дня назад и никто не закрыл — закрываем сами
  update public.orders set status = 'done', closed_by = 'auto'
    where status = 'confirmed' and delivery in ('courier', 'pickup') and coalesce(accepted_at, created_at) < now() - interval '3 days';
  get diagnostics n_close = row_count;
  -- 4) Бронь заканчивается через час — спросить продавца, купили ли
  for r in update public.orders o set hold_reminded = true
    where o.delivery = 'reserve' and o.status in ('new', 'confirmed') and not o.hold_reminded and o.hold_until between now() and now() + interval '1 hour'
    returning o.id, o.boutique_id loop
    perform public.notify((select owner_id from public.boutiques where id = r.boutique_id), 'reserve_remind', r.id,
      'Бронь заканчивается через час', 'Покупатель пришёл и купил? Отметьте «Купил», иначе вещь вернётся в продажу.', '/seller/orders/' || r.id);
    n_hold := n_hold + 1;
  end loop;
  perform public.expire_reservations();
  -- 5) Телефон и адрес после выполнения храним 3 дня (на случай неоплаты), потом удаляем
  update public.orders set phone = null, address = null
    where status = 'done' and phone is not null and closed_at < now() - interval '3 days'
      and (unpaid_at is null or unpaid_resolved_at is not null);
  get diagnostics n_clean = row_count;
  return jsonb_build_object('reminded', n_rem, 'cancelled', n_cancel, 'closed', n_close, 'hold_reminded', n_hold, 'cleaned', n_clean);
end $$;
revoke all on function public.orders_autopilot() from public, anon, authenticated;

-- Уже открытые заказы: время принятия — время оформления (чтобы автозакрытие считалось честно)
update public.orders set accepted_at = created_at where status = 'confirmed' and accepted_at is null;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'kl-orders-autopilot') then perform cron.unschedule('kl-orders-autopilot'); end if;
  perform cron.schedule('kl-orders-autopilot', '*/15 * * * *', 'select public.orders_autopilot()');
end $$;
