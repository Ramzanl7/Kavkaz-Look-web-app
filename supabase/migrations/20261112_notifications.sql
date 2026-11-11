-- Уведомления внутри приложения. Создаются только самой базой (триггеры на события),
-- поэтому подделать уведомление с сайта нельзя. Человек видит только свои и может лишь отметить их прочитанными.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  ref uuid,
  title text not null check (char_length(title) <= 120),
  body text check (char_length(body) <= 300),
  link text check (link ~ '^/[A-Za-z0-9/_-]*$'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_time on public.notifications (user_id, created_at desc);
-- одно уведомление одного вида на одно событие (например, о новом заказе — одно на продавца, даже если в заказе несколько его товаров)
create unique index if not exists notifications_once on public.notifications (user_id, kind, ref) where ref is not null;
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_read on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notify(target uuid, kind text, ref uuid, title text, body text, link text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target is null then return; end if;
  insert into public.notifications (user_id, kind, ref, title, body, link)
  values (target, kind, ref, left(title, 120), left(body, 300), link)
  on conflict do nothing;
end $$;

-- Новый заказ → владельцам бутиков из заказа
create or replace function public.on_order_item_new()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  select b.owner_id into owner from public.boutiques b where b.id = new.boutique_id;
  perform public.notify(owner, 'order_new', new.order_id, 'Новый заказ', new.title || ' × ' || new.qty, '/seller/orders');
  return new;
end $$;
create trigger notify_order_item_new after insert on public.order_items for each row execute function public.on_order_item_new();

-- Смена статуса заказа → покупателю (если менял не он сам) и продавцам (если отменил покупатель)
create or replace function public.on_order_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text; o record;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.buyer_id is not null and new.buyer_id is distinct from auth.uid() then
    t := case new.status when 'confirmed' then 'Заказ подтверждён' when 'done' then 'Заказ выполнен' when 'cancelled' then 'Заказ отменён' else 'Статус заказа изменён' end;
    perform public.notify(new.buyer_id, 'order_' || new.status, new.id, t, 'Сумма: ' || new.total_rub || ' ₽', '/orders');
  end if;
  if new.status = 'cancelled' and new.buyer_id = auth.uid() then
    for o in select distinct b.owner_id from public.order_items i join public.boutiques b on b.id = i.boutique_id where i.order_id = new.id loop
      perform public.notify(o.owner_id, 'order_cancelled_by_buyer', new.id, 'Покупатель отменил заказ', 'Сумма: ' || new.total_rub || ' ₽', '/seller/orders');
    end loop;
  end if;
  return new;
end $$;
create trigger notify_order_status after update of status on public.orders for each row execute function public.on_order_status();

-- Новый отзыв → владельцу бутика
create or replace function public.on_review_new()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner uuid; ttl text;
begin
  select b.owner_id, p.title into owner, ttl from public.products p join public.boutiques b on b.id = p.boutique_id where p.id = new.product_id;
  if owner is distinct from new.user_id then
    perform public.notify(owner, 'review_new', new.id, 'Новый отзыв ' || repeat('★', new.rating), ttl, '/product/' || new.product_id);
  end if;
  return new;
end $$;
create trigger notify_review_new after insert on public.reviews for each row execute function public.on_review_new();

-- Заявки: новая → всем админам; решение → заявителю
create or replace function public.on_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a record; what text := case tg_table_name when 'role_requests' then 'бутик' else 'партнёрство' end;
begin
  if tg_op = 'INSERT' then
    for a in select id from public.profiles where role = 'admin' and not is_blocked loop
      perform public.notify(a.id, 'request_new', new.id, 'Новая заявка на ' || what, null, '/admin');
    end loop;
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.notify(new.user_id, 'request_' || new.status, new.id,
      case new.status when 'approved' then 'Заявка на ' || what || ' одобрена' else 'Заявка на ' || what || ' отклонена' end,
      case when new.status = 'approved' and tg_table_name = 'role_requests' then 'Кабинет продавца открыт. Добавьте первый товар.' end,
      case when new.status = 'approved' and tg_table_name = 'role_requests' then '/seller' else '/profile' end);
  end if;
  return new;
end $$;
create trigger notify_role_request after insert or update of status on public.role_requests for each row execute function public.on_request();
create trigger notify_partner_request after insert or update of status on public.partner_requests for each row execute function public.on_request();

revoke all on function public.notify(uuid, text, uuid, text, text, text), public.on_order_item_new(), public.on_order_status(),
  public.on_review_new(), public.on_request() from public, anon, authenticated;
