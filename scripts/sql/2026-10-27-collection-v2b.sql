-- Card HQ accounts project (kfudhwuyxtfkmwcolavs): collection v2 hardening (review findings, 2026-10-27).
-- Replaces the last block of 2026-10-27-collection-v2.sql (signed-in trade visibility), which never ran.
--  * Collections, wantlists and wantlist rules are readable by their owner only.
--  * Row ids are always made by the database; imports insert/update through functions
--    (insert skips rows already saved, so a retried import doesn't double up or fail).
--  * Photos must live in Card HQ's own storage bucket.
--  * Trading is removed for launch (matcher function and offers table dropped).
begin;
set local lock_timeout = '5s';

-- ---------- owner-only reads ----------
drop policy if exists cardhq_collection_select on public.cardhq_collection_items;
create policy cardhq_collection_select on public.cardhq_collection_items for select using ((select auth.uid()) = user_id);
drop policy if exists cardhq_wantlist_select on public.cardhq_wantlist_items;
create policy cardhq_wantlist_select on public.cardhq_wantlist_items for select using ((select auth.uid()) = user_id);
drop policy if exists cardhq_want_rules_select on public.cardhq_want_rules;
create policy cardhq_want_rules_select on public.cardhq_want_rules for select using ((select auth.uid()) = user_id);

-- trading is not part of launch (Trevor, 2026-10-27): remove the trade matcher and offers
drop function if exists public.cardhq_trade_matches();
drop table if exists public.cardhq_trade_requests;
drop function if exists public.cardhq_trade_req_guard();

-- ---------- ids made by the database ----------
alter table public.cardhq_collection_items alter column id set generated always;
alter table public.cardhq_wantlist_items alter column id set generated always;

-- bulk insert for imports: the caller's own rows only; rows already saved (same source id, or the
-- same wantlist card) are skipped instead of failing the batch. Returns what was inserted.
create or replace function public.cardhq_insert_items(rows jsonb)
returns setof public.cardhq_collection_items
language sql volatile security invoker set search_path to 'public' as $$
  insert into public.cardhq_collection_items (user_id, set_slug, set_name, section, card_n, player, collection_id, status, qty, price_paid, value, value_at,
    condition, grader, grade, cert_no, serial_no, autographed, notes, tags, image_url, acquired_on, source, source_item_id, tcdb_sid, tcdb_cid)
  select auth.uid(), x.set_slug, x.set_name, x.section, x.card_n, x.player, x.collection_id, coalesce(x.status, 'have'), coalesce(x.qty, 1), x.price_paid, x.value, x.value_at,
    x.condition, x.grader, x.grade, x.cert_no, x.serial_no, coalesce(x.autographed, false), x.notes, coalesce(x.tags, '{}'), x.image_url, x.acquired_on, x.source, x.source_item_id, x.tcdb_sid, x.tcdb_cid
  from jsonb_populate_recordset(null::public.cardhq_collection_items, rows) x
  where jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) <= 1000
  on conflict do nothing
  returning *
$$;
revoke execute on function public.cardhq_insert_items(jsonb) from anon, public;
grant execute on function public.cardhq_insert_items(jsonb) to authenticated;

-- bulk update (re-imports, re-match): whole rows by id, the caller's own rows only
create or replace function public.cardhq_update_items(rows jsonb)
returns integer
language plpgsql volatile security invoker set search_path to 'public' as $$
declare n integer;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then raise exception 'Too many rows in one update.' using errcode = 'P0001'; end if;
  update public.cardhq_collection_items t set
    set_slug = x.set_slug, set_name = x.set_name, section = x.section, card_n = x.card_n, player = x.player, collection_id = x.collection_id,
    status = coalesce(x.status, t.status), qty = coalesce(x.qty, t.qty), price_paid = x.price_paid, value = x.value, value_at = x.value_at,
    condition = x.condition, grader = x.grader, grade = x.grade, cert_no = x.cert_no, serial_no = x.serial_no, autographed = coalesce(x.autographed, false),
    notes = x.notes, tags = coalesce(x.tags, '{}'), image_url = x.image_url, acquired_on = x.acquired_on,
    source = x.source, source_item_id = x.source_item_id, tcdb_sid = x.tcdb_sid, tcdb_cid = x.tcdb_cid
  from jsonb_populate_recordset(null::public.cardhq_collection_items, rows) x
  where t.id = x.id and t.user_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.cardhq_update_items(jsonb) from anon, public;
grant execute on function public.cardhq_update_items(jsonb) to authenticated;

create or replace function public.cardhq_insert_wants(rows jsonb)
returns integer
language plpgsql volatile security invoker set search_path to 'public' as $$
declare n integer;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then raise exception 'Too many rows in one insert.' using errcode = 'P0001'; end if;
  insert into public.cardhq_wantlist_items (user_id, set_slug, set_name, card_n, section, player, source, source_item_id)
  select auth.uid(), x.set_slug, x.set_name, x.card_n, x.section, x.player, x.source, x.source_item_id
  from jsonb_populate_recordset(null::public.cardhq_wantlist_items, rows) x
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.cardhq_insert_wants(jsonb) from anon, public;
grant execute on function public.cardhq_insert_wants(jsonb) to authenticated;

-- ---------- limits ----------
alter table public.cardhq_collection_items add constraint cardhq_items_image_url check (
  image_url is null or image_url like 'https://kfudhwuyxtfkmwcolavs.supabase.co/storage/v1/object/public/cardhq-images/%');
commit;
