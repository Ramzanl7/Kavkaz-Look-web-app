-- Push-уведомления на телефон (Web Push).
-- Ключи VAPID создаёт и хранит сама функция сервера (push) — секретный ключ никуда не передаётся.
-- Когда появляется уведомление, база просит функцию push отправить его на устройства человека.
create extension if not exists pg_net with schema extensions;

-- Ключи Web Push: таблица закрыта для всех, кроме сервера (service_role обходит RLS).
create table if not exists public.push_vapid (
  id smallint primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_vapid enable row level security;
revoke all on public.push_vapid from anon, authenticated;

-- Подписки устройств: человек видит и меняет только свои.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_subs_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subs_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_subs_remove on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.push_subscriptions to authenticated;
create trigger rl_push_subs before insert on public.push_subscriptions
  for each row execute function public.limit_writes('push_subscribe', '20', '3600');

alter table public.notifications add column if not exists pushed_at timestamptz;

-- Новое уведомление → просим функцию push отправить его (только если у человека есть подписанные устройства).
create or replace function public.on_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    perform net.http_post(
      url := 'https://llccglfpndsgjirycjhu.supabase.co/functions/v1/push',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  end if;
  return new;
end $$;
create trigger push_on_notification after insert on public.notifications for each row execute function public.on_notification_push();
revoke all on function public.on_notification_push() from public, anon, authenticated;

-- Только официальные push-сервисы (Apple, Google, Mozilla, Microsoft): нельзя подсунуть чужой адрес.
alter table public.push_subscriptions add constraint push_endpoint_known check (
  endpoint ~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
);
