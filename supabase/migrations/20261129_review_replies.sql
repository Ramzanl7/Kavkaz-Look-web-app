-- Ответ бутика на отзыв: виден всем под отзывом, автору отзыва приходит уведомление
alter table public.reviews add column if not exists reply text check (reply is null or char_length(reply) <= 1000);
alter table public.reviews add column if not exists reply_at timestamptz;
grant select (reply, reply_at) on public.reviews to anon, authenticated;

-- Отзывы на товары моего бутика
create or replace function public.seller_reviews(lim int default 100) returns table (
  id uuid, product_id uuid, product_title text, author_name text, rating int, body text, created_at timestamptz, reply text, reply_at timestamptz, hidden boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.product_id, p.title, r.author_name, r.rating::int, r.body, r.created_at, r.reply, r.reply_at, r.hidden
  from public.reviews r join public.products p on p.id = r.product_id join public.boutiques b on b.id = p.boutique_id
  where b.owner_id = (select auth.uid())
  order by (r.reply is null) desc, r.created_at desc
  limit greatest(1, least(lim, 300));
$$;
revoke all on function public.seller_reviews(int) from public, anon;
grant execute on function public.seller_reviews(int) to authenticated;

-- Ответить на отзыв (или изменить/удалить ответ — пустой текст)
create or replace function public.reply_review(rid uuid, txt text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; t text := nullif(btrim(coalesce(txt, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.rate_limit('review_reply', 30, 3600);
  select rv.id, rv.user_id, rv.product_id, b.owner_id, b.name into r
    from public.reviews rv join public.products p on p.id = rv.product_id join public.boutiques b on b.id = p.boutique_id
    where rv.id = rid;
  if not found then raise exception 'review not found'; end if;
  if r.owner_id <> auth.uid() then raise exception 'forbidden'; end if;
  if t is not null and char_length(t) > 1000 then raise exception 'too long'; end if;
  update public.reviews set reply = t, reply_at = case when t is null then null else now() end where id = rid;
  if t is not null then
    perform public.notify(r.user_id, 'review_reply', rid, 'Бутик ответил на ваш отзыв', left(r.name || ': ' || t, 200), '/product/' || r.product_id);
  end if;
end $$;
revoke all on function public.reply_review(uuid, text) from public, anon;
grant execute on function public.reply_review(uuid, text) to authenticated;
