-- Виртуальная примерка: манекен по меркам покупателя + размеры вещи.
-- Мерки: ширина плеч и длина ног по внутреннему шву (необязательные).
alter table public.measurements
  add column if not exists shoulder_cm smallint check (shoulder_cm between 30 and 70),
  add column if not exists inseam_cm smallint check (inseam_cm between 50 and 110);
grant update (shoulder_cm, inseam_cm) on public.measurements to authenticated;

-- Товар: тип вещи (как сидит на фигуре), размеры в наличии, необязательная таблица замеров готовой вещи (см).
alter table public.products
  add column if not exists garment_type text check (garment_type in ('dress', 'top', 'outer', 'pants', 'skirt', 'none')),
  add column if not exists sizes text[] check (sizes is null or (cardinality(sizes) <= 20 and array_to_string(sizes, ',') ~ '^[0-9A-Za-z,]{0,120}$')),
  add column if not exists size_chart jsonb check (size_chart is null or (jsonb_typeof(size_chart) = 'object' and length(size_chart::text) <= 4000));
grant insert (garment_type, sizes, size_chart) on public.products to authenticated;
grant update (garment_type, sizes, size_chart) on public.products to authenticated;

-- Загрузка 3D-моделей продавцом больше не используется
revoke update (model_path) on public.products from authenticated;
