-- Согласие на обработку ПДн, учёт посещений (минимальный), статистика для админа, настоящий бан.
-- Дни считаются по московскому времени (Грозный = МСК).

-- ===== Профиль: новые поля (клиент напрямую их не меняет — только через функции ниже) =====
alter table public.profiles
  add column consent_at timestamptz,
  add column consent_version text check (char_length(consent_version) <= 40),
  add column last_seen_at timestamptz,
  add column blocked_reason text check (char_length(blocked_reason) <= 200),
  add column blocked_at timestamptz;

-- ===== Активность: только «в какой день пользователь заходил». Гости — одно число в день, без следа, кто они. =====
create table public.user_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
create table public.guest_visits (
  day date primary key,
  visits integer not null default 0 check (visits >= 0)
);
alter table public.user_activity enable row level security;
alter table public.guest_visits enable row level security;
-- Политик и прав для клиентов нет намеренно: читать и писать можно только через функции ниже.

create or replace function public.msk_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Europe/Moscow')::date $$;

-- ===== Согласие =====
create or replace function public.give_consent(version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  if version is null or char_length(version) not between 1 and 40 then raise exception 'Неверная версия документа'; end if;
  update public.profiles set consent_at = now(), consent_version = version where id = auth.uid();
end $$;

-- Согласие, данное галочкой при регистрации, переносится в профиль.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text := left(new.raw_user_meta_data ->> 'consent_version', 40);
begin
  insert into public.profiles (id, consent_at, consent_version)
  values (new.id, case when v is not null and v <> '' then now() end, nullif(v, ''));
  return new;
end $$;

-- ===== Отметка «был в сети» =====
-- Вошедший: обновляем время (не чаще раза в 2 минуты) и отмечаем день. Гость: +1 к счётчику дня.
create or replace function public.touch_activity(guest_first_today boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    if guest_first_today then
      insert into public.guest_visits (day, visits) values (public.msk_today(), 1)
      on conflict (day) do update set visits = public.guest_visits.visits + 1;
    end if;
    return;
  end if;
  update public.profiles set last_seen_at = now()
    where id = uid and not is_blocked and (last_seen_at is null or last_seen_at < now() - interval '2 minutes');
  insert into public.user_activity (user_id, day) values (uid, public.msk_today()) on conflict do nothing;
  -- Храним дни посещений не дольше 180 дней (обещано в политике).
  delete from public.user_activity where day < public.msk_today() - 180;
end $$;

-- ===== Статистика для админа =====
create or replace function public.admin_stats(days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d integer := least(greatest(coalesce(days, 30), 7), 180); t date := public.msk_today();
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_7d', (select count(*) from public.profiles where (created_at at time zone 'Europe/Moscow')::date > t - 7),
    'online_now', (select count(*) from public.profiles where last_seen_at > now() - interval '5 minutes'),
    'active_today', (select count(*) from public.user_activity where day = t),
    'active_7d', (select count(distinct user_id) from public.user_activity where day > t - 7),
    'active_30d', (select count(distinct user_id) from public.user_activity where day > t - 30),
    'guests_today', coalesce((select visits from public.guest_visits where day = t), 0),
    'blocked', (select count(*) from public.profiles where is_blocked),
    'no_consent', (select count(*) from public.profiles where consent_at is null),
    'series', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'users', (select count(*) from public.user_activity a where a.day = g.day),
        'guests', coalesce((select visits from public.guest_visits v where v.day = g.day), 0),
        'signups', (select count(*) from public.profiles p where (p.created_at at time zone 'Europe/Moscow')::date = g.day)
      ) order by g.day)
      from (select generate_series((t - (d - 1))::timestamp, t::timestamp, interval '1 day')::date as day) g
    )
  );
end $$;

create or replace function public.admin_list_users(search text default '', lim integer default 50, off integer default 0)
returns table (id uuid, email text, display_name text, role public.user_role, is_blocked boolean, blocked_reason text,
  blocked_at timestamptz, created_at timestamptz, last_seen_at timestamptz, consent_at timestamptz, days_30 integer, total bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare q text := '%' || replace(replace(replace(left(coalesce(search, ''), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, u.email::text, p.display_name, p.role, p.is_blocked, p.blocked_reason, p.blocked_at, p.created_at,
      p.last_seen_at, p.consent_at,
      (select count(*)::integer from public.user_activity a where a.user_id = p.id and a.day > public.msk_today() - 30),
      count(*) over ()
    from public.profiles p join auth.users u on u.id = p.id
    where u.email ilike q or coalesce(p.display_name, '') ilike q
    order by p.last_seen_at desc nulls last, p.created_at desc
    limit least(greatest(coalesce(lim, 50), 1), 100) offset greatest(coalesce(off, 0), 0);
end $$;

create or replace function public.admin_user_days(target uuid)
returns setof date language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query select a.day from public.user_activity a where a.user_id = target and a.day > public.msk_today() - 90 order by a.day desc;
end $$;

-- ===== Бан: пометка + запрет входа в Auth + выход со всех устройств =====
drop function if exists public.admin_set_blocked(uuid, boolean);
create function public.admin_set_blocked(target uuid, blocked boolean, reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if target = auth.uid() then raise exception 'Нельзя заблокировать самого себя'; end if;
  if blocked and exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception 'Администратора заблокировать нельзя';
  end if;
  update public.profiles
    set is_blocked = blocked,
        blocked_reason = case when blocked then nullif(left(btrim(coalesce(reason, '')), 200), '') end,
        blocked_at = case when blocked then now() end
    where id = target;
  if not found then raise exception 'Пользователь не найден'; end if;
  update auth.users set banned_until = case when blocked then 'infinity'::timestamptz end where id = target;
  if blocked then
    delete from auth.sessions where user_id = target; -- refresh-токены удаляются каскадом
  end if;
end $$;

-- Причину видит сам заблокированный (пока его старый ключ ещё действует, до часа).
create or replace function public.my_block_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('blocked', p.is_blocked, 'reason', p.blocked_reason) from public.profiles p where p.id = auth.uid()
$$;

-- ===== Права =====
revoke all on function public.give_consent(text), public.touch_activity(boolean), public.admin_stats(integer),
  public.admin_list_users(text, integer, integer), public.admin_user_days(uuid), public.admin_set_blocked(uuid, boolean, text),
  public.my_block_status(), public.msk_today() from public, anon, authenticated;
grant execute on function public.touch_activity(boolean) to anon, authenticated;
grant execute on function public.give_consent(text), public.admin_stats(integer), public.admin_list_users(text, integer, integer),
  public.admin_user_days(uuid), public.admin_set_blocked(uuid, boolean, text), public.my_block_status() to authenticated;
-- consent_at нужен клиенту, чтобы решить, показывать ли экран согласия.
grant select (consent_at, consent_version) on public.profiles to authenticated;
