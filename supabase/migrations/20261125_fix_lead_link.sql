-- Исправление: ссылка в уведомлении о заявке бутика без «?» (таблица уведомлений его не принимает)
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
