-- «Мои мерки»: человек сам вводит мерки, чтобы приложение подсказывало размер.
-- Видит и меняет их только сам владелец. Удаляются вместе с аккаунтом.
create table if not exists public.measurements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  gender text check (gender in ('female', 'male')),
  height_cm smallint check (height_cm between 100 and 230),
  chest_cm smallint check (chest_cm between 50 and 180),
  waist_cm smallint check (waist_cm between 40 and 180),
  hips_cm smallint check (hips_cm between 50 and 190),
  shoe_eu numeric(3, 1) check (shoe_eu between 30 and 50),
  updated_at timestamptz not null default now()
);
alter table public.measurements enable row level security;

create policy measurements_select on public.measurements for select to authenticated using (user_id = auth.uid());
create policy measurements_insert on public.measurements for insert to authenticated with check (user_id = auth.uid());
create policy measurements_update on public.measurements for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy measurements_remove on public.measurements for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.measurements to authenticated;
grant update (gender, height_cm, chest_cm, waist_cm, hips_cm, shoe_eu, updated_at) on public.measurements to authenticated;

-- лимит: 20 сохранений в минуту
create trigger rl_measurements before insert or update on public.measurements
  for each row execute function public.limit_writes('measurements', '20', '60');
