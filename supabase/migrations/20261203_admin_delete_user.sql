-- Админ удаляет пользователя: аккаунт, профиль, избранное, отзывы, мерки, уведомления, чат поддержки (каскадом).
-- Заказы остаются у продавцов — без привязки к человеку. Админов и владельцев бутиков удалить нельзя.
create or replace function public.admin_delete_user(target uuid, confirm text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if confirm is distinct from 'УДАЛИТЬ' then raise exception 'Удаление не подтверждено'; end if;
  if target is null or target = auth.uid() then raise exception 'Нельзя удалить самого себя'; end if;
  if not exists (select 1 from auth.users where id = target) then raise exception 'Пользователь не найден'; end if;
  if exists (select 1 from public.profiles where id = target and role = 'admin') then
    raise exception 'Администратора удалить нельзя';
  end if;
  if exists (select 1 from public.boutiques where owner_id = target) then
    raise exception 'У пользователя есть бутик. Сначала закройте бутик или передайте его другому владельцу';
  end if;
  update public.orders set buyer_id = null where buyer_id = target;
  delete from public.role_requests where user_id = target;
  delete from public.partner_requests where user_id = target;
  delete from auth.users where id = target;
end $$;
revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- Админ может удалить фото профиля удаляемого пользователя
drop policy if exists avatars_admin_select on storage.objects;
drop policy if exists avatars_admin_delete on storage.objects;
create policy avatars_admin_select on storage.objects for select to authenticated using (bucket_id = 'avatars' and public.is_admin());
create policy avatars_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and public.is_admin());
