-- Удаление своего аккаунта (152-ФЗ: право на удаление персональных данных).
-- Аккаунт, профиль, избранное, отзывы и заявки удаляются полностью.
-- Заказы остаются у продавцов для учёта, но без связи с человеком (buyer_id = null).
alter table public.orders alter column buyer_id drop not null;

create or replace function public.delete_my_account(confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Нужно войти в аккаунт';
  end if;
  if confirm is distinct from 'УДАЛИТЬ' then
    raise exception 'Удаление не подтверждено';
  end if;
  if exists (select 1 from public.profiles where id = uid and role = 'admin') then
    raise exception 'Аккаунт администратора удаляется только вручную';
  end if;
  if exists (select 1 from public.boutiques where owner_id = uid) then
    raise exception 'У вас есть бутик. Напишите в поддержку, чтобы закрыть его и удалить аккаунт';
  end if;

  update public.orders set buyer_id = null where buyer_id = uid;
  delete from public.role_requests where user_id = uid;
  delete from public.partner_requests where user_id = uid;
  -- profiles, wishlist и reviews удалятся каскадом
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
