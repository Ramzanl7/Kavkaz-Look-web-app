-- Усиление защиты по аудиту безопасности Supabase
-- 1) Старая функция оформления заказа: приложение её не использует, а через неё можно было обойти
--    лимиты доверия, запрет при долге и проверку способа оплаты. Закрываем.
revoke execute on function public.create_order(jsonb, uuid) from public, anon, authenticated;

-- 2) Служебные функции — только для базы, не для вызова из приложения
revoke execute on function public.expire_reservations() from public, anon, authenticated;
revoke execute on function public.promo_used(uuid, uuid) from public, anon, authenticated;

-- 3) Функции триггеров вызываются только самой базой — прямой вызов из приложения не нужен
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
