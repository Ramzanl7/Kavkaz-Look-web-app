-- upsert (on conflict do update) переписывает и user_id; без этого права повторное сохранение мерок падало с 42501.
-- Сменить владельца нельзя: политика measurements_update проверяет with check (user_id = auth.uid()).
grant update (user_id) on public.measurements to authenticated;
