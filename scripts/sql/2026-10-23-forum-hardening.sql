-- Card HQ accounts project (kfudhwuyxtfkmwcolavs): forum + notification hardening.
-- Run once in the Supabase SQL editor. Safe: the forum tables were empty on 2026-10-23.
begin;
set local lock_timeout = '5s';

-- Nothing in Card HQ inserts admin notifications; only admins may.
drop policy if exists cardhq_notif_insert on public.cardhq_admin_notifications;
create policy cardhq_notif_insert on public.cardhq_admin_notifications
  for insert to authenticated with check (public.cardhq_is_admin());

-- Length limits (the UI caps match these).
alter table public.cardhq_forum_posts add constraint cardhq_posts_title_len check (title is null or char_length(title) <= 120);
alter table public.cardhq_forum_posts add constraint cardhq_posts_body_len check (body is null or char_length(body) <= 5000);
alter table public.cardhq_forum_posts add constraint cardhq_posts_images check (image_urls is null or cardinality(image_urls) <= 6);
alter table public.cardhq_forum_comments add constraint cardhq_comments_body_len check (char_length(body) between 1 and 1000);
alter table public.cardhq_profiles add constraint cardhq_profiles_display_len check (display_name is null or char_length(display_name) <= 40);

-- Rate limits: 10 posts and 60 comments per user per hour.
create or replace function public.cardhq_forum_rate_limit() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_table_name = 'cardhq_forum_posts' then
    if (select count(*) from public.cardhq_forum_posts where user_id = new.user_id and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'You''ve posted a lot in the last hour — please try again later.' using errcode = 'P0001';
    end if;
  else
    if (select count(*) from public.cardhq_forum_comments where user_id = new.user_id and created_at > now() - interval '1 hour') >= 60 then
      raise exception 'You''ve commented a lot in the last hour — please try again later.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cardhq_posts_rate on public.cardhq_forum_posts;
create trigger cardhq_posts_rate before insert on public.cardhq_forum_posts for each row execute function public.cardhq_forum_rate_limit();
drop trigger if exists cardhq_comments_rate on public.cardhq_forum_comments;
create trigger cardhq_comments_rate before insert on public.cardhq_forum_comments for each row execute function public.cardhq_forum_rate_limit();

-- Trigger functions aren't API endpoints (triggers still run without EXECUTE for these roles).
revoke execute on function public.cardhq_feedback_rate_limit() from anon, authenticated, public;
revoke execute on function public.cardhq_forum_rate_limit() from anon, authenticated, public;

-- Defense in depth: the public API never needs TRUNCATE.
revoke truncate on all tables in schema public from anon, authenticated;
commit;
