-- Joy House schema, RLS, and triggers
-- Run this in the Supabase SQL editor (or via the CLI) after creating the project.

create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('member', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.post_category as enum ('Prayer', 'Bible Study', 'Events', 'General');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_target as enum ('post', 'comment');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role public.user_role not null default 'member',
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null default '',
  category public.post_category not null default 'General',
  author_id uuid not null references public.profiles(id) on delete cascade,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  like_count integer not null default 0,
  is_pinned boolean not null default false
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type public.report_target not null,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reported_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  constraint reports_target_chk check (
    (target_type = 'post' and post_id is not null and comment_id is null)
    or (target_type = 'comment' and comment_id is not null)
  )
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_category_idx on public.posts (category);
create index if not exists posts_pinned_idx on public.posts (is_pinned) where is_pinned;
create index if not exists comments_post_id_idx on public.comments (post_id, created_at);
create index if not exists comments_parent_id_idx on public.comments (parent_id);
create index if not exists likes_post_created_idx on public.likes (post_id, created_at desc);
create index if not exists reports_open_idx on public.reports (created_at desc) where not resolved;

-- Helpers
create or replace function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users
    where id = auth.uid()
      and email_confirmed_at is not null
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Auto-create a profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep like_count in sync
create or replace function public.sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists likes_sync_count on public.likes;
create trigger likes_sync_count
  after insert or delete on public.likes
  for each row execute function public.sync_like_count();

-- Max 5 posts per user per hour
create or replace function public.enforce_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_count integer;
begin
  select count(*) into post_count
  from public.posts
  where author_id = new.author_id
    and created_at > now() - interval '1 hour';

  if post_count >= 5 then
    raise exception 'Rate limit: you can post at most 5 times per hour';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function public.enforce_post_rate_limit();

-- Max 3 pinned posts
create or replace function public.enforce_pin_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pinned_count integer;
begin
  if new.is_pinned and (tg_op = 'INSERT' or old.is_pinned is distinct from true) then
    select count(*) into pinned_count from public.posts where is_pinned = true;
    if pinned_count >= 3 then
      raise exception 'At most 3 posts can be pinned';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_pin_limit on public.posts;
create trigger posts_pin_limit
  before insert or update on public.posts
  for each row execute function public.enforce_pin_limit();

-- Redact anonymous authors except for admins and the author
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
  end as admin_author_id
from public.posts p;

grant select on public.posts_visible to authenticated;

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.reports enable row level security;

drop policy if exists "verified members read profiles" on public.profiles;
create policy "verified members read profiles"
  on public.profiles for select
  to authenticated
  using (public.is_verified());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() and public.is_verified())
  with check (
    id = auth.uid()
    and public.is_verified()
    and role = (select role from public.profiles where id = auth.uid())
  );

drop policy if exists "admins update any profile" on public.profiles;
create policy "admins update any profile"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "verified members read posts" on public.posts;
create policy "verified members read posts"
  on public.posts for select
  to authenticated
  using (public.is_verified());

drop policy if exists "verified members insert own posts" on public.posts;
create policy "verified members insert own posts"
  on public.posts for insert
  to authenticated
  with check (author_id = auth.uid() and public.is_verified());

create or replace function public.prevent_non_admin_pin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and new.is_pinned is distinct from old.is_pinned then
    raise exception 'Only admins can pin or unpin posts';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_pin_admin_only on public.posts;
create trigger posts_pin_admin_only
  before update on public.posts
  for each row execute function public.prevent_non_admin_pin_change();

drop policy if exists "authors update own posts" on public.posts;
create policy "authors update own posts"
  on public.posts for update
  to authenticated
  using (author_id = auth.uid() and public.is_verified())
  with check (author_id = auth.uid() and public.is_verified());

drop policy if exists "admins update any post" on public.posts;
create policy "admins update any post"
  on public.posts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "authors delete own posts" on public.posts;
create policy "authors delete own posts"
  on public.posts for delete
  to authenticated
  using (author_id = auth.uid() and public.is_verified());

drop policy if exists "admins delete any post" on public.posts;
create policy "admins delete any post"
  on public.posts for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "verified members read comments" on public.comments;
create policy "verified members read comments"
  on public.comments for select
  to authenticated
  using (public.is_verified());

drop policy if exists "verified members insert comments" on public.comments;
create policy "verified members insert comments"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid() and public.is_verified());

drop policy if exists "authors update own comments" on public.comments;
create policy "authors update own comments"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid() and public.is_verified())
  with check (author_id = auth.uid() and public.is_verified());

drop policy if exists "authors delete own comments" on public.comments;
create policy "authors delete own comments"
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid() and public.is_verified());

drop policy if exists "admins delete any comment" on public.comments;
create policy "admins delete any comment"
  on public.comments for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "verified members read likes" on public.likes;
create policy "verified members read likes"
  on public.likes for select
  to authenticated
  using (public.is_verified());

drop policy if exists "verified members insert own likes" on public.likes;
create policy "verified members insert own likes"
  on public.likes for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_verified());

drop policy if exists "users delete own likes" on public.likes;
create policy "users delete own likes"
  on public.likes for delete
  to authenticated
  using (user_id = auth.uid() and public.is_verified());

drop policy if exists "members insert reports" on public.reports;
create policy "members insert reports"
  on public.reports for insert
  to authenticated
  with check (reported_by = auth.uid() and public.is_verified());

drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports"
  on public.reports for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins update reports" on public.reports;
create policy "admins update reports"
  on public.reports for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Avatar photos (optional). Public so feed cards can render them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "verified members upload own avatar" on storage.objects;
create policy "verified members upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_verified()
  );

drop policy if exists "verified members update own avatar" on storage.objects;
create policy "verified members update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_verified()
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_verified()
  );

drop policy if exists "verified members delete own avatar" on storage.objects;
create policy "verified members delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_verified()
  );

-- First admin: after you sign up, run:
-- update public.profiles set role = 'admin' where id = '<your-user-uuid>';
