-- Промокоды (бутика и площадки) и приглашения друзей.

-- ---------- промокоды ----------
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z0-9]{4,20}$'),
  boutique_id uuid references public.boutiques(id) on delete cascade, -- null = промокод площадки
  title text check (title is null or char_length(title) <= 80),
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check ((kind = 'percent' and value between 1 and 90) or (kind = 'fixed' and value between 1 and 100000)),
  min_order integer not null default 0 check (min_order between 0 and 10000000),
  max_discount integer check (max_discount is null or max_discount between 1 and 1000000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  usage_limit integer check (usage_limit is null or usage_limit between 1 and 1000000),
  per_user integer not null default 1 check (per_user between 1 and 100),
  first_order_only boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists promo_codes_code_uniq on public.promo_codes (code);
create index if not exists promo_codes_boutique_idx on public.promo_codes (boutique_id);
alter table public.promo_codes enable row level security;
-- список кодов видят только их владельцы (бутик — свои, админ — все); покупатель проверяет код через функцию
create policy promo_codes_select on public.promo_codes for select using (public.is_admin() or (boutique_id is not null and public.owns_boutique(boutique_id)));
create policy promo_codes_insert on public.promo_codes for insert with check ((boutique_id is null and public.is_admin()) or (boutique_id is not null and public.owns_boutique(boutique_id)));
create policy promo_codes_update on public.promo_codes for update using (public.is_admin() or (boutique_id is not null and public.owns_boutique(boutique_id)))
  with check ((boutique_id is null and public.is_admin()) or (boutique_id is not null and public.owns_boutique(boutique_id)));
create policy promo_codes_delete on public.promo_codes for delete using (public.is_admin() or (boutique_id is not null and public.owns_boutique(boutique_id)));
grant select, delete on public.promo_codes to authenticated;
grant insert (code, boutique_id, title, kind, value, min_order, max_discount, starts_at, ends_at, usage_limit, per_user, first_order_only, is_active) on public.promo_codes to authenticated;
grant update (title, kind, value, min_order, max_discount, starts_at, ends_at, usage_limit, per_user, first_order_only, is_active) on public.promo_codes to authenticated;
drop trigger if exists rl_promo on public.promo_codes;
create trigger rl_promo before insert or update on public.promo_codes for each row execute function public.limit_writes('promo_edit', 30, 60);

-- использования: одно на оформление (может включать несколько заказов разных бутиков)
create table if not exists public.promo_uses (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promo_codes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_ids uuid[] not null,
  created_at timestamptz not null default now()
);
create index if not exists promo_uses_promo_idx on public.promo_uses (promo_id, user_id);
alter table public.promo_uses enable row level security; -- читают только функции

alter table public.orders add column if not exists promo_id uuid references public.promo_codes(id) on delete set null;
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists subtotal_rub integer;
alter table public.orders add column if not exists discount_rub integer not null default 0 check (discount_rub >= 0);
alter table public.orders add column if not exists discount_by text check (discount_by in ('boutique', 'platform'));

-- действующие использования (без полностью отменённых оформлений)
create or replace function public.promo_used(pid uuid, uid uuid default null) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.promo_uses u
  where u.promo_id = pid and (uid is null or u.user_id = uid)
    and exists (select 1 from public.orders o where o.id = any (u.order_ids) and o.status <> 'cancelled');
$$;
revoke all on function public.promo_used(uuid, uuid) from public, anon;

-- Проверка кода и расчёт скидки. items — как в place_order. Возвращает {ok, discount, boutique_id, by, title} или {ok:false, error}
create or replace function public.promo_quote(code text, items jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p public.promo_codes; sub integer; d integer; e jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'login'); end if;
  select * into p from public.promo_codes c where c.code = upper(btrim(coalesce(promo_quote.code, '')));
  if not found or not p.is_active or p.starts_at > now() or (p.ends_at is not null and p.ends_at <= now()) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- сумма подходящих позиций: для кода бутика — только его товары
  select coalesce(sum(pr.price_rub * greatest(1, least(99, (e2 ->> 'qty')::int))), 0) into sub
  from jsonb_array_elements(case when jsonb_typeof(items) = 'array' then items else '[]' end) e2
  join public.products pr on pr.id = (e2 ->> 'product_id')::uuid and pr.is_published and pr.moderation = 'ok'
  where p.boutique_id is null or pr.boutique_id = p.boutique_id;
  if sub = 0 then return jsonb_build_object('ok', false, 'error', 'not_applicable'); end if;
  if sub < p.min_order then return jsonb_build_object('ok', false, 'error', 'min_order', 'min_order', p.min_order); end if;
  if p.usage_limit is not null and public.promo_used(p.id) >= p.usage_limit then return jsonb_build_object('ok', false, 'error', 'exhausted'); end if;
  if public.promo_used(p.id, uid) >= p.per_user then return jsonb_build_object('ok', false, 'error', 'used'); end if;
  if p.first_order_only and exists (select 1 from public.orders o where o.buyer_id = uid and o.status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'first_order');
  end if;
  d := case when p.kind = 'percent' then floor(sub * p.value / 100.0)::int else p.value end;
  if p.max_discount is not null then d := least(d, p.max_discount); end if;
  d := least(d, sub - 1); -- заказ не может стать бесплатным
  return jsonb_build_object('ok', true, 'discount', d, 'subtotal', sub, 'promo_id', p.id, 'code', p.code,
    'boutique_id', p.boutique_id, 'by', case when p.boutique_id is null then 'platform' else 'boutique' end,
    'title', p.title, 'kind', p.kind, 'value', p.value);
end $$;
revoke all on function public.promo_quote(text, jsonb) from public, anon;
grant execute on function public.promo_quote(text, jsonb) to authenticated;

-- Оформление: + промокод (contact.promo). Скидка бутика — на его заказ; скидка площадки — делится между заказами пропорционально сумме.
create or replace function public.place_order(items jsonb, contact jsonb, idem uuid default null)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); ids uuid[] := '{}'; oid uuid; b record; r record; n integer; total integer;
  ph text; dl text; ad text; cm text; key text; have int; hold timestamptz; shops int; qsum int;
  q jsonb; promo uuid; pcode text; pby text; pshop uuid; disc int := 0; left_disc int; base int; sub int; part int; k int := 0; cnt int;
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
    hold := ((public.msk_today() + case when contact ->> 'day' = 'tomorrow' then 1 else 0 end)::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Moscow';
    if (select count(*) from public.orders where buyer_id = uid and delivery = 'reserve' and status in ('new', 'confirmed') and hold_until > now()) >= 3 then
      raise exception 'reserve limit';
    end if;
  end if;
  -- промокод проверяем до списания остатков
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
  -- распределение скидки площадки: пропорционально, остаток — последнему заказу
  select count(distinct boutique), sum(price * qty) into cnt, base from pg_temp._kl_cart;
  left_disc := disc;
  for b in select boutique, sum(price * qty) s from pg_temp._kl_cart group by boutique order by sum(price * qty) loop
    k := k + 1;
    part := 0;
    if promo is not null then
      if pby = 'boutique' then part := case when b.boutique = pshop then disc else 0 end;
      else part := case when k = cnt then left_disc else floor(disc::numeric * b.s / base)::int end; left_disc := left_disc - part;
      end if;
      part := least(part, b.s - 1);
    end if;
    insert into public.orders (buyer_id, boutique_id, total_rub, idempotency_key, delivery, phone, address, comment, hold_until,
      subtotal_rub, discount_rub, promo_id, promo_code, discount_by)
      values (uid, b.boutique, 1, idem, dl, ph, case when dl = 'courier' then ad end, cm, hold,
        b.s, part, case when part > 0 then promo end, case when part > 0 then pcode end, case when part > 0 then pby end) returning id into oid;
    insert into public.order_items (order_id, product_id, boutique_id, title, price_rub, qty, size)
      select oid, pid, boutique, title, price, qty, size from pg_temp._kl_cart where boutique = b.boutique;
    select sum(price_rub * qty) into total from public.order_items where order_id = oid;
    update public.orders set total_rub = total - part, subtotal_rub = total where id = oid;
    ids := ids || oid;
  end loop;
  if promo is not null then insert into public.promo_uses (promo_id, user_id, order_ids) values (promo, uid, ids); end if;
  return ids;
end $$;
revoke all on function public.place_order(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, uuid) to authenticated;

-- сколько раз использован код (для кабинета продавца и админки)
create or replace function public.promo_stats(pid uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare bid uuid;
begin
  select boutique_id into bid from public.promo_codes where id = pid;
  if not (public.is_admin() or (bid is not null and public.owns_boutique(bid))) then raise exception 'forbidden'; end if;
  return jsonb_build_object('uses', public.promo_used(pid),
    'discount', coalesce((select sum(discount_rub) from public.orders where promo_id = pid and status <> 'cancelled'), 0),
    'revenue', coalesce((select sum(total_rub) from public.orders where promo_id = pid and status = 'done'), 0));
end $$;
revoke all on function public.promo_stats(uuid) from public, anon;
grant execute on function public.promo_stats(uuid) to authenticated;

-- ---------- приглашения друзей (без денежных наград; лидеры — для розыгрыша призов) ----------
alter table public.profiles add column if not exists referral_code text check (referral_code is null or referral_code ~ '^[A-Z0-9]{6,10}$');
create unique index if not exists profiles_referral_code_uniq on public.profiles (referral_code) where referral_code is not null;
create table if not exists public.referrals (
  invitee_id uuid primary key references public.profiles(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (invitee_id <> inviter_id)
);
create index if not exists referrals_inviter_idx on public.referrals (inviter_id);
alter table public.referrals enable row level security; -- читают только функции

-- мой код приглашения (создаётся при первом запросе)
create or replace function public.my_referral_code() returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c text; tries int := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select referral_code into c from public.profiles where id = uid;
  while c is null and tries < 10 loop
    tries := tries + 1;
    c := upper(substr(translate(md5(random()::text || clock_timestamp()::text || uid::text), '01', ''), 1, 7));
    if length(c) < 6 or exists (select 1 from public.profiles where referral_code = c) then c := null; continue; end if;
    update public.profiles set referral_code = c where id = uid;
  end loop;
  return c;
end $$;
revoke all on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

-- новый пользователь (аккаунту не больше 7 дней) записывается за пригласившим; один раз, не сам себя
create or replace function public.claim_referral(code text) returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); inv uuid;
begin
  if uid is null then return false; end if;
  if exists (select 1 from public.referrals where invitee_id = uid) then return false; end if;
  if not exists (select 1 from public.profiles where id = uid and created_at > now() - interval '7 days') then return false; end if;
  select id into inv from public.profiles where referral_code = upper(btrim(coalesce(code, ''))) and not is_blocked;
  if inv is null or inv = uid then return false; end if;
  perform public.rate_limit('referral_claim', 5, 3600);
  insert into public.referrals (invitee_id, inviter_id) values (uid, inv) on conflict do nothing;
  perform public.notify(inv, 'referral_joined', uid, 'По вашей ссылке присоединился друг', 'Когда он сделает первую покупку, приглашение засчитается в розыгрыше.', '/invite');
  return true;
end $$;
revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- мои приглашения: всего и с покупкой (выполненный заказ)
create or replace function public.my_referrals() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('invited', count(*),
    'qualified', count(*) filter (where exists (select 1 from public.orders o where o.buyer_id = r.invitee_id and o.status = 'done')))
  from public.referrals r where r.inviter_id = auth.uid();
$$;
revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- лидеры приглашений (для розыгрыша призов): только админ
create or replace function public.admin_referral_top(lim integer default 50) returns table(user_id uuid, name text, email text, invited bigint, qualified bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, p.display_name, u.email::text, count(r.*),
      count(r.*) filter (where exists (select 1 from public.orders o where o.buyer_id = r.invitee_id and o.status = 'done'))
    from public.referrals r join public.profiles p on p.id = r.inviter_id left join auth.users u on u.id = p.id
    group by p.id, p.display_name, u.email
    order by 5 desc, 4 desc
    limit greatest(1, least(lim, 200));
end $$;
revoke all on function public.admin_referral_top(integer) from public, anon;
grant execute on function public.admin_referral_top(integer) to authenticated;
