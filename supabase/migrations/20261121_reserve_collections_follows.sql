-- «Отложить и примерить в бутике», подборки, подписка на бутик.

-- ---------- 1. Отложить и примерить ----------
alter table public.boutiques add column if not exists allow_reserve boolean not null default true;
grant update (allow_reserve) on public.boutiques to authenticated;
alter table public.orders drop constraint if exists orders_delivery_check;
alter table public.orders add constraint orders_delivery_check check (delivery in ('pickup', 'courier', 'reserve'));
alter table public.orders add column if not exists hold_until timestamptz;
create index if not exists orders_reserve_idx on public.orders (hold_until) where delivery = 'reserve' and status in ('new', 'confirmed');

-- Оформление: + бронь «отложить и примерить» (contact.delivery = 'reserve', contact.day = 'today' | 'tomorrow')
create or replace function public.place_order(items jsonb, contact jsonb, idem uuid default null)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); ids uuid[] := '{}'; oid uuid; b record; r record; n integer; total integer;
  ph text; dl text; ad text; cm text; key text; have int; hold timestamptz; shops int; qsum int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and is_blocked) then raise exception 'blocked'; end if;
  if idem is not null then
    select coalesce(array_agg(id order by created_at), '{}') into ids from public.orders where buyer_id = uid and idempotency_key = idem;
    if cardinality(ids) > 0 then return ids; end if;
  end if;
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
  if dl = 'reserve' then
    -- бронь до конца выбранного дня по Москве; не больше 3 активных броней
    hold := ((public.msk_today() + case when contact ->> 'day' = 'tomorrow' then 1 else 0 end)::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Moscow';
    if (select count(*) from public.orders where buyer_id = uid and delivery = 'reserve' and status in ('new', 'confirmed') and hold_until > now()) >= 3 then
      raise exception 'reserve limit';
    end if;
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
  for b in select distinct boutique from pg_temp._kl_cart loop
    insert into public.orders (buyer_id, boutique_id, total_rub, idempotency_key, delivery, phone, address, comment, hold_until)
      values (uid, b.boutique, 1, idem, dl, ph, case when dl = 'courier' then ad end, cm, hold) returning id into oid;
    insert into public.order_items (order_id, product_id, boutique_id, title, price_rub, qty, size)
      select oid, pid, boutique, title, price, qty, size from pg_temp._kl_cart where boutique = b.boutique;
    select sum(price_rub * qty) into total from public.order_items where order_id = oid;
    update public.orders set total_rub = total where id = oid;
    ids := ids || oid;
  end loop;
  return ids;
end $$;
revoke all on function public.place_order(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, uuid) to authenticated;

-- Просроченные брони отменяются: товар возвращается в продажу, контакт удаляется, покупатель получает уведомление
create or replace function public.expire_reservations() returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.orders set status = 'cancelled'
  where delivery = 'reserve' and status in ('new', 'confirmed') and hold_until < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_reservations() from public, anon;
grant execute on function public.expire_reservations() to authenticated;
-- планировщик: проверка каждые 15 минут
create extension if not exists pg_cron;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'kl-expire-reservations') then
    perform cron.unschedule('kl-expire-reservations');
  end if;
  perform cron.schedule('kl-expire-reservations', '*/15 * * * *', 'select public.expire_reservations()');
end $$;

-- ---------- 2. Подборки ----------
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 60),
  subtitle text check (subtitle is null or char_length(subtitle) <= 120),
  cover_path text check (cover_path is null or cover_path ~ '^collections/[0-9a-f-]{36}\.jpg$'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  is_published boolean not null default false,
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort smallint not null default 0,
  primary key (collection_id, product_id)
);
create index if not exists collection_items_product_idx on public.collection_items (product_id);
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
create policy collections_select on public.collections for select
  using ((is_published and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_admin());
create policy collections_admin_insert on public.collections for insert with check (public.is_admin());
create policy collections_admin_update on public.collections for update using (public.is_admin()) with check (public.is_admin());
create policy collections_admin_delete on public.collections for delete using (public.is_admin());
create policy collection_items_select on public.collection_items for select using (true);
create policy collection_items_admin_insert on public.collection_items for insert with check (public.is_admin());
create policy collection_items_admin_update on public.collection_items for update using (public.is_admin()) with check (public.is_admin());
create policy collection_items_admin_delete on public.collection_items for delete using (public.is_admin());
grant select on public.collections, public.collection_items to anon, authenticated;
grant insert, update, delete on public.collections, public.collection_items to authenticated;
-- обложки подборок — в том же хранилище, что и баннеры брендов (загружает только админ)
drop policy if exists brand_media_insert on storage.objects;
create policy brand_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-media' and public.is_admin()
    and (name ~ '^brands/[0-9a-f-]{36}-(banner|logo)\.jpg$' or name ~ '^collections/[0-9a-f-]{36}\.jpg$'));

-- ---------- 3. Подписка на бутик ----------
create table if not exists public.boutique_follows (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, boutique_id)
);
create index if not exists boutique_follows_boutique_idx on public.boutique_follows (boutique_id);
alter table public.boutique_follows enable row level security;
create policy boutique_follows_own on public.boutique_follows for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, delete on public.boutique_follows to authenticated;
grant insert (boutique_id) on public.boutique_follows to authenticated;
drop trigger if exists rl_follows on public.boutique_follows;
create trigger rl_follows before insert on public.boutique_follows for each row execute function public.limit_writes('follow', 60, 3600);

-- число подписчиков бутика (без раскрытия, кто подписан)
create or replace function public.boutique_followers(bid uuid) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.boutique_follows where boutique_id = bid;
$$;
revoke all on function public.boutique_followers(uuid) from public;
grant execute on function public.boutique_followers(uuid) to anon, authenticated;

-- новинка в бутике → уведомление подписчикам (один раз на товар)
create or replace function public.on_product_published() returns trigger language plpgsql security definer set search_path = '' as $$
declare bname text; f record;
begin
  if not new.is_published or new.moderation <> 'ok' then return new; end if;
  if tg_op = 'UPDATE' and old.is_published then return new; end if;
  if new.created_at < now() - interval '14 days' then return new; end if; -- старые товары, снятые и вновь выставленные, не рассылаем
  select name into bname from public.boutiques where id = new.boutique_id and is_approved;
  if bname is null then return new; end if;
  for f in select user_id from public.boutique_follows where boutique_id = new.boutique_id loop
    perform public.notify(f.user_id, 'boutique_new', new.id, 'Новинка в ' || bname, new.title, '/product/' || new.id);
  end loop;
  return new;
end $$;
drop trigger if exists product_published on public.products;
create trigger product_published after insert or update of is_published on public.products for each row execute function public.on_product_published();
