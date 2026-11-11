-- Исправление: в rate_ok параметр action совпадал с именем столбца rate_limits.action,
-- и PostgreSQL отвечал «column reference "action" is ambiguous» — падали ВСЕ действия с лимитами
-- (согласие, заказы, отзывы, отметка «в сети»). Явно указываем, где параметр, а где столбец.
create or replace function public.rate_ok(key_user uuid, action text, max_hits integer, window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds); h integer;
begin
  if key_user is null then return true; end if;
  insert into public.rate_limits as rl (user_id, action, window_start, hits) values (key_user, rate_ok.action, w, 1)
  on conflict on constraint rate_limits_pkey do update set hits = rl.hits + 1
  returning rl.hits into h;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return h <= max_hits;
end $$;
