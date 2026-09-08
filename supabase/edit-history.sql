-- Run this if Joy House already has edit-posts.sql and you need author-only
-- edits plus admin edit history. New projects can skip this file; the same
-- statements are in schema.sql.

drop policy if exists "admins update any comment" on public.comments;

create or replace function public.enforce_post_edit_rules()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    if auth.uid() is distinct from old.author_id then
      raise exception 'Only the author can edit this post';
    end if;
    if old.created_at < now() - interval '15 minutes' then
      raise exception 'Edits are only allowed for 15 minutes after posting';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_enforce_edit_rules on public.posts;
create trigger posts_enforce_edit_rules
  before update on public.posts
  for each row execute function public.enforce_post_edit_rules();

create or replace function public.enforce_comment_edit_rules()
returns trigger
language plpgsql
as $$
begin
  if new.body is distinct from old.body then
    if auth.uid() is distinct from old.author_id then
      raise exception 'Only the author can edit this comment';
    end if;
    if old.created_at < now() - interval '15 minutes' then
      raise exception 'Edits are only allowed for 15 minutes after posting';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_enforce_edit_rules on public.comments;
create trigger comments_enforce_edit_rules
  before update on public.comments
  for each row execute function public.enforce_comment_edit_rules();

create table if not exists public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comment_revisions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_revisions_post_id_idx
  on public.post_revisions (post_id, created_at);
create index if not exists comment_revisions_comment_id_idx
  on public.comment_revisions (comment_id, created_at);

alter table public.post_revisions enable row level security;
alter table public.comment_revisions enable row level security;

drop policy if exists "admins read post revisions" on public.post_revisions;
create policy "admins read post revisions"
  on public.post_revisions for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins read comment revisions" on public.comment_revisions;
create policy "admins read comment revisions"
  on public.comment_revisions for select
  to authenticated
  using (public.is_admin());

create or replace function public.archive_post_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    insert into public.post_revisions (post_id, title, body)
    values (old.id, old.title, old.body);
  end if;
  return new;
end;
$$;

drop trigger if exists posts_archive_revision on public.posts;
create trigger posts_archive_revision
  before update on public.posts
  for each row execute function public.archive_post_revision();

create or replace function public.archive_comment_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.body is distinct from old.body then
    insert into public.comment_revisions (comment_id, body)
    values (old.id, old.body);
  end if;
  return new;
end;
$$;

drop trigger if exists comments_archive_revision on public.comments;
create trigger comments_archive_revision
  before update on public.comments
  for each row execute function public.archive_comment_revision();
