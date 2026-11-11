-- Лимит ИИ-стилиста: 10 запросов в час и 30 в день на человека.
-- Вызывает функция сервера stylist от имени самого пользователя (его токен), поэтому чужой лимит не потратить.
create or replace function public.stylist_quota()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  perform public.rate_limit('stylist_hour', 10, 3600);
  perform public.rate_limit('stylist_day', 30, 86400);
end $$;
revoke all on function public.stylist_quota() from public, anon;
grant execute on function public.stylist_quota() to authenticated;
