-- Неделя 3: скидки, цвет, «сообщить о поступлении», исправление просмотров, ускорение базы.

-- ---------- скидка: старая цена (зачёркнутая) ----------
alter table public.products add column if not exists old_price_rub integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_old_price_check') then
    alter table public.products add constraint products_old_price_check check (old_price_rub is null or (old_price_rub > price_rub and old_price_rub <= 10000000));
  end if;
end $$;
-- ---------- цвет товара (для фильтра) ----------
alter table public.products add column if not exists color text
  check (color is null or color in ('black', 'white', 'beige', 'brown', 'grey', 'blue', 'green', 'red', 'burgundy', 'pink', 'yellow', 'multi'));
grant insert (old_price_rub, color), update (old_price_rub, color) on public.products to authenticated;
create index if not exists products_color_idx on public.products (color);

-- ---------- «Сообщить, когда появится размер» ----------
create table if not exists public.stock_alerts (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null default '_' check (size ~ '^[0-9A-Za-z.,_]{1,6}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, product_id, size)
);
create index if not exists stock_alerts_product_idx on public.stock_alerts (product_id);
alter table public.stock_alerts enable row level security;
drop policy if exists stock_alerts_own on public.stock_alerts;
create policy stock_alerts_own on public.stock_alerts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, delete on public.stock_alerts to authenticated;
grant insert (product_id, size) on public.stock_alerts to authenticated;
drop trigger if exists rl_stock_alerts on public.stock_alerts;
create trigger rl_stock_alerts before insert on public.stock_alerts for each row execute function public.limit_writes('stock_alert', 30, 3600);

-- когда остаток размера стал больше нуля — уведомляем подписчиков и снимаем подписку
create or replace function public.on_stock_back() returns trigger language plpgsql security definer set search_path = '' as $$
declare k text; a record;
begin
  if new.stock is null or new.stock is not distinct from old.stock then return new; end if;
  for k in select key from jsonb_each_text(new.stock) where value ~ '^[0-9]+$' and value::int > 0 loop
    if coalesce((old.stock ->> k)::int, 0) > 0 then continue; end if;
    for a in delete from public.stock_alerts where product_id = new.id and size = k returning user_id loop
      perform public.notify(a.user_id, 'stock_back', new.id, 'Появилось в наличии',
        new.title || case when k <> '_' then ', размер ' || k else '' end, '/product/' || new.id);
    end loop;
  end loop;
  return new;
end $$;
drop trigger if exists stock_back on public.products;
create trigger stock_back after update of stock on public.products for each row execute function public.on_stock_back();

-- ---------- просмотры: первый просмотр за день тоже считается ----------
create or replace function public.track_view(pid uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.rate_ok(coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'), 'view', case when auth.uid() is null then 600 else 60 end, 60) then return; end if;
  insert into public.product_views (product_id, day, views) select p.id, public.msk_today(), 1 from public.products p where p.id = pid and p.is_published
  on conflict (product_id, day) do update set views = public.product_views.views + 1;
end $$;

-- ---------- ускорение базы ----------
-- индексы на внешние ключи
create index if not exists boutiques_owner_idx on public.boutiques (owner_id);
create index if not exists local_brands_boutique_idx on public.local_brands (boutique_id);
create index if not exists order_items_boutique_idx on public.order_items (boutique_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
create index if not exists products_boutique_idx on public.products (boutique_id);
create index if not exists promotions_product_idx on public.promotions (product_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists reviews_user_idx on public.reviews (user_id);
create index if not exists wishlist_product_idx on public.wishlist (product_id);
create index if not exists orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index if not exists products_published_created_idx on public.products (created_at desc) where is_published;
-- дублирующийся индекс заявок
do $$ begin
  if exists (select 1 from pg_indexes where indexname = 'role_requests_one_pending')
     and exists (select 1 from pg_indexes where indexname = 'one_pending_request_per_user')
     and not exists (select 1 from pg_constraint where conname = 'role_requests_one_pending') then
    execute 'drop index public.role_requests_one_pending';
  end if;
end $$;
-- правила доступа: auth.uid() считается один раз на запрос, а не для каждой строки
do $$
declare p record; q text; w text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies
           where schemaname = 'public' and (qual ~ 'auth\.uid\(\)' or with_check ~ 'auth\.uid\(\)') loop
    q := regexp_replace(p.qual, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi');
    w := regexp_replace(p.with_check, '(?<!select )auth\.uid\(\)', '(select auth.uid())', 'gi');
    execute format('alter policy %I on %I.%I %s %s', p.policyname, p.schemaname, p.tablename,
      case when q is not null then 'using (' || q || ')' else '' end,
      case when w is not null then 'with check (' || w || ')' else '' end);
  end loop;
end $$;
-- одна политика чтения вместо двух (публичная + админ)
drop policy if exists local_brands_admin_select on public.local_brands;
drop policy if exists local_brands_public on public.local_brands;
create policy local_brands_select on public.local_brands for select
  using ((is_approved and starts_at <= now() and (ends_at is null or ends_at > now())) or public.is_admin());
drop policy if exists promotions_admin_select on public.promotions;
drop policy if exists promotions_public on public.promotions;
create policy promotions_select on public.promotions for select
  using ((starts_at <= now() and ends_at > now()) or public.is_admin());
