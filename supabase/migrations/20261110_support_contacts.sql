-- Контакты поддержки: одна строка настроек. Читать могут все, менять — только админ.
-- Пустое значение = канал не показывается пользователям.
create table public.support_contacts (
  id smallint primary key default 1 check (id = 1),
  telegram text check (telegram ~ '^[A-Za-z0-9_]{5,32}$'),
  whatsapp text check (whatsapp ~ '^\+?[0-9]{10,15}$'),
  phone    text check (phone    ~ '^\+?[0-9]{10,15}$'),
  sms      text check (sms      ~ '^\+?[0-9]{10,15}$'),
  email    text check (email ~ '^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$'),
  hours    text check (char_length(hours) <= 80),
  updated_at timestamptz not null default now()
);
insert into public.support_contacts (id) values (1);

alter table public.support_contacts enable row level security;
create policy support_contacts_select on public.support_contacts for select to anon, authenticated using (true);
create policy support_contacts_update on public.support_contacts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- insert/delete не разрешены никому: строка ровно одна.
revoke insert, delete, truncate on public.support_contacts from anon, authenticated;
