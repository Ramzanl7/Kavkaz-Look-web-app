-- вес (необязательно) — для точного телосложения манекена; ответ мужского опросника о длине брюк
alter table public.measurements add column if not exists weight_kg smallint check (weight_kg between 30 and 250);
grant select (weight_kg), insert (weight_kg), update (weight_kg) on public.measurements to authenticated;
alter table public.measurements drop constraint if exists measurements_fit_pref_check;
alter table public.measurements add constraint measurements_fit_pref_check check (fit_pref is null or (
  jsonb_typeof(fit_pref) = 'object'
  and length(fit_pref::text) <= 200
  and (fit_pref->>'fit' is null or fit_pref->>'fit' in ('tight', 'regular', 'loose', 'oversize'))
  and (fit_pref->>'between' is null or fit_pref->>'between' in ('smaller', 'bigger'))
  and (fit_pref->>'length' is null or fit_pref->>'length' in ('maxi', 'midi', 'any'))
  and (fit_pref->>'trousers' is null or fit_pref->>'trousers' in ('long', 'cropped', 'any'))
));
