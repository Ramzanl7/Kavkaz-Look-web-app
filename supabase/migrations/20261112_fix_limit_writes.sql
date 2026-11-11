-- Исправление: limit_writes обращался к new.display_name для ЛЮБОЙ таблицы, а такое поле есть только в profiles
-- («record "new" has no field "display_name"»). Падали избранное, заявки, мерки, товары, push-подписки.
-- Поля читаются через to_jsonb и только для нужной таблицы.
create or replace function public.limit_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a text := tg_argv[0]; mx integer := tg_argv[1]::integer; win integer := tg_argv[2]::integer;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' then
    if tg_table_name = 'products' then
      if (to_jsonb(new) - 'rating_avg' - 'rating_count') = (to_jsonb(old) - 'rating_avg' - 'rating_count') then return new; end if;
    elsif tg_table_name = 'profiles' then
      if (to_jsonb(new) ->> 'display_name') is not distinct from (to_jsonb(old) ->> 'display_name') then return new; end if;
    end if;
  end if;
  perform public.rate_limit(a, mx, win);
  return coalesce(new, old);
end $$;
