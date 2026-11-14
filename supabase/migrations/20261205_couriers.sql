-- Курьеры. Основа для работы со службами доставки и такси.
--  • delivery_services — список служб (ведёт админ): контакты для ручного вызова, режим 'api' для подключённых служб.
--  • deliveries — вызов курьера по заказу: служба, статус, курьер, ссылка на отслеживание, сколько взять с покупателя.
--  • delivery_events — история статусов (кто и когда изменил).
--  Ступень 1: продавец вызывает курьера (готовый текст заявки) и отмечает статусы сам.
--  Ступень 2: подключённая служба присылает статусы на наш адрес (функция delivery-webhook) со своим ключом.
--  «Доставлен» закрывает заказ. Автопилот напоминает продавцу вызвать курьера и сообщает админу о зависших доставках.

create table if not exists public.delivery_services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  kind text not null default 'delivery' check (kind in ('delivery', 'taxi')),
  mode text not null default 'manual' check (mode in ('manual', 'api')),
  phone text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
  telegram text check (telegram is null or telegram ~ '^[A-Za-z0-9_]{5,32}$'),
  app_url text check (app_url is null or app_url ~ '^https://[^\s]{4,300}$'),
  api_url text check (api_url is null or api_url ~ '^https://[^\s]{4,300}$'),
  cities text[] not null default '{}',
  note text check (note is null or char_length(note) <= 200),
  is_active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.delivery_services enable row level security;
drop policy if exists ds_select on public.delivery_services;
drop policy if exists ds_admin on public.delivery_services;
create policy ds_select on public.delivery_services for select to authenticated using (is_active or public.is_admin());
create policy ds_admin on public.delivery_services for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.delivery_services from anon, authenticated;
grant select, insert, update, delete on public.delivery_services to authenticated;

-- ключи служб для приёма статусов: храним только хэш, видит только сервер
create table if not exists public.delivery_service_keys (
  service_id uuid primary key references public.delivery_services (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.delivery_service_keys enable row level security;
revoke all on public.delivery_service_keys from anon, authenticated;

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  boutique_id uuid not null references public.boutiques (id) on delete cascade,
  service_id uuid references public.delivery_services (id) on delete set null,
  service_name text not null,
  status text not null default 'requested' check (status in ('requested', 'assigned', 'picked_up', 'delivered', 'failed', 'cancelled')),
  external_id text check (external_id is null or char_length(external_id) <= 100),
  courier_name text check (courier_name is null or char_length(courier_name) <= 60),
  courier_phone text check (courier_phone is null or courier_phone ~ '^\+?[0-9]{10,15}$'),
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://[^\s]{4,500}$'),
  fee_rub integer check (fee_rub is null or fee_rub between 0 and 20000),
  cod_rub integer not null default 0 check (cod_rub >= 0),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists deliveries_active_uq on public.deliveries (order_id) where status in ('requested', 'assigned', 'picked_up');
create index if not exists deliveries_order_idx on public.deliveries (order_id);
create unique index if not exists deliveries_ext_uq on public.deliveries (service_id, external_id) where external_id is not null;
alter table public.deliveries enable row level security;
drop policy if exists dl_select on public.deliveries;
create policy dl_select on public.deliveries for select to authenticated using (
  public.owns_boutique(boutique_id) or public.is_admin()
  or exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));
revoke all on public.deliveries from anon, authenticated;
grant select on public.deliveries to authenticated;

create table if not exists public.delivery_events (
  id bigserial primary key,
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  status text not null,
  source text not null check (source in ('seller', 'service', 'system', 'admin')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists delivery_events_idx on public.delivery_events (delivery_id, created_at);
alter table public.delivery_events enable row level security;
drop policy if exists de_select on public.delivery_events;
create policy de_select on public.delivery_events for select to authenticated using (
  exists (select 1 from public.deliveries d where d.id = delivery_id and (public.owns_boutique(d.boutique_id) or public.is_admin()
    or exists (select 1 from public.orders o where o.id = d.order_id and o.buyer_id = (select auth.uid())))));
revoke all on public.delivery_events from anon, authenticated;
grant select on public.delivery_events to authenticated;

-- Смена статуса доставки (общая для продавца, службы и админа): история, уведомление покупателю, закрытие заказа
create or replace function public.delivery_apply(did uuid, st text, src text, info jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.deliveries; o public.orders; shop text; cname text; cphone text; turl text;
begin
  select * into d from public.deliveries where id = did for update;
  if not found then raise exception 'delivery not found'; end if;
  if st not in ('assigned', 'picked_up', 'delivered', 'failed', 'cancelled') then raise exception 'bad status'; end if;
  if d.status in ('delivered', 'failed', 'cancelled') then raise exception 'delivery closed'; end if;
  -- назад по цепочке не ходим (служба могла прислать статусы не по порядку)
  if array_position(array['requested', 'assigned', 'picked_up', 'delivered'], st) < array_position(array['requested', 'assigned', 'picked_up', 'delivered'], d.status) then return; end if;
  cname := nullif(btrim(left(coalesce(info ->> 'courier_name', ''), 60)), '');
  cphone := nullif(regexp_replace(coalesce(info ->> 'courier_phone', ''), '[^0-9+]', '', 'g'), '');
  if cphone is not null and cphone !~ '^\+?[0-9]{10,15}$' then cphone := null; end if;
  turl := nullif(info ->> 'tracking_url', '');
  if turl is not null and turl !~ '^https://[^\s]{4,500}$' then turl := null; end if;
  update public.deliveries set status = st, updated_at = now(),
    courier_name = coalesce(cname, courier_name), courier_phone = coalesce(cphone, courier_phone), tracking_url = coalesce(turl, tracking_url),
    note = coalesce(nullif(btrim(left(coalesce(info ->> 'note', ''), 200)), ''), note)
    where id = did;
  insert into public.delivery_events (delivery_id, status, source, note) values (did, st, src, nullif(btrim(left(coalesce(info ->> 'note', ''), 200)), ''));
  select * into o from public.orders where id = d.order_id;
  select name into shop from public.boutiques where id = d.boutique_id;
  if st = 'assigned' then
    perform public.notify(o.buyer_id, 'delivery_assigned', o.id, 'Курьер назначен',
      'Курьер ' || coalesce(cname, d.courier_name, d.service_name) || ' скоро заберёт ваш заказ из «' || shop || '».', '/orders');
  elsif st = 'picked_up' then
    perform public.notify(o.buyer_id, 'delivery_picked', o.id, 'Заказ в пути',
      'Курьер забрал заказ из «' || shop || '».' || case when d.cod_rub > 0 or coalesce(d.fee_rub, 0) > 0
        then ' Оплата курьеру: ' || (d.cod_rub + coalesce(d.fee_rub, 0)) || ' ₽.' else '' end, '/orders');
  elsif st = 'delivered' then
    -- заказ выполнен: уведомление покупателю придёт от смены статуса заказа
    update public.orders set status = 'done', closed_by = case when src = 'admin' then 'admin' when src = 'seller' then 'seller' else 'auto' end
      where id = o.id and status = 'confirmed';
  elsif st in ('failed', 'cancelled') then
    perform public.notify((select owner_id from public.boutiques where id = d.boutique_id), 'delivery_failed', o.id,
      case when st = 'failed' then 'Доставка не удалась' else 'Курьер отменён' end,
      'Заказ на ' || o.total_rub || ' ₽: ' || coalesce(nullif(info ->> 'note', ''), 'вызовите курьера ещё раз или свяжитесь с покупателем') || '.', '/seller/orders/' || o.id);
  end if;
end $$;
revoke all on function public.delivery_apply(uuid, text, text, jsonb) from public, anon, authenticated;

-- Продавец вызывает курьера: создаём доставку и отдаём данные для заявки (откуда, куда, телефон, сколько взять)
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
    'cod', cod, 'fee', o.delivery_fee_rub, 'payment', o.payment, 'comment', o.comment,
    'service', jsonb_build_object('name', s.name, 'mode', s.mode, 'phone', s.phone, 'whatsapp', s.whatsapp, 'telegram', s.telegram, 'app_url', s.app_url));
end $$;
revoke all on function public.seller_call_courier(uuid, uuid, text) from public, anon;
grant execute on function public.seller_call_courier(uuid, uuid, text) to authenticated;

-- Продавец отмечает статус сам (для служб без подключения)
create or replace function public.seller_delivery_status(did uuid, st text, courier_name text default null, courier_phone text default null, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  select boutique_id into bid from public.deliveries where id = did;
  if bid is null or not (public.owns_boutique(bid) or public.is_admin()) then raise exception 'forbidden'; end if;
  perform public.delivery_apply(did, st, case when public.owns_boutique(bid) then 'seller' else 'admin' end,
    jsonb_build_object('courier_name', courier_name, 'courier_phone', courier_phone, 'note', note));
end $$;
revoke all on function public.seller_delivery_status(uuid, text, text, text, text) from public, anon;
grant execute on function public.seller_delivery_status(uuid, text, text, text, text) to authenticated;

-- Админ выдаёт службе ключ для приёма статусов (показывается один раз; новый ключ заменяет старый)
create or replace function public.admin_delivery_key(sid uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.delivery_services where id = sid) then raise exception 'not found'; end if;
  t := 'kl_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.delivery_service_keys (service_id, token_hash) values (sid, encode(extensions.digest(t, 'sha256'), 'hex'))
    on conflict (service_id) do update set token_hash = excluded.token_hash, created_at = now();
  update public.delivery_services set mode = 'api' where id = sid;
  return t;
end $$;
revoke all on function public.admin_delivery_key(uuid) from public, anon;
grant execute on function public.admin_delivery_key(uuid) to authenticated;

-- Статус от подключённой службы (вызывается только сервером — функцией delivery-webhook)
-- payload: { delivery_id | external_id, status, courier_name?, courier_phone?, tracking_url?, note?, set_external_id? }
create or replace function public.delivery_webhook(token text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sid uuid; did uuid; st text;
begin
  select service_id into sid from public.delivery_service_keys
    where token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex');
  if sid is null then return jsonb_build_object('ok', false, 'error', 'bad_token'); end if;
  if payload ? 'delivery_id' and (payload ->> 'delivery_id') ~ '^[0-9a-f-]{36}$' then
    select id into did from public.deliveries where id = (payload ->> 'delivery_id')::uuid and service_id = sid;
  elsif payload ? 'external_id' then
    select id into did from public.deliveries where service_id = sid and external_id = left(payload ->> 'external_id', 100);
  end if;
  if did is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if nullif(payload ->> 'set_external_id', '') is not null then
    update public.deliveries set external_id = left(payload ->> 'set_external_id', 100) where id = did and external_id is null;
  end if;
  st := payload ->> 'status';
  if st not in ('assigned', 'picked_up', 'delivered', 'failed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'bad_status'); end if;
  begin
    perform public.delivery_apply(did, st, 'service', payload);
  exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  return jsonb_build_object('ok', true, 'delivery_id', did, 'status', st);
end $$;
revoke all on function public.delivery_webhook(text, jsonb) from public, anon, authenticated;
grant execute on function public.delivery_webhook(text, jsonb) to service_role;

-- Сторож доставок: напомнить вызвать курьера, сообщить админу о зависших
create or replace function public.delivery_watch() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; a uuid; n1 int := 0; n2 int := 0; n3 int := 0;
begin
  -- принят 2 часа назад, курьер не вызван
  for r in select o.id, o.boutique_id, o.total_rub from public.orders o
    where o.status = 'confirmed' and o.delivery = 'courier' and coalesce(o.accepted_at, o.created_at) < now() - interval '2 hours'
      and not exists (select 1 from public.deliveries d where d.order_id = o.id) loop
    perform public.notify((select owner_id from public.boutiques where id = r.boutique_id), 'courier_remind', r.id,
      'Вызовите курьера', 'Заказ на ' || r.total_rub || ' ₽ принят, но курьер ещё не вызван.', '/seller/orders/' || r.id);
    n1 := n1 + 1;
  end loop;
  -- принят сутки назад и всё ещё не отправлен — сообщаем админам
  for r in select o.id, o.total_rub, b.name from public.orders o join public.boutiques b on b.id = o.boutique_id
    where o.status = 'confirmed' and o.delivery = 'courier' and coalesce(o.accepted_at, o.created_at) < now() - interval '24 hours'
      and not exists (select 1 from public.deliveries d where d.order_id = o.id and d.status in ('picked_up', 'delivered')) loop
    for a in select id from public.profiles where role = 'admin' loop
      perform public.notify(a, 'courier_late', r.id, 'Заказ не отправлен сутки', '«' || r.name || '», заказ на ' || r.total_rub || ' ₽ — курьер не забрал заказ.', '/admin/s/orders');
    end loop;
    n2 := n2 + 1;
  end loop;
  -- курьер вызван 3 часа назад, но никто не назначен
  for r in select d.id, d.order_id, d.boutique_id, d.service_name from public.deliveries d
    where d.status = 'requested' and d.created_at < now() - interval '3 hours' loop
    perform public.notify((select owner_id from public.boutiques where id = r.boutique_id), 'courier_stuck', r.order_id,
      'Курьер не назначен', r.service_name || ' не подтвердил курьера за 3 часа. Отметьте статус или вызовите другую службу.', '/seller/orders/' || r.order_id);
    n3 := n3 + 1;
  end loop;
  return jsonb_build_object('reminded', n1, 'late', n2, 'stuck', n3);
end $$;
revoke all on function public.delivery_watch() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'kl-delivery-watch') then perform cron.unschedule('kl-delivery-watch'); end if;
  perform cron.schedule('kl-delivery-watch', '*/15 * * * *', 'select public.delivery_watch()');
end $$;
