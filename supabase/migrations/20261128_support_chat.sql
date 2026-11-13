-- Поддержка внутри приложения: у каждого пользователя один диалог с поддержкой.
-- Писать можно только через функции (проверки, ограничение частоты, уведомления).

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  user_unread int not null default 0,
  admin_unread int not null default 0,
  last_message_at timestamptz not null default now(),
  last_preview text check (last_preview is null or char_length(last_preview) <= 140),
  created_at timestamptz not null default now()
);
create index if not exists support_threads_admin_idx on public.support_threads (status, last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  author text not null check (author in ('user', 'admin')),
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_thread_idx on public.support_messages (thread_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
drop policy if exists support_threads_select on public.support_threads;
create policy support_threads_select on public.support_threads for select
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages for select
  using ((select public.is_admin()) or exists (select 1 from public.support_threads t where t.id = thread_id and t.user_id = (select auth.uid())));
revoke all on public.support_threads, public.support_messages from anon, authenticated;
grant select on public.support_threads, public.support_messages to authenticated;

-- Пользователь (покупатель или продавец) пишет в поддержку. order_id — необязательный прикреплённый заказ.
create or replace function public.support_send(body text, order_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tid uuid; mid uuid; txt text := btrim(coalesce(body, '')); a record; who text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if char_length(txt) < 1 or char_length(txt) > 2000 then raise exception 'bad message'; end if;
  perform public.rate_limit('support_send', 20, 3600);
  -- прикрепить можно только свой заказ (как покупатель) или заказ своего бутика
  if order_id is not null and not exists (
    select 1 from public.orders o where o.id = order_id
      and (o.buyer_id = uid or exists (select 1 from public.boutiques b where b.id = o.boutique_id and b.owner_id = uid))) then
    order_id := null;
  end if;
  insert into public.support_threads (user_id) values (uid)
    on conflict (user_id) do update set status = 'open'
    returning id into tid;
  insert into public.support_messages (thread_id, author, author_id, body, order_id) values (tid, 'user', uid, txt, order_id) returning id into mid;
  update public.support_threads set admin_unread = admin_unread + 1, last_message_at = now(), last_preview = left(txt, 140), status = 'open' where id = tid;
  select coalesce(nullif(p.display_name, ''), 'Пользователь') || case when p.role = 'seller' then ' (продавец)' else '' end into who from public.profiles p where p.id = uid;
  for a in select id from public.profiles where role = 'admin' and not is_blocked and id <> uid loop
    perform public.notify(a.id, 'support_msg', mid, 'Поддержка: ' || coalesce(who, 'Пользователь'), left(txt, 200), '/admin/s/support');
  end loop;
  return tid;
end $$;
revoke all on function public.support_send(text, uuid) from public, anon;
grant execute on function public.support_send(text, uuid) to authenticated;

-- Админ отвечает в диалог
create or replace function public.support_reply(thread uuid, body text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.support_threads; mid uuid; txt text := btrim(coalesce(body, ''));
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if char_length(txt) < 1 or char_length(txt) > 2000 then raise exception 'bad message'; end if;
  select * into t from public.support_threads where id = thread;
  if not found then raise exception 'thread not found'; end if;
  insert into public.support_messages (thread_id, author, author_id, body) values (thread, 'admin', auth.uid(), txt) returning id into mid;
  update public.support_threads set user_unread = user_unread + 1, admin_unread = 0, last_message_at = now(), last_preview = left(txt, 140) where id = thread;
  perform public.notify(t.user_id, 'support_reply', mid, 'Ответ поддержки', left(txt, 200), '/support/chat');
end $$;
revoke all on function public.support_reply(uuid, text) from public, anon;
grant execute on function public.support_reply(uuid, text) to authenticated;

-- Отметить прочитанным: пользователь — свой диалог, админ — любой
create or replace function public.support_read(thread uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if thread is null then
    update public.support_threads set user_unread = 0 where user_id = auth.uid() and user_unread > 0;
  elsif public.is_admin() then
    update public.support_threads set admin_unread = 0 where id = thread and admin_unread > 0;
  end if;
end $$;
revoke all on function public.support_read(uuid) from public, anon;
grant execute on function public.support_read(uuid) to authenticated;

-- Админ: закрыть или снова открыть диалог
create or replace function public.support_set_status(thread uuid, closed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.support_threads set status = case when closed then 'closed' else 'open' end, admin_unread = case when closed then 0 else admin_unread end where id = thread;
end $$;
revoke all on function public.support_set_status(uuid, boolean) from public, anon;
grant execute on function public.support_set_status(uuid, boolean) to authenticated;

-- Админ: список диалогов с данными о человеке
create or replace function public.admin_support_threads() returns table (
  id uuid, user_id uuid, status text, admin_unread int, last_message_at timestamptz, last_preview text,
  name text, email text, role text, boutique text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select t.id, t.user_id, t.status, t.admin_unread, t.last_message_at, t.last_preview,
      p.display_name, u.email::text, p.role::text, (select b.name from public.boutiques b where b.owner_id = t.user_id limit 1)
    from public.support_threads t left join public.profiles p on p.id = t.user_id left join auth.users u on u.id = t.user_id
    order by (t.status = 'open') desc, t.admin_unread > 0 desc, t.last_message_at desc
    limit 300;
end $$;
revoke all on function public.admin_support_threads() from public, anon;
grant execute on function public.admin_support_threads() to authenticated;

-- Счётчики на кнопках админки
create or replace function public.admin_counters() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'support', (select count(*) from public.support_threads where status = 'open' and admin_unread > 0),
    'requests', (select count(*) from public.boutique_leads where status = 'new')
      + (select count(*) from public.role_requests where status = 'pending')
      + (select count(*) from public.partner_requests where status = 'pending'),
    'unpaid', (select count(*) from public.orders where unpaid_at is not null and unpaid_resolved_at is null),
    'reports', (select count(*) from public.reports where status = 'open'),
    'orders', (select count(*) from public.orders where status = 'new'),
    'boutiques', (select count(*) from public.boutiques where not is_approved));
end $$;
revoke all on function public.admin_counters() from public, anon;
grant execute on function public.admin_counters() to authenticated;
