-- обувь как тип вещи для примерки
alter table public.products drop constraint products_garment_type_check;
alter table public.products add constraint products_garment_type_check check (garment_type in ('dress', 'top', 'outer', 'pants', 'skirt', 'shoes', 'none'));

-- ответы опросника о посадке: как любит носить, что брать между размерами, любимая длина
alter table public.measurements add column if not exists fit_pref jsonb
  check (fit_pref is null or (
    jsonb_typeof(fit_pref) = 'object'
    and length(fit_pref::text) <= 200
    and (fit_pref->>'fit' is null or fit_pref->>'fit' in ('tight', 'regular', 'loose', 'oversize'))
    and (fit_pref->>'between' is null or fit_pref->>'between' in ('smaller', 'bigger'))
    and (fit_pref->>'length' is null or fit_pref->>'length' in ('maxi', 'midi', 'any'))
  ));
grant select (fit_pref), insert (fit_pref), update (fit_pref) on public.measurements to authenticated;
