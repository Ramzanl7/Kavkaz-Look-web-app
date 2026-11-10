-- Kavkaz Look: схема базы (Supabase / Postgres).
-- Принцип: всё закрыто по умолчанию. Доступ открывают только правила (RLS) ниже.
-- В этой версии НЕТ телефонов, адресов и других персональных данных, кроме того, что хранит сам Supabase Auth.

create type public.user_role as enum ('buyer', 'seller', 'admin');
create type public.order_status as enum ('new', 'confirmed', 'done', 'cancelled');
create type public.request_status as enum ('pending', 'approved', 'rejected');

-- ===== Таблицы =====
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  role public.user_role not null default 'buyer',
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.boutiques (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 500),
  city text not null default 'Грозный',
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 2000),
  price_rub integer not null check (price_rub between 1 and 10000000),
  category text not null check (category in ('Женское', 'Мужское', 'Национальное', 'Обувь', 'Аксессуары')),
  image_path text check (char_length(image_path) <= 300),
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.role_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id),
  boutique_name text not null check (char_length(boutique_name) between 2 and 80),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index one_pending_request_per_user on public.role_requests (user_id) where status = 'pending';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id),
  status public.order_status not null default 'new',
  total_rub integer not null check (total_rub > 0),
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  boutique_id uuid not null references public.boutiques (id),
  title text not null,
  price_rub integer not null check (price_rub > 0),
  qty integer not null check (qty between 1 and 99)
);

create table public.wishlist (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (user_id, product_id)
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  category text not null check (category in ('food', 'taxi', 'delivery', 'coffee')),
  description text check (char_length(description) <= 500),
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id),
  brand_name text not null check (char_length(brand_name) between 2 and 80),
  category text not null check (category in ('food', 'taxi', 'delivery', 'coffee')),
  contact text not null check (char_length(contact) between 3 and 120),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ===== Вспомогательные функции (читают данные в обход правил, но ничего не меняют) =====
create function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and not p.is_blocked);
$$;

create function public.owns_boutique(bid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.boutiques b join public.profiles p on p.id = b.owner_id
    where b.id = bid and b.owner_id = auth.uid() and p.role = 'seller' and not p.is_blocked
  );
$$;

create function public.is_order_buyer(oid uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.orders o where o.id = oid and o.buyer_id = auth.uid());
$$;

-- Профиль создаётся автоматически при регистрации
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== Заказ: цену и сумму считает сервер, а не телефон =====
create function public.create_order(items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); oid uuid; total integer; r record; n integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and is_blocked) then raise exception 'blocked'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 50 then raise exception 'bad items'; end if;
  insert into public.orders (buyer_id, total_rub) values (uid, 1) returning id into oid;
  for r in select (e ->> 'product_id')::uuid as pid, (e ->> 'qty')::int as qty from jsonb_array_elements(items) e loop
    if r.qty is null or r.qty < 1 or r.qty > 99 then raise exception 'bad qty'; end if;
    insert into public.order_items (order_id, product_id, boutique_id, title, price_rub, qty)
      select oid, p.id, p.boutique_id, p.title, p.price_rub, r.qty
      from public.products p join public.boutiques b on b.id = p.boutique_id
      where p.id = r.pid and p.is_published and b.is_approved;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'product unavailable'; end if;
  end loop;
  select sum(price_rub * qty) into total from public.order_items where order_id = oid;
  update public.orders set total_rub = total where id = oid;
  return oid;
end $$;

-- ===== Действия админа: каждая сама проверяет, что вызывает админ =====
create function public.admin_set_role(target uuid, new_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set role = new_role where id = target;
end $$;

create function public.admin_set_blocked(target uuid, blocked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set is_blocked = blocked where id = target;
end $$;

create function public.admin_set_boutique_approved(bid uuid, ok boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.boutiques set is_approved = ok where id = bid;
end $$;

create function public.admin_review_role_request(rid uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.role_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.role_requests where id = rid and status = 'pending' for update;
  if not found then raise exception 'request not found'; end if;
  if approve then
    update public.profiles set role = 'seller' where id = r.user_id and role = 'buyer';
    insert into public.boutiques (owner_id, name, is_approved) values (r.user_id, r.boutique_name, true);
  end if;
  update public.role_requests
    set status = (case when approve then 'approved' else 'rejected' end)::public.request_status, reviewed_at = now()
    where id = rid;
end $$;

create function public.admin_review_partner_request(rid uuid, approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.partner_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.partner_requests where id = rid and status = 'pending' for update;
  if not found then raise exception 'request not found'; end if;
  if approve then
    insert into public.partners (name, category, is_approved) values (r.brand_name, r.category, true);
  end if;
  update public.partner_requests
    set status = (case when approve then 'approved' else 'rejected' end)::public.request_status
    where id = rid;
end $$;

-- ===== Права: сначала всё отбираем, потом выдаём по минимуму =====
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_admin(), public.owns_boutique(uuid), public.is_order_buyer(uuid) to anon, authenticated;
grant execute on function public.create_order(jsonb), public.admin_set_role(uuid, public.user_role),
  public.admin_set_blocked(uuid, boolean), public.admin_set_boutique_approved(uuid, boolean),
  public.admin_review_role_request(uuid, boolean), public.admin_review_partner_request(uuid, boolean) to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;           -- роль и блокировку менять напрямую нельзя
grant select on public.boutiques, public.products, public.partners to anon, authenticated;
grant update (name, description) on public.boutiques to authenticated;      -- одобрение только через функцию админа
grant insert, update, delete on public.products to authenticated;
grant select on public.role_requests, public.orders, public.order_items, public.partner_requests to authenticated;
grant insert (boutique_name) on public.role_requests to authenticated;
grant insert (brand_name, category, contact) on public.partner_requests to authenticated;
grant select, delete on public.wishlist to authenticated;
grant insert (product_id) on public.wishlist to authenticated;

-- ===== Правила построчного доступа (RLS) =====
alter table public.profiles enable row level security;
alter table public.boutiques enable row level security;
alter table public.products enable row level security;
alter table public.role_requests enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.wishlist enable row level security;
alter table public.partners enable row level security;
alter table public.partner_requests enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy boutiques_select on public.boutiques for select to anon, authenticated
  using (is_approved or owner_id = auth.uid() or public.is_admin());
create policy boutiques_update_own on public.boutiques for update to authenticated
  using (public.owns_boutique(id)) with check (public.owns_boutique(id));

create policy products_select on public.products for select to anon, authenticated
  using (
    (is_published and exists (select 1 from public.boutiques b where b.id = boutique_id and b.is_approved))
    or public.owns_boutique(boutique_id) or public.is_admin()
  );
create policy products_insert on public.products for insert to authenticated
  with check (public.owns_boutique(boutique_id));
create policy products_update on public.products for update to authenticated
  using (public.owns_boutique(boutique_id)) with check (public.owns_boutique(boutique_id));
create policy products_delete on public.products for delete to authenticated
  using (public.owns_boutique(boutique_id) or public.is_admin());

create policy role_requests_select on public.role_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy role_requests_insert on public.role_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

create policy orders_select on public.orders for select to authenticated
  using (
    buyer_id = auth.uid() or public.is_admin()
    or exists (select 1 from public.order_items i where i.order_id = orders.id and public.owns_boutique(i.boutique_id))
  );
create policy order_items_select on public.order_items for select to authenticated
  using (public.owns_boutique(boutique_id) or public.is_admin() or public.is_order_buyer(order_id));

create policy wishlist_own on public.wishlist for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy partners_select on public.partners for select to anon, authenticated
  using (is_approved or public.is_admin());
create policy partner_requests_select on public.partner_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy partner_requests_insert on public.partner_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

-- ===== Хранилище фото товаров: только jpeg/png/webp до 5 МБ, писать может владелец бутика в свою папку =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.owns_boutique(((storage.foldername(name))[1])::uuid));
create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.owns_boutique(((storage.foldername(name))[1])::uuid));
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.owns_boutique(((storage.foldername(name))[1])::uuid));
