-- My PC: teams, sets and products a collector chases (players stay in cardhq_followed_players).
create table if not exists public.cardhq_pc_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('team', 'set', 'product')),
  item_key text not null check (char_length(item_key) between 1 and 200),
  label text check (label is null or char_length(label) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, kind, item_key)
);
alter table public.cardhq_pc_items enable row level security;
create policy cardhq_pc_select on public.cardhq_pc_items for select using (auth.uid() = user_id);
create policy cardhq_pc_insert on public.cardhq_pc_items for insert with check (auth.uid() = user_id);
create policy cardhq_pc_update on public.cardhq_pc_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cardhq_pc_delete on public.cardhq_pc_items for delete using (auth.uid() = user_id);
