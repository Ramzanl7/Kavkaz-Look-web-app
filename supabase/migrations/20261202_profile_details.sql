-- Профиль: телефон, город, адрес (для быстрого оформления заказа) и аватарка.
-- Видит эти данные только сам пользователь (и админ — по общему правилу таблицы profiles).

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists avatar_path text;

do $$ begin
  alter table public.profiles add constraint profiles_phone_chk check (phone is null or phone ~ '^\+7[0-9]{10}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_city_chk check (city is null or char_length(city) between 2 and 40);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_address_chk check (address is null or char_length(address) between 5 and 200);
exception when duplicate_object then null; end $$;
-- аватарка только из своей папки: <id пользователя>/<имя>.jpg
do $$ begin
  alter table public.profiles add constraint profiles_avatar_chk check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,40}\.jpg$'));
exception when duplicate_object then null; end $$;

grant select (phone, city, address, avatar_path) on public.profiles to authenticated;
grant update (phone, city, address, avatar_path) on public.profiles to authenticated;

-- Хранилище аваток: закрытое, ссылки на просмотр выдаются на час
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 524288, allowed_mime_types = array['image/jpeg'];

drop policy if exists avatars_select on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.upload_ok());
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
