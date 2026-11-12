-- Заявки бутиков с лендинга /sell: без регистрации, с защитой от спама; админ видит и обрабатывает
create table if not exists public.boutique_leads (
  id uuid primary key default gen_random_uuid(),
  boutique_name text not null check (char_length(boutique_name) between 2 and 80),
  contact_name text check (contact_name is null or char_length(contact_name) <= 60),
  phone text not null check (phone ~ '^\+?[0-9]{10,15}$'),
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  city text check (city is null or char_length(city) <= 40),
  categories text[] check (categories is null or cardinality(categories) <= 6),
  comment text check (comment is null or char_length(comment) <= 500),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'contacted', 'done', 'rejected')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists boutique_leads_created_idx on public.boutique_leads (created_at desc);
alter table public.boutique_leads enable row level security;
drop policy if exists boutique_leads_admin_select on public.boutique_leads;
create policy boutique_leads_admin_select on public.boutique_leads for select using ((select public.is_admin()));
drop policy if exists boutique_leads_admin_update on public.boutique_leads;
create policy boutique_leads_admin_update on public.boutique_leads for update using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.boutique_leads from anon, authenticated;
grant select on public.boutique_leads to authenticated;
grant update (status, admin_note) on public.boutique_leads to authenticated;

-- Отправка заявки: только через эту функцию. Не больше 3 заявок в час с одного адреса и 40 в час всего.
create or replace function public.submit_boutique_lead(
  p_boutique text, p_contact text, p_phone text, p_instagram text, p_city text, p_categories text[], p_comment text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  ip text := split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1);
  ip_key uuid := md5('lead:' || coalesce(nullif(ip, ''), 'none'))::uuid;
  all_key uuid := md5('lead:all')::uuid;
  ph text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  ig text := nullif(regexp_replace(lower(trim(coalesce(p_instagram, ''))), '^(https?://)?(www\.)?(instagram\.com/)?@?|/.*$', '', 'g'), '');
  cats text[];
  lid uuid; a record;
begin
  if char_length(trim(coalesce(p_boutique, ''))) < 2 or ph !~ '^\+?[0-9]{10,15}$' then
    raise exception 'invalid lead' using errcode = '22023';
  end if;
  if not public.rate_ok(coalesce((select auth.uid()), ip_key), 'boutique_lead', 3, 3600)
     or not public.rate_ok(all_key, 'boutique_lead_all', 40, 3600) then
    raise exception 'too many requests' using errcode = 'P0001';
  end if;
  select array_agg(distinct c) into cats from unnest(coalesce(p_categories, '{}')) c
    where c in ('Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары', 'Детское');
  insert into public.boutique_leads (boutique_name, contact_name, phone, instagram, city, categories, comment, user_id)
  values (left(trim(p_boutique), 80), nullif(left(trim(coalesce(p_contact, '')), 60), ''), ph,
          case when ig ~ '^[a-z0-9._]{1,30}$' then ig end, nullif(left(trim(coalesce(p_city, '')), 40), ''),
          cats, nullif(left(trim(coalesce(p_comment, '')), 500), ''), (select auth.uid()))
  returning id into lid;
  for a in select id from public.profiles where role = 'admin' and not is_blocked loop
    perform public.notify(a.id, 'boutique_lead', lid, 'Новая заявка бутика', left(trim(p_boutique), 80) || ' · ' || ph, '/admin/tools/leads');
  end loop;
  return true;
end $$;
revoke all on function public.submit_boutique_lead(text, text, text, text, text, text[], text) from public;
grant execute on function public.submit_boutique_lead(text, text, text, text, text, text[], text) to anon, authenticated;

-- Публичные цифры для лендинга: сколько бутиков и товаров уже в приложении
create or replace function public.platform_counts() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'boutiques', (select count(*) from public.boutiques where is_approved),
    'products', (select count(*) from public.products where is_published and moderation = 'ok')
  );
$$;
revoke all on function public.platform_counts() from public;
grant execute on function public.platform_counts() to anon, authenticated;
