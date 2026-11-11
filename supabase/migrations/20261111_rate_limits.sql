-- Лимиты частоты действий (защита от спама и атак) + защита заказа от повторной отправки.
-- Лимиты проверяет база, поэтому их нельзя обойти, отправляя запросы мимо сайта.
-- При превышении — ошибка с кодом PT429 (PostgREST отдаёт её как HTTP 429 «слишком часто»).

create table public.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, action, window_start)
);
alter table public.rate_limits enable row level security; -- клиентам доступа нет вообще

-- Считает действие и возвращает false, если лимит превышен (max_hits за window_seconds).
create or replace function public.rate_ok(key_user uuid, action text, max_hits integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds); h integer;
begin
  if key_user is null then return true; end if;
  insert into public.rate_limits (user_id, action, window_start, hits) values (key_user, action, w, 1)
  on conflict (user_id, action, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into h;
  -- изредка чистим старые окна
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '2 days'; end if;
  return h <= max_hits;
end $$;

-- То же, но с ошибкой «слишком часто».
create or replace function public.rate_limit(action text, max_hits integer, window_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.rate_ok(auth.uid(), action, max_hits, window_seconds) then
    raise exception 'Слишком много действий подряд. Подождите немного и попробуйте снова.' using errcode = 'PT429';
  end if;
end $$;

-- ===== Заказ: лимиты + ключ повтора (одна попытка оформления = один заказ, даже при повторной отправке) =====
alter table public.orders add column idempotency_key uuid;
create unique index orders_buyer_idem on public.orders (buyer_id, idempotency_key) where idempotency_key is not null;

drop function if exists public.create_order(jsonb);
create function public.create_order(items jsonb, idem uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); oid uuid; total integer; r record; n integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and is_blocked) then raise exception 'blocked'; end if;
  -- повтор той же попытки (кнопка «зависла», плохой интернет) — возвращаем уже созданный заказ
  if idem is not null then
    select id into oid from public.orders where buyer_id = uid and idempotency_key = idem;
    if found then return oid; end if;
  end if;
  perform public.rate_limit('order_min', 3, 60);
  perform public.rate_limit('order_day', 30, 86400);
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 50 then raise exception 'bad items'; end if;
  insert into public.orders (buyer_id, total_rub, idempotency_key) values (uid, 1, idem) returning id into oid;
  for r in select (e ->> 'product_id')::uuid as pid, (e ->> 'qty')::int as qty from jsonb_array_elements(items) e loop
    if r.qty is null or r.qty < 1 or r.qty > 99 then raise exception 'bad qty'; end if;
    insert into public.order_items (order_id, product_id, boutique_id, title, price_rub, qty)
      select oid, p.id, p.boutique_id, p.title, p.price_rub, r.qty
      from public.products p join public.boutiques b on b.id = p.boutique_id
      where p.id = r.pid and p.is_published and b.is_approved;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'product unavailable'; end if;
  end loop;
  select sum(price_rub * qty) into total from public.order_items where order_id = oid;
  update public.orders set total_rub = total where id = oid;
  return oid;
end $$;
revoke all on function public.create_order(jsonb, uuid) from public, anon;
grant execute on function public.create_order(jsonb, uuid) to authenticated;

-- ===== Лимиты внутри существующих функций (через обёртки-проверки в начале) =====
-- Отзывы: 10 в час
create or replace function public.add_review(pid uuid, stars integer, txt text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); nm text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and is_blocked) then raise exception 'blocked'; end if;
  perform public.rate_limit('review', 10, 3600);
  if stars is null or stars < 1 or stars > 5 then raise exception 'bad rating'; end if;
  if txt is not null and char_length(txt) > 1000 then raise exception 'text too long'; end if;
  if not exists (
    select 1 from public.order_items i join public.orders o on o.id = i.order_id
    where o.buyer_id = uid and i.product_id = pid and o.status <> 'cancelled'
  ) then raise exception 'purchase required'; end if;
  select coalesce(nullif(btrim(display_name), ''), 'Покупатель') into nm from public.profiles where id = uid;
  insert into public.reviews (product_id, user_id, author_name, rating, body)
    values (pid, uid, nm, stars, nullif(btrim(txt), ''))
  on conflict (product_id, user_id)
    do update set rating = excluded.rating, body = excluded.body, author_name = excluded.author_name, created_at = now();
end $$;

-- Смена статуса заказа: 40 в минуту (продавцу с множеством заказов хватит)
create or replace function public.set_order_status(oid uuid, new_status public.order_status)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cur public.order_status; buyer uuid; ok boolean := false;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  perform public.rate_limit('order_status', 40, 60);
  select status, buyer_id into cur, buyer from public.orders where id = oid;
  if not found then raise exception 'order not found'; end if;
  if public.is_admin() then ok := true;
  elsif buyer = uid and cur = 'new' and new_status = 'cancelled' then ok := true;
  elsif new_status in ('confirmed', 'done', 'cancelled')
    and exists (select 1 from public.order_items where order_id = oid)
    and not exists (select 1 from public.order_items i where i.order_id = oid and not public.owns_boutique(i.boutique_id)) then ok := true;
  end if;
  if not ok then raise exception 'forbidden'; end if;
  if cur = new_status then return; end if; -- повторное нажатие ничего не меняет
  update public.orders set status = new_status where id = oid;
end $$;

-- ===== Лимиты на прямые записи в таблицы (через триггеры) =====
create or replace function public.limit_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a text := tg_argv[0]; mx integer := tg_argv[1]::integer; win integer := tg_argv[2]::integer;
begin
  -- служебные функции (security definer от имени postgres) и сервисный ключ не ограничиваем
  if auth.uid() is null then return coalesce(new, old); end if;
  -- каскадные изменения (например, удаление аккаунта удаляет его отзывы) не считаем
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  -- пересчёт рейтинга товара после отзыва — не действие продавца
  if tg_table_name = 'products' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'rating_avg' - 'rating_count') = (to_jsonb(old) - 'rating_avg' - 'rating_count') then return new; end if;
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' and new.display_name is not distinct from old.display_name then return new; end if;
  perform public.rate_limit(a, mx, win);
  return coalesce(new, old);
end $$;

create trigger rl_wishlist before insert on public.wishlist for each row execute function public.limit_writes('wishlist', '60', '60');
create trigger rl_role_requests before insert on public.role_requests for each row execute function public.limit_writes('role_request', '3', '86400');
create trigger rl_partner_requests before insert on public.partner_requests for each row execute function public.limit_writes('partner_request', '3', '86400');
create trigger rl_products_ins before insert on public.products for each row execute function public.limit_writes('product_add', '30', '3600');
create trigger rl_products_upd before update on public.products for each row execute function public.limit_writes('product_edit', '60', '60');
create trigger rl_products_del before delete on public.products for each row execute function public.limit_writes('product_del', '30', '60');
create trigger rl_reviews_del before delete on public.reviews for each row execute function public.limit_writes('review_del', '20', '3600');
create trigger rl_profiles_name before update on public.profiles for each row execute function public.limit_writes('profile_name', '10', '60');
create trigger rl_support before update on public.support_contacts for each row execute function public.limit_writes('support_edit', '20', '60');

-- Не больше одной заявки на бутик/партнёрство «на рассмотрении» одновременно
create unique index role_requests_one_pending on public.role_requests (user_id) where status = 'pending';
create unique index partner_requests_one_pending on public.partner_requests (user_id) where status = 'pending';

-- Избранное: не больше 500 товаров у одного человека
create or replace function public.wishlist_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.wishlist where user_id = new.user_id) >= 500 then
    raise exception 'В избранном уже 500 товаров' using errcode = 'PT429';
  end if;
  return new;
end $$;
create trigger wishlist_cap before insert on public.wishlist for each row execute function public.wishlist_cap();

-- Проверка лимита загрузки — только для самого себя (нельзя потратить чужой лимит).
create or replace function public.upload_ok()
returns boolean language sql security definer set search_path = '' as $$ select public.rate_ok(auth.uid(), 'upload', 120, 3600) $$;

-- Загрузка фото товаров: 120 файлов в час (у товара 2 файла: фото и миниатюра)
drop policy if exists product_images_insert on storage.objects;
create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.owns_boutique(((storage.foldername(name))[1])::uuid)
    and public.upload_ok());

-- ===== Остальные функции =====
-- Отметка «в сети»: вошедший — не чаще 30 раз в минуту (лишнее молча пропускаем);
-- гости — общий потолок 300 отметок в минуту на весь сайт, чтобы счётчик нельзя было накрутить бесконечно.
create or replace function public.touch_activity(guest_first_today boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    if guest_first_today and public.rate_ok('00000000-0000-0000-0000-000000000000', 'guest_visit', 300, 60) then
      insert into public.guest_visits (day, visits) values (public.msk_today(), 1)
      on conflict (day) do update set visits = public.guest_visits.visits + 1;
    end if;
    return;
  end if;
  if not public.rate_ok(uid, 'touch', 30, 60) then return; end if;
  update public.profiles set last_seen_at = now()
    where id = uid and not is_blocked and (last_seen_at is null or last_seen_at < now() - interval '2 minutes');
  insert into public.user_activity (user_id, day) values (uid, public.msk_today()) on conflict do nothing;
  if random() < 0.02 then delete from public.user_activity where day < public.msk_today() - 180; end if;
end $$;

create or replace function public.give_consent(version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  perform public.rate_limit('consent', 10, 3600);
  if version is null or char_length(version) not between 1 and 40 then raise exception 'Неверная версия документа'; end if;
  update public.profiles set consent_at = now(), consent_version = version where id = auth.uid();
end $$;

-- ===== Права =====
-- Счётчики вызываются только изнутри функций базы. Клиентам — только upload_ok (свой лимит, нужен правилу загрузки).
revoke all on function public.rate_ok(uuid, text, integer, integer), public.rate_limit(text, integer, integer),
  public.limit_writes(), public.wishlist_cap(), public.upload_ok() from public, anon, authenticated;
grant execute on function public.upload_ok() to authenticated;
