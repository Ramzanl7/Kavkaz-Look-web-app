-- 3D-модели товаров (.glb) для просмотра в 3D и AR на странице товара.
alter table public.products add column if not exists model_path text check (model_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.glb$');
grant update (model_path) on public.products to authenticated;

-- Хранилище моделей: публичное чтение, до 15 МБ, только .glb
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-models', 'product-models', true, 15728640, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do nothing;

-- Видеть (для замены), загружать и заменять модели может только владелец бутика (папка = id бутика), с общим лимитом загрузок
create policy product_models_select on storage.objects for select to authenticated
  using (bucket_id = 'product-models' and public.owns_boutique(((storage.foldername(name))[1])::uuid));
create policy product_models_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-models' and public.owns_boutique(((storage.foldername(name))[1])::uuid)
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.glb$' and public.upload_ok());
create policy product_models_update on storage.objects for update to authenticated
  using (bucket_id = 'product-models' and public.owns_boutique(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'product-models' and public.owns_boutique(((storage.foldername(name))[1])::uuid) and public.upload_ok());
create policy product_models_remove on storage.objects for delete to authenticated
  using (bucket_id = 'product-models' and public.owns_boutique(((storage.foldername(name))[1])::uuid));
