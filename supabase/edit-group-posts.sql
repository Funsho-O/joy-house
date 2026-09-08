-- Run this if Joy House already has groups and you need group post edits.
-- New projects can skip this file; the same statements are in schema.sql.

alter table public.group_posts
  add column if not exists edited_at timestamptz;

drop policy if exists "authors update own group posts" on public.group_posts;
create policy "authors update own group posts"
  on public.group_posts for update
  to authenticated
  using (author_id = auth.uid() and public.is_verified() and public.is_group_member(group_id))
  with check (author_id = auth.uid() and public.is_verified() and public.is_group_member(group_id));

create or replace function public.set_group_post_edited_at()
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

drop trigger if exists group_posts_set_edited_at on public.group_posts;
create trigger group_posts_set_edited_at
  before update on public.group_posts
  for each row execute function public.set_group_post_edited_at();

create or replace function public.enforce_group_post_edit_rules()
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

drop trigger if exists group_posts_enforce_edit_rules on public.group_posts;
create trigger group_posts_enforce_edit_rules
  before update on public.group_posts
  for each row execute function public.enforce_group_post_edit_rules();

create table if not exists public.group_post_revisions (
  id uuid primary key default gen_random_uuid(),
  group_post_id uuid not null references public.group_posts(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists group_post_revisions_post_id_idx
  on public.group_post_revisions (group_post_id, created_at);

alter table public.group_post_revisions enable row level security;

drop policy if exists "admins read group post revisions" on public.group_post_revisions;
create policy "admins read group post revisions"
  on public.group_post_revisions for select
  to authenticated
  using (public.is_admin());

create or replace function public.archive_group_post_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    insert into public.group_post_revisions (group_post_id, title, body)
    values (old.id, old.title, old.body);
  end if;
  return new;
end;
$$;

drop trigger if exists group_posts_archive_revision on public.group_posts;
create trigger group_posts_archive_revision
  before update on public.group_posts
  for each row execute function public.archive_group_post_revision();
