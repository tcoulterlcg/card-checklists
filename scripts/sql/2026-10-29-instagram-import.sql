-- Import from Instagram: monthly allowance of AI photo checks per collector.
-- Accounts project (kfudhwuyxtfkmwcolavs). Called by app/api/instagram/identify with the
-- collector's own sign-in, so the functions use auth.uid(); the table itself is not readable
-- or writable directly, so the allowance can't be reset from a browser.
-- No refund function on purpose: anything callable from a browser could be used to reset the count.
-- Change the allowance in cardhq_ai_photo_limit(). Admins (cardhq_is_admin) have no limit.

create table if not exists public.cardhq_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  photos int not null default 0 check (photos >= 0),
  primary key (user_id, month)
);
alter table public.cardhq_ai_usage enable row level security;
revoke all on public.cardhq_ai_usage from anon, authenticated;

create or replace function public.cardhq_ai_photo_limit() returns int
language sql immutable as $$ select 500 $$;

-- Takes one photo from this month's allowance. → { ok, used, limit }
create or replace function public.cardhq_ai_claim_photo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', now())::date;
  lim int := public.cardhq_ai_photo_limit();
  n int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'limit', lim); end if;
  insert into public.cardhq_ai_usage (user_id, month, photos) values (auth.uid(), m, 0)
    on conflict (user_id, month) do nothing;
  update public.cardhq_ai_usage set photos = photos + 1
    where user_id = auth.uid() and month = m and (photos < lim or public.cardhq_is_admin())
    returning photos into n;
  if n is null then return jsonb_build_object('ok', false, 'used', lim, 'limit', lim); end if;
  return jsonb_build_object('ok', true, 'used', n, 'limit', lim);
end $$;

-- For the import screen. → { left, limit, unlimited }
create or replace function public.cardhq_ai_photos_left() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'limit', public.cardhq_ai_photo_limit(),
    'unlimited', public.cardhq_is_admin(),
    'left', greatest(public.cardhq_ai_photo_limit() - coalesce((select photos from public.cardhq_ai_usage
      where user_id = auth.uid() and month = date_trunc('month', now())::date), 0), 0))
$$;

revoke execute on function public.cardhq_ai_claim_photo(), public.cardhq_ai_photos_left() from public, anon;
grant execute on function public.cardhq_ai_claim_photo(), public.cardhq_ai_photos_left() to authenticated;
