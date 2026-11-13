-- Обезличенная статистика посещений: храним только числа.
-- Чтобы не считать одного человека дважды за день, вместо номера пользователя пишем шифр (md5 от номера и ключа дня).
-- Ключ дня меняется каждые сутки, старый удаляется — после этого узнать, кто заходил, невозможно.

create table if not exists public.activity_salt (day date primary key, salt text not null);
create table if not exists public.activity_pings (
  day date not null,
  h text not null,
  seen_at timestamptz not null default now(),
  primary key (day, h)
);
create index if not exists activity_pings_seen_idx on public.activity_pings (seen_at);
create table if not exists public.activity_daily (day date primary key, users int not null default 0);
alter table public.activity_salt enable row level security;
alter table public.activity_pings enable row level security;
alter table public.activity_daily enable row level security;
revoke all on public.activity_salt, public.activity_pings, public.activity_daily from anon, authenticated;

-- Старая история: переводим в числа по дням…
insert into public.activity_daily (day, users)
  select day, count(*) from public.user_activity group by day
  on conflict (day) do update set users = greatest(public.activity_daily.users, excluded.users);
-- …и удаляем, кто когда заходил
delete from public.user_activity;
update public.profiles set last_seen_at = null where last_seen_at is not null;

-- Отметка «я в приложении»: без привязки к человеку
create or replace function public.touch_activity(guest_first_today boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t date := public.msk_today(); s text; hh text; fresh boolean;
begin
  if uid is null then
    if guest_first_today and public.rate_ok('00000000-0000-0000-0000-000000000000', 'guest_visit', 300, 60) then
      insert into public.guest_visits (day, visits) values (t, 1)
      on conflict (day) do update set visits = public.guest_visits.visits + 1;
    end if;
    return;
  end if;
  if not public.rate_ok(uid, 'touch', 30, 60) then return; end if;
  insert into public.activity_salt (day, salt) values (t, md5(random()::text || clock_timestamp()::text || random()::text))
    on conflict (day) do nothing;
  select salt into s from public.activity_salt where day = t;
  hh := md5(uid::text || s);
  insert into public.activity_pings (day, h) values (t, hh) on conflict (day, h) do nothing returning true into fresh;
  if fresh then
    insert into public.activity_daily (day, users) values (t, 1) on conflict (day) do update set users = public.activity_daily.users + 1;
  else
    update public.activity_pings set seen_at = now() where day = t and h = hh and seen_at < now() - interval '1 minute';
  end if;
  -- ключи и шифры прошлых дней удаляем — связь с людьми теряется навсегда
  if random() < 0.05 then
    delete from public.activity_salt where day < t;
    delete from public.activity_pings where day < t;
  end if;
end $$;
revoke all on function public.touch_activity(boolean) from public;
grant execute on function public.touch_activity(boolean) to anon, authenticated;

-- Статистика для админа: только числа
create or replace function public.admin_stats(days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d integer := least(greatest(coalesce(days, 30), 7), 180); t date := public.msk_today();
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_7d', (select count(*) from public.profiles where (created_at at time zone 'Europe/Moscow')::date > t - 7),
    'online_now', (select count(*) from public.activity_pings where day = t and seen_at > now() - interval '5 minutes'),
    'active_today', coalesce((select users from public.activity_daily where day = t), 0),
    'avg_7d', coalesce((select round(avg(users)) from public.activity_daily where day > t - 7 and day <= t), 0),
    'guests_today', coalesce((select visits from public.guest_visits where day = t), 0),
    'blocked', (select count(*) from public.profiles where is_blocked),
    'no_consent', (select count(*) from public.profiles where consent_at is null),
    'series', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'users', coalesce((select users from public.activity_daily a where a.day = g.day), 0),
        'guests', coalesce((select visits from public.guest_visits v where v.day = g.day), 0),
        'signups', (select count(*) from public.profiles p where (p.created_at at time zone 'Europe/Moscow')::date = g.day)
      ) order by g.day)
      from (select generate_series((t - (d - 1))::timestamp, t::timestamp, interval '1 day')::date as day) g
    )
  );
end $$;

-- Список пользователей: без «последнего визита» и «дней активности» (поля оставлены пустыми для совместимости)
create or replace function public.admin_list_users(search text default '', lim integer default 50, off integer default 0)
returns table(id uuid, email text, display_name text, role public.user_role, is_blocked boolean, blocked_reason text, blocked_at timestamptz,
  created_at timestamptz, last_seen_at timestamptz, consent_at timestamptz, days_30 integer, total bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare q text := '%' || replace(replace(replace(left(coalesce(search, ''), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select p.id, u.email::text, p.display_name, p.role, p.is_blocked, p.blocked_reason, p.blocked_at, p.created_at,
      null::timestamptz, p.consent_at, null::integer, count(*) over ()
    from public.profiles p join auth.users u on u.id = p.id
    where u.email ilike q or coalesce(p.display_name, '') ilike q
    order by p.created_at desc
    limit least(greatest(coalesce(lim, 50), 1), 100) offset greatest(coalesce(off, 0), 0);
end $$;

-- Дни посещений конкретного человека больше не хранятся
revoke execute on function public.admin_user_days(uuid) from public, anon, authenticated;
