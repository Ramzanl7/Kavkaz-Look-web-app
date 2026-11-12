-- Неделя 2: профиль бутика, статистика продавца, модерация товаров и отзывов, жалобы, рассылки.

-- ---------- профиль бутика ----------
alter table public.boutiques add column if not exists logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
alter table public.boutiques add column if not exists cover_path text check (cover_path is null or cover_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
alter table public.boutiques add column if not exists address text check (address is null or char_length(address) <= 200);
alter table public.boutiques add column if not exists hours text check (hours is null or char_length(hours) <= 100);
alter table public.boutiques add column if not exists phone text check (phone is null or phone ~ '^\+?[0-9]{10,15}$');
alter table public.boutiques add column if not exists whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$');
alter table public.boutiques add column if not exists telegram text check (telegram is null or telegram ~ '^[A-Za-z0-9_]{5,32}$');
alter table public.boutiques add column if not exists delivery_pickup boolean not null default true;
alter table public.boutiques add column if not exists delivery_courier boolean not null default false;
alter table public.boutiques add column if not exists courier_note text check (courier_note is null or char_length(courier_note) <= 150);
grant update (city, logo_path, cover_path, address, hours, phone, whatsapp, telegram, delivery_pickup, delivery_courier, courier_note) on public.boutiques to authenticated;
drop trigger if exists rl_boutique_edit on public.boutiques;
create trigger rl_boutique_edit before update on public.boutiques for each row execute function public.limit_writes('boutique_edit', 30, 60);

-- ---------- просмотры товаров (для статистики продавца) ----------
create table if not exists public.product_views (
  product_id uuid not null references public.products(id) on delete cascade,
  day date not null,
  views integer not null default 0,
  primary key (product_id, day)
);
alter table public.product_views enable row level security; -- читают только функции статистики
create or replace function public.track_view(pid uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.rate_ok(coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'), 'view', case when auth.uid() is null then 600 else 60 end, 60) then return; end if;
  insert into public.product_views (product_id, day) select p.id, public.msk_today() from public.products p where p.id = pid and p.is_published
  on conflict (product_id, day) do update set views = public.product_views.views + 1;
end $$;
revoke all on function public.track_view(uuid) from public;
grant execute on function public.track_view(uuid) to anon, authenticated;

-- Статистика бутика владельца за N дней: по товарам и итоги
create or replace function public.seller_stats(days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare bid uuid; since date; res jsonb;
begin
  select id into bid from public.boutiques where owner_id = auth.uid() limit 1;
  if bid is null then raise exception 'forbidden'; end if;
  since := public.msk_today() - greatest(1, least(days, 365));
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(x order by x.views desc) from (
      select p.id, p.title,
        coalesce((select sum(v.views) from public.product_views v where v.product_id = p.id and v.day > since), 0) views,
        (select count(*) from public.wishlist w where w.product_id = p.id) wished,
        coalesce((select sum(i.qty) from public.order_items i join public.orders o on o.id = i.order_id where i.product_id = p.id and o.status = 'done' and o.created_at >= since), 0) sold,
        coalesce((select sum(i.qty * i.price_rub) from public.order_items i join public.orders o on o.id = i.order_id where i.product_id = p.id and o.status = 'done' and o.created_at >= since), 0) revenue
      from public.products p where p.boutique_id = bid) x), '[]'),
    'orders', (select jsonb_build_object(
        'new', count(*) filter (where status = 'new'), 'confirmed', count(*) filter (where status = 'confirmed'),
        'done', count(*) filter (where status = 'done'), 'cancelled', count(*) filter (where status = 'cancelled'),
        'revenue', coalesce(sum(total_rub) filter (where status = 'done'), 0))
      from public.orders where boutique_id = bid and created_at >= since),
    'views', coalesce((select sum(v.views) from public.product_views v join public.products p on p.id = v.product_id where p.boutique_id = bid and v.day > since), 0),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'views', d.v) order by d.day), '[]') from (
      select v.day, sum(v.views) v from public.product_views v join public.products p on p.id = v.product_id where p.boutique_id = bid and v.day > since group by v.day) d)
  ) into res;
  return res;
end $$;
revoke all on function public.seller_stats(integer) from public, anon;
grant execute on function public.seller_stats(integer) to authenticated;

-- ---------- модерация товаров ----------
alter table public.products add column if not exists moderation text not null default 'ok' check (moderation in ('ok', 'blocked'));
alter table public.products add column if not exists moderation_reason text check (moderation_reason is null or char_length(moderation_reason) <= 300);
drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (
  (is_published and moderation = 'ok' and exists (select 1 from public.boutiques b where b.id = products.boutique_id and b.is_approved))
  or public.owns_boutique(boutique_id) or public.is_admin());
create or replace function public.admin_moderate_product(pid uuid, block boolean, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid; t text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.products set moderation = case when block then 'blocked' else 'ok' end,
    moderation_reason = case when block then nullif(btrim(left(reason, 300)), '') end
  where id = pid returning title into t;
  if not found then raise exception 'not found'; end if;
  select b.owner_id into owner from public.products p join public.boutiques b on b.id = p.boutique_id where p.id = pid;
  perform public.notify(owner, case when block then 'product_blocked' else 'product_unblocked' end, pid,
    case when block then 'Товар скрыт модератором' else 'Товар снова в продаже' end,
    t || case when block and reason is not null then ': ' || left(reason, 200) else '' end, '/seller/products');
end $$;
revoke all on function public.admin_moderate_product(uuid, boolean, text) from public, anon;
grant execute on function public.admin_moderate_product(uuid, boolean, text) to authenticated;

-- ---------- модерация отзывов ----------
alter table public.reviews add column if not exists hidden boolean not null default false;
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select using (not hidden or user_id = auth.uid() or public.is_admin());
create or replace function public.refresh_rating() returns trigger language plpgsql security definer set search_path = '' as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.product_id = pid and not r.hidden), 0),
    rating_count = (select count(*) from public.reviews r where r.product_id = pid and not r.hidden)
  where p.id = pid;
  return null;
end $$;
create or replace function public.admin_hide_review(rid uuid, hide boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.reviews set hidden = hide where id = rid;
  if not found then raise exception 'not found'; end if;
end $$;
revoke all on function public.admin_hide_review(uuid, boolean) from public, anon;
grant execute on function public.admin_hide_review(uuid, boolean) to authenticated;
-- пересчёт рейтинга при скрытии отзыва
drop trigger if exists reviews_hidden_rating on public.reviews;
create trigger reviews_hidden_rating after update of hidden on public.reviews for each row execute function public.refresh_rating();

-- ---------- жалобы ----------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('product', 'review', 'boutique')),
  target_id uuid not null,
  reason text not null check (reason in ('fake', 'offensive', 'prohibited', 'fraud', 'other')),
  body text check (body is null or char_length(body) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists reports_one_open on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index if not exists reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy reports_select on public.reports for select using (reporter_id = (select auth.uid()) or public.is_admin());
create policy reports_update on public.reports for update using (public.is_admin()) with check (public.is_admin());
grant select on public.reports to authenticated;
grant insert (target_type, target_id, reason, body) on public.reports to authenticated;
grant update (status, resolved_at) on public.reports to authenticated;
drop trigger if exists rl_reports on public.reports;
create trigger rl_reports before insert on public.reports for each row execute function public.limit_writes('report', 10, 3600);

-- ---------- рассылка уведомлений от администратора ----------
create or replace function public.admin_broadcast(title text, body text, audience text default 'all', link text default '/catalog')
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer; ref uuid := gen_random_uuid();
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if char_length(btrim(coalesce(title, ''))) < 2 then raise exception 'bad title'; end if;
  if audience not in ('all', 'buyers', 'sellers') then raise exception 'bad audience'; end if;
  if link is null or link !~ '^/[A-Za-z0-9/_-]*$' then link := '/catalog'; end if;
  perform public.rate_limit('broadcast', 5, 3600);
  insert into public.notifications (user_id, kind, ref, title, body, link)
  select p.id, 'broadcast', ref, left(btrim(title), 120), left(coalesce(body, ''), 300), link
  from public.profiles p
  where not p.is_blocked and (audience = 'all' or (audience = 'buyers' and p.role = 'buyer') or (audience = 'sellers' and p.role = 'seller'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.admin_broadcast(text, text, text, text) from public, anon;
grant execute on function public.admin_broadcast(text, text, text, text) to authenticated;

-- ---------- оформление заказа: товар, скрытый модератором, купить нельзя ----------
do $$ begin
  if exists (select 1 from pg_proc where proname = 'place_order') then
    execute replace(pg_get_functiondef('public.place_order(jsonb, jsonb, uuid)'::regprocedure),
      'where p.id = r.pid and p.is_published and bq.is_approved', 'where p.id = r.pid and p.is_published and p.moderation = ''ok'' and bq.is_approved');
  end if;
end $$;
