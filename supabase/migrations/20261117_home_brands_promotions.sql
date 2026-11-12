-- «Сделано рядом»: местные бренды (рекламная карусель на главной), управляет администратор
create table if not exists public.local_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  description text check (description is null or char_length(description) <= 140),
  banner_path text check (banner_path is null or banner_path ~ '^brands/[0-9a-f-]{36}-banner\.jpg$'),
  logo_path text check (logo_path is null or logo_path ~ '^brands/[0-9a-f-]{36}-logo\.jpg$'),
  boutique_id uuid references public.boutiques(id) on delete set null,
  site_url text check (site_url is null or (site_url ~ '^https://[^\s<>"]{3,300}$')),
  ios_url text check (ios_url is null or (ios_url ~ '^https://[^\s<>"]{3,300}$')),
  android_url text check (android_url is null or (android_url ~ '^https://[^\s<>"]{3,300}$')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  is_approved boolean not null default false,
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.local_brands enable row level security;
create policy local_brands_public on public.local_brands for select
  using (is_approved and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy local_brands_admin_select on public.local_brands for select using (public.is_admin());
create policy local_brands_admin_insert on public.local_brands for insert with check (public.is_admin());
create policy local_brands_admin_update on public.local_brands for update using (public.is_admin()) with check (public.is_admin());
create policy local_brands_admin_delete on public.local_brands for delete using (public.is_admin());
grant select on public.local_brands to anon, authenticated;
grant insert, update, delete on public.local_brands to authenticated;

-- «Популярное сейчас»: платное продвижение товара. Цену не меняет; маркировка рекламы (38-ФЗ): рекламодатель и токен erid
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  advertiser text not null check (char_length(advertiser) between 2 and 120),
  advertiser_inn text check (advertiser_inn is null or advertiser_inn ~ '^[0-9]{10}([0-9]{2})?$'),
  erid text check (erid is null or erid ~ '^[A-Za-z0-9]{6,40}$'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null check (ends_at > starts_at),
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists promotions_live_idx on public.promotions (ends_at, starts_at);
alter table public.promotions enable row level security;
create policy promotions_public on public.promotions for select using (starts_at <= now() and ends_at > now());
create policy promotions_admin_select on public.promotions for select using (public.is_admin());
create policy promotions_admin_insert on public.promotions for insert with check (public.is_admin());
create policy promotions_admin_update on public.promotions for update using (public.is_admin()) with check (public.is_admin());
create policy promotions_admin_delete on public.promotions for delete using (public.is_admin());
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;

-- баннеры и логотипы брендов: читают все, загружает только администратор
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-media', 'brand-media', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;
create policy brand_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-media' and public.is_admin() and name ~ '^brands/[0-9a-f-]{36}-(banner|logo)\.jpg$');
create policy brand_media_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-media' and public.is_admin()) with check (bucket_id = 'brand-media' and public.is_admin());
create policy brand_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-media' and public.is_admin());
