-- Исправление проверок, из-за которых не сохранялись товары с фото и бренды со ссылками
-- 1) Фото товара: путь «бутик/фото.jpg» (раньше буквы j, p, g не проходили проверку)
alter table public.products drop constraint if exists products_images_check;
alter table public.products add constraint products_images_check check (
  images is null or (cardinality(images) <= 6 and array_to_string(images, ',') ~ '^([0-9a-f-]{36}/[0-9a-f-]{36}\.jpg)?(,[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg)*$')
);
-- 2) Ссылки бренда: Postgres не принимает в шаблоне повтор больше 255 — длину проверяем отдельно
alter table public.local_brands drop constraint if exists local_brands_site_url_check;
alter table public.local_brands drop constraint if exists local_brands_ios_url_check;
alter table public.local_brands drop constraint if exists local_brands_android_url_check;
alter table public.local_brands add constraint local_brands_site_url_check check (site_url is null or (char_length(site_url) <= 300 and site_url ~ '^https://[^\s<>"]{3,}$'));
alter table public.local_brands add constraint local_brands_ios_url_check check (ios_url is null or (char_length(ios_url) <= 300 and ios_url ~ '^https://[^\s<>"]{3,}$'));
alter table public.local_brands add constraint local_brands_android_url_check check (android_url is null or (char_length(android_url) <= 300 and android_url ~ '^https://[^\s<>"]{3,}$'));
