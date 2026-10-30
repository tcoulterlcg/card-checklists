-- The Grid: each signed-in collector's games (one row per mode + grid).
create table if not exists public.cardhq_grid_plays (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (char_length(mode) between 1 and 24),
  grid_key text not null check (char_length(grid_key) between 1 and 40),   -- 'YYYY-MM-DD' (daily) or 's<seed>' (random)
  daily boolean not null default true,
  picks jsonb not null default '{}'::jsonb,
  misses jsonb not null default '[]'::jsonb,
  guesses_used smallint not null default 0 check (guesses_used between 0 and 9),
  score smallint not null default 0 check (score between 0 and 9),
  finished boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mode, grid_key)
);
create index if not exists cardhq_grid_plays_user on public.cardhq_grid_plays (user_id, updated_at desc);
alter table public.cardhq_grid_plays enable row level security;
create policy cardhq_grid_select on public.cardhq_grid_plays for select using (auth.uid() = user_id);
create policy cardhq_grid_insert on public.cardhq_grid_plays for insert with check (auth.uid() = user_id);
create policy cardhq_grid_update on public.cardhq_grid_plays for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cardhq_grid_delete on public.cardhq_grid_plays for delete using (auth.uid() = user_id);
