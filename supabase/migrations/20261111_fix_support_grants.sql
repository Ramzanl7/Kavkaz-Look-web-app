-- Исправление: в этой базе новые таблицы не получают права автоматически.
-- Читать контакты могут все, менять (только эти столбцы) — вошедшие, а RLS пускает только админа.
grant select on public.support_contacts to anon, authenticated;
grant update (telegram, whatsapp, phone, sms, email, hours, updated_at) on public.support_contacts to authenticated;

-- is_order_buyer используется только в правилах для вошедших — гостям не нужна.
-- (is_admin и owns_boutique гостям нужны: через них работают правила чтения каталога и бутиков.)
revoke execute on function public.is_order_buyer(uuid) from public, anon;
grant execute on function public.is_order_buyer(uuid) to authenticated;
