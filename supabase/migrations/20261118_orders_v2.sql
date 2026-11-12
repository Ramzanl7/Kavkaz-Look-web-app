-- Заказы v2: размер, контакт и способ получения, заказ на каждый бутик отдельно, остатки, несколько фото.

-- ---------- товары: до 6 фото и остатки по размерам ----------
alter table public.products add column if not exists images text[]
  check (images is null or (cardinality(images) <= 6 and array_to_string(images, ',') ~ '^[0-9a-f/,.-]*$'));
-- остатки: {"46": 2, "48": 0} по размерам или {"_": 5} без размеров; null — не ведутся
alter table public.products add column if not exists stock jsonb
  check (stock is null or (jsonb_typeof(stock) = 'object' and length(stock::text) <= 600));
grant insert (images, stock), update (images, stock) on public.products to authenticated;

-- ---------- заказ: бутик, контакт, получение ----------
alter table public.orders add column if not exists boutique_id uuid references public.boutiques(id) on delete set null;
alter table public.orders add column if not exists delivery text check (delivery in ('pickup', 'courier'));
alter table public.orders add column if not exists phone text check (phone is null or phone ~ '^\+?[0-9]{10,15}$');
alter table public.orders add column if not exists address text check (address is null or char_length(address) <= 200);
alter table public.orders add column if not exists comment text check (comment is null or char_length(comment) <= 300);
alter table public.orders add column if not exists payment text not null default 'on_delivery' check (payment in ('on_delivery'));
alter table public.order_items add column if not exists size text check (size is null or size ~ '^[0-9A-Za-z.,]{1,6}$');
create index if not exists orders_boutique_idx on public.orders (boutique_id);
create index if not exists order_items_order_idx on public.order_items (order_id);
drop index if exists public.orders_buyer_idem;
create unique index if not exists orders_buyer_idem_boutique on public.orders (buyer_id, idempotency_key, boutique_id) where idempotency_key is not null;

-- Оформление: корзина делится на заказы по бутикам; цена и наличие — только с сервера.
-- contact: {"phone": "+7...", "delivery": "pickup"|"courier", "address": "...", "comment": "..."}
create or replace function public.place_order(items jsonb, contact jsonb, idem uuid default null)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); ids uuid[] := '{}'; oid uuid; b record; r record; n integer; total integer;
  ph text; dl text; ad text; cm text; key text; have int;
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
  if dl is null or dl not in ('pickup', 'courier') then raise exception 'bad delivery'; end if;
  ad := nullif(btrim(left(coalesce(contact ->> 'address', ''), 200)), '');
  if dl = 'courier' and ad is null then raise exception 'address required'; end if;
  cm := nullif(btrim(left(coalesce(contact ->> 'comment', ''), 300)), '');
  -- позиции: товар должен продаваться; размер — из списка товара (если он есть)
  create temp table if not exists _kl_cart (pid uuid, size text, qty int, boutique uuid, title text, price int) on commit drop;
  truncate pg_temp._kl_cart;
  for r in select (e ->> 'product_id')::uuid pid, nullif(e ->> 'size', '') size, (e ->> 'qty')::int qty from jsonb_array_elements(items) e loop
    if r.qty is null or r.qty < 1 or r.qty > 99 then raise exception 'bad qty'; end if;
    insert into pg_temp._kl_cart select r.pid, r.size, r.qty, p.boutique_id, p.title, p.price_rub
      from public.products p join public.boutiques bq on bq.id = p.boutique_id
      where p.id = r.pid and p.is_published and bq.is_approved
        and (r.size is null and coalesce(cardinality(p.sizes), 0) = 0 or r.size = any (p.sizes));
    get diagnostics n = row_count;
    if n = 0 then raise exception 'product unavailable'; end if;
    -- остатки: проверка и списание (строка товара блокируется до конца транзакции)
    key := coalesce(r.size, '_');
    select (stock ->> key)::int into have from public.products where id = r.pid and stock ? key for update;
    if found and have is not null then
      if have < r.qty then raise exception 'out of stock'; end if;
      update public.products set stock = jsonb_set(stock, array[key], to_jsonb(have - r.qty)) where id = r.pid;
    end if;
  end loop;
  for b in select distinct boutique from pg_temp._kl_cart loop
    insert into public.orders (buyer_id, boutique_id, total_rub, idempotency_key, delivery, phone, address, comment)
      values (uid, b.boutique, 1, idem, dl, ph, case when dl = 'courier' then ad end, cm) returning id into oid;
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

-- Отмена возвращает остатки; после выполнения или отмены телефон и адрес покупателя удаляются (минимум данных)
create or replace function public.on_order_closed() returns trigger language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'cancelled' then
    for i in select product_id, coalesce(size, '_') k, qty from public.order_items where order_id = new.id loop
      update public.products set stock = jsonb_set(stock, array[i.k], to_jsonb((stock ->> i.k)::int + i.qty))
        where id = i.product_id and stock ? i.k and (stock ->> i.k) ~ '^[0-9]+$';
    end loop;
  end if;
  if new.status in ('done', 'cancelled') then new.phone := null; new.address := null; end if;
  return new;
end $$;
drop trigger if exists order_closed on public.orders;
create trigger order_closed before update of status on public.orders for each row execute function public.on_order_closed();

-- Отзыв — только после выполненного заказа
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
    where o.buyer_id = uid and i.product_id = pid and o.status = 'done'
  ) then raise exception 'purchase required'; end if;
  select coalesce(nullif(btrim(display_name), ''), 'Покупатель') into nm from public.profiles where id = uid;
  insert into public.reviews (product_id, user_id, author_name, rating, body)
    values (pid, uid, nm, stars, nullif(btrim(txt), ''))
  on conflict (product_id, user_id)
    do update set rating = excluded.rating, body = excluded.body, author_name = excluded.author_name, created_at = now();
end $$;
