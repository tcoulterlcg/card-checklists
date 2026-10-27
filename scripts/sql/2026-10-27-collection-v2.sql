-- Card HQ accounts project (kfudhwuyxtfkmwcolavs): collection v2.
-- Named collections, per-copy details (qty, price, grading…), statuses (have / for trade / for sale /
-- in transit), wantlist rules, trade matching and trade requests.
-- Applied 2026-10-27 via the Supabase connector (migration cardhq_collection_v2).
-- Safe to run on 2026-10-27: cardhq_collection_items and cardhq_wantlist_items were empty.
begin;
set local lock_timeout = '5s';

-- ---------- helpers ----------
-- Same idea as sectionKey() in lib/catalog.js: "Base" / "Base Set" / "2021-22 Prizm – Base Set" match.
create or replace function public.cardhq_section_key(t text) returns text
language sql immutable parallel safe set search_path to 'public' as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(t, '')), '^\d{4}(-\d{2,4})?\s[^–—]+\s+[–—]\s+', ''),
             '(\s+(set|cards?|checklist))+$', ''),
           '[^a-z0-9/]+', ' ', 'g'))
$$;

create or replace function public.cardhq_touch_updated_at() returns trigger
language plpgsql set search_path to 'public' as $$
begin new.updated_at := now(); return new; end $$;
revoke execute on function public.cardhq_touch_updated_at() from anon, authenticated, public;

-- ---------- profiles ----------
alter table public.cardhq_profiles add column if not exists open_to_trade boolean not null default false;

-- ---------- named collections ("Patrick Kane PC", "Dad Football") ----------
create table if not exists public.cardhq_collections (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  is_public boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.cardhq_collections enable row level security;
create policy cardhq_collections_select on public.cardhq_collections for select using (
  (select auth.uid()) = user_id or is_public
  or exists (select 1 from public.cardhq_profiles p where p.id = cardhq_collections.user_id and p.is_public));
create policy cardhq_collections_insert on public.cardhq_collections for insert to authenticated with check ((select auth.uid()) = user_id);
create policy cardhq_collections_update on public.cardhq_collections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cardhq_collections_delete on public.cardhq_collections for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- collection items: one row per copy (a raw copy and a graded copy are two rows) ----------
drop index if exists public.cardhq_collection_uniq;
alter table public.cardhq_collection_items
  add column if not exists collection_id bigint references public.cardhq_collections(id) on delete set null,
  add column if not exists status text not null default 'have',
  add column if not exists qty integer not null default 1,
  add column if not exists price_paid numeric(12,2),
  add column if not exists value numeric(12,2),
  add column if not exists value_at timestamptz,
  add column if not exists condition text,
  add column if not exists grader text,
  add column if not exists grade text,
  add column if not exists cert_no text,
  add column if not exists serial_no text,
  add column if not exists autographed boolean not null default false,
  add column if not exists notes text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists set_name text,
  add column if not exists acquired_on date,
  add column if not exists source text,
  add column if not exists source_item_id text,
  add column if not exists tcdb_sid integer,
  add column if not exists tcdb_cid integer,
  add column if not exists updated_at timestamptz not null default now();
alter table public.cardhq_collection_items
  add constraint cardhq_items_status check (status in ('have', 'trade', 'sale', 'in_transit_in', 'in_transit_out', 'in_transaction')),
  add constraint cardhq_items_qty check (qty between 1 and 9999),
  add constraint cardhq_items_money check ((price_paid is null or price_paid between 0 and 99999999) and (value is null or value between 0 and 99999999)),
  add constraint cardhq_items_text_len check (
    char_length(set_slug) <= 200 and char_length(card_n) <= 200 and coalesce(char_length(section), 0) <= 300
    and coalesce(char_length(player), 0) <= 300 and coalesce(char_length(set_name), 0) <= 300
    and coalesce(char_length(condition), 0) <= 20 and coalesce(char_length(grader), 0) <= 20 and coalesce(char_length(grade), 0) <= 10
    and coalesce(char_length(cert_no), 0) <= 40 and coalesce(char_length(serial_no), 0) <= 20 and coalesce(char_length(notes), 0) <= 2000
    and coalesce(char_length(source), 0) <= 20 and coalesce(char_length(source_item_id), 0) <= 60 and coalesce(char_length(image_url), 0) <= 500),
  add constraint cardhq_items_tags check (cardinality(tags) <= 20);
create index if not exists cardhq_items_user_set on public.cardhq_collection_items (user_id, set_slug);
create index if not exists cardhq_items_trade on public.cardhq_collection_items (set_slug, card_n) where status in ('trade', 'sale');
-- re-importing from TCDB / a CSV merges instead of adding a second copy
create unique index if not exists cardhq_items_source_uniq on public.cardhq_collection_items (user_id, source, source_item_id) where source_item_id is not null;

-- an item's collection must be the owner's own
create or replace function public.cardhq_items_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.collection_id is not null and not exists (select 1 from public.cardhq_collections c where c.id = new.collection_id and c.user_id = new.user_id) then
    raise exception 'That collection isn''t yours.' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then new.collected_at := now(); end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.cardhq_items_guard() from anon, authenticated, public;
drop trigger if exists cardhq_items_guard on public.cardhq_collection_items;
create trigger cardhq_items_guard before insert or update on public.cardhq_collection_items for each row execute function public.cardhq_items_guard();

-- visibility: your own; a public profile or public collection; items you list for trade/sale once you're open to trades
drop policy if exists cardhq_collection_select on public.cardhq_collection_items;
create policy cardhq_collection_select on public.cardhq_collection_items for select using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.cardhq_profiles p where p.id = cardhq_collection_items.user_id and (p.is_public or (p.open_to_trade and cardhq_collection_items.status in ('trade', 'sale'))))
  or exists (select 1 from public.cardhq_collections c where c.id = cardhq_collection_items.collection_id and c.is_public));

-- ---------- wantlist ----------
drop policy if exists cardhq_wantlist_select on public.cardhq_wantlist_items;
create policy cardhq_wantlist_select on public.cardhq_wantlist_items for select using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.cardhq_profiles p where p.id = cardhq_wantlist_items.user_id and (p.is_public or p.open_to_trade)));
alter table public.cardhq_wantlist_items
  add column if not exists source text,
  add column if not exists source_item_id text;
create unique index if not exists cardhq_want_source_uniq on public.cardhq_wantlist_items (user_id, source, source_item_id) where source_item_id is not null;

-- wantlist rules: "every Patrick Kane card", "every McDavid /99 or less", "every Blackhawks rookie"
create table if not exists public.cardhq_want_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('player', 'team', 'set')),
  value text not null check (char_length(btrim(value)) between 1 and 200),
  label text check (char_length(label) <= 200),
  sport text check (char_length(sport) <= 40),
  max_print_run integer check (max_print_run between 1 and 100000),
  rookies_only boolean not null default false,
  autos_only boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.cardhq_want_rules enable row level security;
create policy cardhq_want_rules_select on public.cardhq_want_rules for select using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.cardhq_profiles p where p.id = cardhq_want_rules.user_id and (p.is_public or p.open_to_trade)));
create policy cardhq_want_rules_insert on public.cardhq_want_rules for insert to authenticated with check ((select auth.uid()) = user_id
  and (select count(*) from public.cardhq_want_rules r where r.user_id = (select auth.uid())) < 200);
create policy cardhq_want_rules_update on public.cardhq_want_rules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cardhq_want_rules_delete on public.cardhq_want_rules for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- trade matching ----------
-- they_have: cards on my wantlist (or matching my player rules) that open-to-trade members list for trade/sale
-- they_want: cards I list for trade/sale that are on their wantlists
create or replace function public.cardhq_trade_matches()
returns table (direction text, other_user uuid, username text, item_id bigint, set_slug text, set_name text, section text, card_n text, player text, status text)
language sql stable security invoker set search_path to 'public' as $$
  with me as (select auth.uid() as uid),
  others as (select p.id, p.username from public.cardhq_profiles p, me where p.open_to_trade and p.id <> me.uid),
  my_wants as (select w.* from public.cardhq_wantlist_items w, me where w.user_id = me.uid),
  my_rules as (select r.* from public.cardhq_want_rules r, me where r.user_id = me.uid and r.kind = 'player'),
  their_items as (select i.*, o.username from public.cardhq_collection_items i join others o on o.id = i.user_id where i.status in ('trade', 'sale')),
  my_items as (select i.* from public.cardhq_collection_items i, me where i.user_id = me.uid and i.status in ('trade', 'sale'))
  (select distinct on (t.id) 'they_have'::text, t.user_id, t.username, t.id, t.set_slug, t.set_name, t.section, t.card_n, t.player, t.status
  from their_items t
  where exists (select 1 from my_wants w where w.set_slug = t.set_slug
                  and (w.card_n is null or (w.card_n = t.card_n and public.cardhq_section_key(w.section) = public.cardhq_section_key(t.section))))
     or exists (select 1 from my_rules r where lower(btrim(r.value)) = lower(btrim(t.player))))
  union all
  (select distinct on (o.id, i.id) 'they_want'::text, o.id, o.username, i.id, i.set_slug, i.set_name, i.section, i.card_n, i.player, i.status
  from my_items i
  join public.cardhq_wantlist_items w on w.set_slug = i.set_slug
       and (w.card_n is null or (w.card_n = i.card_n and public.cardhq_section_key(w.section) = public.cardhq_section_key(i.section)))
  join others o on o.id = w.user_id)
$$;
revoke execute on function public.cardhq_trade_matches() from anon, public;
grant execute on function public.cardhq_trade_matches() to authenticated;

-- ---------- trade requests ----------
create table if not exists public.cardhq_trade_requests (
  id bigint generated always as identity primary key,
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  give jsonb not null default '[]' check (jsonb_typeof(give) = 'array' and jsonb_array_length(give) <= 100),
  get jsonb not null default '[]' check (jsonb_typeof(get) = 'array' and jsonb_array_length(get) <= 100),
  message text check (char_length(message) <= 2000),
  reply text check (char_length(reply) <= 2000),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index if not exists cardhq_trade_req_to on public.cardhq_trade_requests (to_user, created_at desc);
create index if not exists cardhq_trade_req_from on public.cardhq_trade_requests (from_user, created_at desc);
alter table public.cardhq_trade_requests enable row level security;
create policy cardhq_trade_req_select on public.cardhq_trade_requests for select to authenticated using ((select auth.uid()) in (from_user, to_user));
create policy cardhq_trade_req_insert on public.cardhq_trade_requests for insert to authenticated with check (
  (select auth.uid()) = from_user and status = 'open'
  and exists (select 1 from public.cardhq_profiles p where p.id = to_user and p.open_to_trade));
create policy cardhq_trade_req_update on public.cardhq_trade_requests for update to authenticated using ((select auth.uid()) in (from_user, to_user)) with check ((select auth.uid()) in (from_user, to_user));

-- who may move a request where: the receiver accepts/declines, the sender cancels, either marks an accepted trade completed
create or replace function public.cardhq_trade_req_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.updated_at := now(); new.reply := null;
    if (select count(*) from public.cardhq_trade_requests where from_user = new.from_user and created_at > now() - interval '1 day') >= 30 then
      raise exception 'You''ve sent a lot of trade offers today — please try again tomorrow.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.from_user <> old.from_user or new.to_user <> old.to_user or new.give <> old.give or new.get <> old.get
     or new.message is distinct from old.message or new.created_at <> old.created_at then
    raise exception 'A sent trade offer can''t be edited — cancel it and send a new one.' using errcode = 'P0001';
  end if;
  if new.reply is distinct from old.reply and me <> old.to_user then
    raise exception 'Only the person receiving the offer can reply.' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'open' and new.status in ('accepted', 'declined') and me = old.to_user)
    or (old.status = 'open' and new.status = 'cancelled' and me = old.from_user)
    or (old.status = 'accepted' and new.status in ('completed', 'cancelled'))) then
    raise exception 'That change isn''t allowed for this offer.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.cardhq_trade_req_guard() from anon, authenticated, public;
drop trigger if exists cardhq_trade_req_guard on public.cardhq_trade_requests;
create trigger cardhq_trade_req_guard before insert or update on public.cardhq_trade_requests for each row execute function public.cardhq_trade_req_guard();

revoke truncate on public.cardhq_collections, public.cardhq_want_rules, public.cardhq_trade_requests from anon, authenticated;
commit;

-- Admins: which sets collectors imported that Card HQ doesn't have yet (no user identities).
-- Applied 2026-10-27 (migration cardhq_unmatched_summary).
create or replace function public.cardhq_unmatched_summary()
returns table (set_name text, cards bigint, collectors bigint)
language sql stable security definer set search_path to 'public' as $$
  select i.set_name, sum(i.qty)::bigint, count(distinct i.user_id)::bigint
  from public.cardhq_collection_items i
  where i.set_slug = 'unmatched' and public.cardhq_is_admin()
  group by i.set_name
  order by count(distinct i.user_id) desc, sum(i.qty) desc
  limit 500
$$;
revoke execute on function public.cardhq_unmatched_summary() from anon, public;
grant execute on function public.cardhq_unmatched_summary() to authenticated;

-- Trade listings and wantlists of open-to-trade members: signed-in members only (not anonymous visitors).
-- Run once (connector approval timed out on 2026-10-27).
drop policy if exists cardhq_collection_select on public.cardhq_collection_items;
create policy cardhq_collection_select on public.cardhq_collection_items for select using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.cardhq_profiles p where p.id = cardhq_collection_items.user_id
             and (p.is_public or (p.open_to_trade and (select auth.uid()) is not null and cardhq_collection_items.status in ('trade', 'sale')))))
  or exists (select 1 from public.cardhq_collections c where c.id = cardhq_collection_items.collection_id and c.is_public));
drop policy if exists cardhq_wantlist_select on public.cardhq_wantlist_items;
create policy cardhq_wantlist_select on public.cardhq_wantlist_items for select using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.cardhq_profiles p where p.id = cardhq_wantlist_items.user_id and (p.is_public or (p.open_to_trade and (select auth.uid()) is not null))));
drop policy if exists cardhq_want_rules_select on public.cardhq_want_rules;
create policy cardhq_want_rules_select on public.cardhq_want_rules for select using (
  (select auth.uid()) = user_id
  or exists (select 1 from public.cardhq_profiles p where p.id = cardhq_want_rules.user_id and (p.is_public or (p.open_to_trade and (select auth.uid()) is not null))));
