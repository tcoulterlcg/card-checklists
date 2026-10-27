-- Card HQ accounts project (kfudhwuyxtfkmwcolavs): opt-in "show my collection on checklists" (2026-10-27).
-- Applied 2026-10-27 (migration cardhq_show_owned).
-- A collector who turns this on is listed as an owner ("Owned by @username") on every card they've
-- checked off, on the public set pages. Off by default. Collection rows stay owner-only (RLS from
-- collection-v2b); this function hands out username + card identity only — never price, value,
-- grade, notes or photos — and only for collectors who opted in.
begin;
set local lock_timeout = '5s';

alter table public.cardhq_profiles add column if not exists show_owned boolean not null default false;

-- slugs: the set's current slug plus old slugs that redirect to it (rows saved before a rename)
create or replace function public.cardhq_set_owners(slugs text[])
returns table (section text, card_n text, username text)
language sql stable security definer set search_path to 'public' as $$
  select distinct i.section, i.card_n::text, p.username
  from public.cardhq_profiles p
  join public.cardhq_collection_items i on i.user_id = p.id and i.set_slug = any(slugs)
  where p.show_owned and p.username is not null
    and i.status in ('have', 'trade', 'sale', 'in_transaction')
    and coalesce(array_length(slugs, 1), 0) between 1 and 20
  limit 50000
$$;
revoke execute on function public.cardhq_set_owners(text[]) from public;
grant execute on function public.cardhq_set_owners(text[]) to anon, authenticated;
commit;
