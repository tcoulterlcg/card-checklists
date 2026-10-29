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

-- ---------- 2026-10-29 (b): photos in Cloudflare R2, one charge per photo ----------
-- Instagram-imported photos live in R2 under photos/<the row owner's id>/<hash>.jpg. Allow that
-- (only in the owner's own folder) alongside the existing Supabase bucket. If the bucket moves to
-- a custom domain, add its prefix here.
alter table public.cardhq_collection_items drop constraint if exists cardhq_items_image_url;
alter table public.cardhq_collection_items add constraint cardhq_items_image_url check (
  image_url is null
  or image_url like 'https://kfudhwuyxtfkmwcolavs.supabase.co/storage/v1/object/public/cardhq-images/%'
  or image_url ~ ('^https://pub-[0-9a-f]{32}\.r2\.dev/photos/' || user_id::text || '/[0-9a-f]{32}\.jpg$'));

-- Each photo is charged once per collector: retries, "Continue" and re-imports of the same photo are free.
create table if not exists public.cardhq_ai_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_key text not null check (photo_key ~ '^[0-9a-f]{64}$'),
  at timestamptz not null default now(),
  primary key (user_id, photo_key)
);
alter table public.cardhq_ai_claims enable row level security;
revoke all on public.cardhq_ai_claims from anon, authenticated;

drop function if exists public.cardhq_ai_claim_photo();
create or replace function public.cardhq_ai_claim_photo(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', now())::date;
  lim int := public.cardhq_ai_photo_limit();
  n int;
begin
  if auth.uid() is null or p_key !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'limit', lim); end if;
  if exists (select 1 from public.cardhq_ai_claims where user_id = auth.uid() and photo_key = p_key) then
    return jsonb_build_object('ok', true, 'again', true, 'limit', lim);
  end if;
  insert into public.cardhq_ai_usage (user_id, month, photos) values (auth.uid(), m, 0)
    on conflict (user_id, month) do nothing;
  update public.cardhq_ai_usage set photos = photos + 1
    where user_id = auth.uid() and month = m and (photos < lim or public.cardhq_is_admin())
    returning photos into n;
  if n is null then return jsonb_build_object('ok', false, 'used', lim, 'limit', lim); end if;
  insert into public.cardhq_ai_claims (user_id, photo_key) values (auth.uid(), p_key) on conflict do nothing;
  return jsonb_build_object('ok', true, 'used', n, 'limit', lim);
end $$;
revoke execute on function public.cardhq_ai_claim_photo(text) from public, anon;
grant execute on function public.cardhq_ai_claim_photo(text) to authenticated;
