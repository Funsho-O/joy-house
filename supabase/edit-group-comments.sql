-- Run this if Joy House already has groups and you need group comment edits.
-- New projects can skip this file; the same statements are in schema.sql.

alter table public.group_comments
  add column if not exists edited_at timestamptz;

drop policy if exists "authors update own group comments" on public.group_comments;
create policy "authors update own group comments"
  on public.group_comments for update
  to authenticated
  using (
    author_id = auth.uid()
    and public.is_verified()
    and exists (
      select 1 from public.group_posts p
      where p.id = group_post_id and public.is_group_member(p.group_id)
    )
  )
  with check (
    author_id = auth.uid()
    and public.is_verified()
    and exists (
      select 1 from public.group_posts p
      where p.id = group_post_id and public.is_group_member(p.group_id)
    )
  );

create or replace function public.set_group_comment_edited_at()
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

drop trigger if exists group_comments_set_edited_at on public.group_comments;
create trigger group_comments_set_edited_at
  before update on public.group_comments
  for each row execute function public.set_group_comment_edited_at();

create or replace function public.enforce_group_comment_edit_rules()
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

drop trigger if exists group_comments_enforce_edit_rules on public.group_comments;
create trigger group_comments_enforce_edit_rules
  before update on public.group_comments
  for each row execute function public.enforce_group_comment_edit_rules();

create table if not exists public.group_comment_revisions (
  id uuid primary key default gen_random_uuid(),
  group_comment_id uuid not null references public.group_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists group_comment_revisions_comment_id_idx
  on public.group_comment_revisions (group_comment_id, created_at);

alter table public.group_comment_revisions enable row level security;

drop policy if exists "admins read group comment revisions" on public.group_comment_revisions;
create policy "admins read group comment revisions"
  on public.group_comment_revisions for select
  to authenticated
  using (public.is_admin());

create or replace function public.archive_group_comment_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.body is distinct from old.body then
    insert into public.group_comment_revisions (group_comment_id, body)
    values (old.id, old.body);
  end if;
  return new;
end;
$$;

drop trigger if exists group_comments_archive_revision on public.group_comments;
create trigger group_comments_archive_revision
  before update on public.group_comments
  for each row execute function public.archive_group_comment_revision();
