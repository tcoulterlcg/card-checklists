-- Card HQ accounts project (kfudhwuyxtfkmwcolavs): Reddit-style community boards.
-- Boards + tags on posts, up/down votes on posts and comments (scores kept by triggers),
-- threaded replies, a linked card (set/section/number/player), admin pins.
-- Safe to run: the forum tables were empty on 2026-10-26. Applied via the Supabase connector.
begin;
set local lock_timeout = '5s';

-- ---------- posts ----------
alter table public.cardhq_forum_posts
  add column if not exists board text not null default 'ask',
  add column if not exists tag text not null default 'discussion',
  add column if not exists player text,
  add column if not exists card_section text,
  add column if not exists card_n text,
  add column if not exists score integer not null default 0,
  add column if not exists comment_count integer not null default 0,
  add column if not exists pinned boolean not null default false,
  add column if not exists edited_at timestamptz;

alter table public.cardhq_forum_posts add constraint cardhq_posts_board check (board in
  ('hockey','football','baseball','basketball','soccer','tcg','nonsport','breaks','mailday','grading','ask','feedback'));
alter table public.cardhq_forum_posts add constraint cardhq_posts_tag check (tag in
  ('showcase','question','pc','discussion','news','data'));
alter table public.cardhq_forum_posts alter column title set not null;
alter table public.cardhq_forum_posts add constraint cardhq_posts_title_min check (char_length(btrim(title)) >= 3);
alter table public.cardhq_forum_posts add constraint cardhq_posts_link_len check (
  char_length(coalesce(set_slug,'')) <= 200 and char_length(coalesce(player,'')) <= 200 and
  char_length(coalesce(card_section,'')) <= 200 and char_length(coalesce(card_n,'')) <= 40);

create index if not exists cardhq_posts_board_created on public.cardhq_forum_posts (board, created_at desc);
create index if not exists cardhq_posts_created on public.cardhq_forum_posts (created_at desc);
create index if not exists cardhq_posts_set on public.cardhq_forum_posts (set_slug) where set_slug is not null;
create index if not exists cardhq_posts_user on public.cardhq_forum_posts (user_id);

-- ---------- comments ----------
alter table public.cardhq_forum_comments
  add column if not exists parent_id bigint references public.cardhq_forum_comments(id) on delete cascade,
  add column if not exists score integer not null default 0,
  add column if not exists deleted boolean not null default false,
  add column if not exists edited_at timestamptz;
create index if not exists cardhq_comments_post on public.cardhq_forum_comments (post_id, created_at);
create index if not exists cardhq_comments_parent on public.cardhq_forum_comments (parent_id) where parent_id is not null;

-- Own comments can be edited or soft-deleted (a deleted comment keeps its replies).
drop policy if exists cardhq_comments_update on public.cardhq_forum_comments;
create policy cardhq_comments_update on public.cardhq_forum_comments
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- votes ----------
create table if not exists public.cardhq_forum_votes (
  post_id bigint not null references public.cardhq_forum_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (post_id, user_id)
);
create table if not exists public.cardhq_comment_votes (
  comment_id bigint not null references public.cardhq_forum_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (comment_id, user_id)
);
create index if not exists cardhq_votes_user on public.cardhq_forum_votes (user_id);
create index if not exists cardhq_cvotes_user on public.cardhq_comment_votes (user_id);
alter table public.cardhq_forum_votes enable row level security;
alter table public.cardhq_comment_votes enable row level security;
-- Votes are private: you see only your own (scores are public on the post/comment).
create policy cardhq_votes_select on public.cardhq_forum_votes for select to authenticated using (auth.uid() = user_id);
create policy cardhq_votes_insert on public.cardhq_forum_votes for insert to authenticated with check (auth.uid() = user_id);
create policy cardhq_votes_update on public.cardhq_forum_votes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cardhq_votes_delete on public.cardhq_forum_votes for delete to authenticated using (auth.uid() = user_id);
create policy cardhq_cvotes_select on public.cardhq_comment_votes for select to authenticated using (auth.uid() = user_id);
create policy cardhq_cvotes_insert on public.cardhq_comment_votes for insert to authenticated with check (auth.uid() = user_id);
create policy cardhq_cvotes_update on public.cardhq_comment_votes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy cardhq_cvotes_delete on public.cardhq_comment_votes for delete to authenticated using (auth.uid() = user_id);
revoke truncate on public.cardhq_forum_votes, public.cardhq_comment_votes from anon, authenticated;

-- ---------- triggers: scores and counts ----------
create or replace function public.cardhq_vote_score() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare d integer := coalesce(case when tg_op <> 'DELETE' then new.value end, 0) - coalesce(case when tg_op <> 'INSERT' then old.value end, 0);
begin
  if d <> 0 then
    if tg_table_name = 'cardhq_forum_votes' then
      update public.cardhq_forum_posts set score = score + d where id = coalesce(new.post_id, old.post_id);
    else
      update public.cardhq_forum_comments set score = score + d where id = coalesce(new.comment_id, old.comment_id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists cardhq_votes_score on public.cardhq_forum_votes;
create trigger cardhq_votes_score after insert or update or delete on public.cardhq_forum_votes for each row execute function public.cardhq_vote_score();
drop trigger if exists cardhq_cvotes_score on public.cardhq_comment_votes;
create trigger cardhq_cvotes_score after insert or update or delete on public.cardhq_comment_votes for each row execute function public.cardhq_vote_score();

create or replace function public.cardhq_comment_count() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    update public.cardhq_forum_posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.cardhq_forum_posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
drop trigger if exists cardhq_comments_count on public.cardhq_forum_comments;
create trigger cardhq_comments_count after insert or delete on public.cardhq_forum_comments for each row execute function public.cardhq_comment_count();

-- Users can't set their own score, counts or pins; a reply must be on the same post.
create or replace function public.cardhq_forum_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_table_name = 'cardhq_forum_posts' then
    if tg_op = 'INSERT' then
      new.score := 0; new.comment_count := 0; new.edited_at := null;
      if not public.cardhq_is_admin() then new.pinned := false; end if;
    else
      new.id := old.id; new.user_id := old.user_id; new.created_at := old.created_at;
      if pg_trigger_depth() = 1 and auth.role() in ('anon', 'authenticated') then
        new.score := old.score; new.comment_count := old.comment_count;
        if not public.cardhq_is_admin() then new.pinned := old.pinned; end if;
        if new.title is distinct from old.title or new.body is distinct from old.body then new.edited_at := now(); end if;
      end if;
    end if;
  else
    if tg_op = 'INSERT' then
      new.score := 0; new.deleted := false; new.edited_at := null;
      if new.parent_id is not null and not exists (select 1 from public.cardhq_forum_comments p where p.id = new.parent_id and p.post_id = new.post_id) then
        raise exception 'That reply points at a comment on another post.' using errcode = 'P0001';
      end if;
    else
      new.id := old.id; new.user_id := old.user_id; new.post_id := old.post_id; new.parent_id := old.parent_id; new.created_at := old.created_at;
      if pg_trigger_depth() = 1 and auth.role() in ('anon', 'authenticated') then
        new.score := old.score;
        if old.deleted then new.deleted := true; new.body := old.body; end if;
        if new.body is distinct from old.body and not new.deleted then new.edited_at := now(); end if;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cardhq_b_guard on public.cardhq_forum_posts;
create trigger cardhq_b_guard before insert or update on public.cardhq_forum_posts for each row execute function public.cardhq_forum_guard();
drop trigger if exists cardhq_b_guard on public.cardhq_forum_comments;
create trigger cardhq_b_guard before insert or update on public.cardhq_forum_comments for each row execute function public.cardhq_forum_guard();

-- Admins can pin and remove any post or comment (moderation).
drop policy if exists cardhq_posts_admin on public.cardhq_forum_posts;
create policy cardhq_posts_admin on public.cardhq_forum_posts for all to authenticated
  using (public.cardhq_is_admin()) with check (public.cardhq_is_admin());
drop policy if exists cardhq_comments_admin on public.cardhq_forum_comments;
create policy cardhq_comments_admin on public.cardhq_forum_comments for all to authenticated
  using (public.cardhq_is_admin()) with check (public.cardhq_is_admin());

revoke execute on function public.cardhq_vote_score() from anon, authenticated, public;
revoke execute on function public.cardhq_comment_count() from anon, authenticated, public;
revoke execute on function public.cardhq_forum_guard() from anon, authenticated, public;
commit;
