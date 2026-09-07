-- Run this if Joy House is already set up and you only need post/comment edits.
-- New projects can skip this file; the same statements are in schema.sql.

alter table public.posts
  add column if not exists edited_at timestamptz;

alter table public.comments
  add column if not exists edited_at timestamptz;

-- Append edited_at. Do not insert it in the middle of the existing view columns.
create or replace view public.posts_visible
with (security_invoker = true) as
select
  p.id,
  p.title,
  p.body,
  p.category,
  p.is_anonymous,
  p.created_at,
  p.like_count,
  p.is_pinned,
  case
    when p.is_anonymous
      and p.author_id is distinct from auth.uid()
      and not public.is_admin()
    then null
    else p.author_id
  end as author_id,
  case
    when public.is_admin() then p.author_id
    else null
  end as admin_author_id,
  p.image_url,
  p.edited_at
from public.posts p;

grant select on public.posts_visible to authenticated;

create or replace function public.set_post_edited_at()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_set_edited_at on public.posts;
create trigger posts_set_edited_at
  before update on public.posts
  for each row execute function public.set_post_edited_at();

create or replace function public.set_comment_edited_at()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists comments_set_edited_at on public.comments;
create trigger comments_set_edited_at
  before update on public.comments
  for each row execute function public.set_comment_edited_at();

drop policy if exists "admins update any comment" on public.comments;
create policy "admins update any comment"
  on public.comments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
