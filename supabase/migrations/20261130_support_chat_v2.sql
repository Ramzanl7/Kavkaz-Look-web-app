-- Чат поддержки v2: фото в сообщениях, отметки «прочитано», текст можно не писать, если есть фото.

-- ===== Фото в сообщениях =====
alter table public.support_messages add column if not exists image_path text
  check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
alter table public.support_messages alter column body set default '';
alter table public.support_messages drop constraint if exists support_messages_body_check;
alter table public.support_messages add constraint support_messages_body_check
  check (char_length(body) <= 2000 and (char_length(body) >= 1 or image_path is not null));

-- ===== Прочитано =====
alter table public.support_threads add column if not exists user_read_at timestamptz;
alter table public.support_threads add column if not exists admin_read_at timestamptz;

-- Закрытое хранилище фото поддержки: файл в папке автора, видят автор, админ и собеседник по диалогу
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('support-media', 'support-media', false, 2097152, '{image/jpeg}')
  on conflict (id) do nothing;
drop policy if exists support_media_insert on storage.objects;
create policy support_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'support-media' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and public.upload_ok());
drop policy if exists support_media_select on storage.objects;
create policy support_media_select on storage.objects for select to authenticated
  using (bucket_id = 'support-media' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_admin())
    or exists (select 1 from public.support_messages m join public.support_threads t on t.id = m.thread_id
               where m.image_path = storage.objects.name and t.user_id = (select auth.uid()))));

-- ===== Отправка: текст и/или фото, необязательный заказ =====
drop function if exists public.support_send(text, uuid);
create or replace function public.support_send(body text, order_id uuid default null, image text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tid uuid; mid uuid; txt text := btrim(coalesce(body, '')); img text := nullif(image, ''); a record; who text; preview text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if char_length(txt) > 2000 or (char_length(txt) = 0 and img is null) then raise exception 'bad message'; end if;
  if img is not null and (img !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' or split_part(img, '/', 1) <> uid::text) then raise exception 'bad image'; end if;
  perform public.rate_limit('support_send', 30, 3600);
  if order_id is not null and not exists (
    select 1 from public.orders o where o.id = order_id
      and (o.buyer_id = uid or exists (select 1 from public.boutiques b where b.id = o.boutique_id and b.owner_id = uid))) then
    order_id := null;
  end if;
  insert into public.support_threads (user_id) values (uid)
    on conflict (user_id) do update set status = 'open'
    returning id into tid;
  insert into public.support_messages (thread_id, author, author_id, body, order_id, image_path) values (tid, 'user', uid, txt, order_id, img) returning id into mid;
  preview := coalesce(nullif(left(txt, 140), ''), '📷 Фото');
  update public.support_threads set admin_unread = admin_unread + 1, last_message_at = now(), last_preview = preview, status = 'open', user_read_at = now() where id = tid;
  select coalesce(nullif(p.display_name, ''), 'Пользователь') || case when p.role = 'seller' then ' (продавец)' else '' end into who from public.profiles p where p.id = uid;
  for a in select id from public.profiles where role = 'admin' and not is_blocked and id <> uid loop
    perform public.notify(a.id, 'support_msg', mid, 'Поддержка: ' || coalesce(who, 'Пользователь'), left(preview, 200), '/admin/s/support/' || tid);
  end loop;
  return tid;
end $$;
revoke all on function public.support_send(text, uuid, text) from public, anon;
grant execute on function public.support_send(text, uuid, text) to authenticated;

drop function if exists public.support_reply(uuid, text);
create or replace function public.support_reply(thread uuid, body text, image text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.support_threads; mid uuid; txt text := btrim(coalesce(body, '')); img text := nullif(image, ''); preview text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if char_length(txt) > 2000 or (char_length(txt) = 0 and img is null) then raise exception 'bad message'; end if;
  if img is not null and (img !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' or split_part(img, '/', 1) <> auth.uid()::text) then raise exception 'bad image'; end if;
  select * into t from public.support_threads where id = thread;
  if not found then raise exception 'thread not found'; end if;
  insert into public.support_messages (thread_id, author, author_id, body, image_path) values (thread, 'admin', auth.uid(), txt, img) returning id into mid;
  preview := coalesce(nullif(left(txt, 140), ''), '📷 Фото');
  update public.support_threads set user_unread = user_unread + 1, admin_unread = 0, admin_read_at = now(), last_message_at = now(), last_preview = preview where id = thread;
  perform public.notify(t.user_id, 'support_reply', mid, 'Ответ поддержки', left(preview, 200), '/support/chat');
end $$;
revoke all on function public.support_reply(uuid, text, text) from public, anon;
grant execute on function public.support_reply(uuid, text, text) to authenticated;

-- Прочитано: пользователь — свой диалог, админ — любой (время прочтения — для отметок ✓✓)
create or replace function public.support_read(thread uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if thread is null then
    update public.support_threads set user_unread = 0, user_read_at = now() where user_id = auth.uid();
  elsif public.is_admin() then
    update public.support_threads set admin_unread = 0, admin_read_at = now() where id = thread;
  end if;
end $$;
revoke all on function public.support_read(uuid) from public, anon;
grant execute on function public.support_read(uuid) to authenticated;

-- Заказы человека — админу в карточке диалога
create or replace function public.admin_user_orders(uid uuid) returns table (id uuid, status text, total_rub int, created_at timestamptz, delivery text, boutique text, items text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select o.id, o.status::text, o.total_rub, o.created_at, o.delivery, b.name,
      (select string_agg(i.title || coalesce(', ' || i.size, '') || ' × ' || i.qty, '; ') from public.order_items i where i.order_id = o.id)
    from public.orders o left join public.boutiques b on b.id = o.boutique_id
    where o.buyer_id = uid or o.boutique_id in (select bb.id from public.boutiques bb where bb.owner_id = uid)
    order by o.created_at desc limit 20;
end $$;
revoke all on function public.admin_user_orders(uuid) from public, anon;
grant execute on function public.admin_user_orders(uuid) to authenticated;
