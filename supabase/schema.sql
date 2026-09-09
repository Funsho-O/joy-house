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
  id uuid primary key,
  display_name text not null,
  avatar_url text,
  role public.user_role not null default 'member',
  push_enabled boolean not null default true,
  date_of_birth date,
  celebrate_birthday boolean not null default false,
  deactivated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null default '',
  category public.post_category not null default 'General',
  author_id uuid not null references public.profiles(id) on delete restrict,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  like_count integer not null default 0,
  is_pinned boolean not null default false,
  image_url text,
  edited_at timestamptz,
  reached_trending boolean not null default false,
  is_birthday boolean not null default false
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  edited_at timestamptz
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
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and p.deactivated_at is null
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
      and deactivated_at is null
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
  if new.is_birthday then
    return new;
  end if;

  select count(*) into post_count
  from public.posts
  where author_id = new.author_id
    and created_at > now() - interval '1 hour'
    and not coalesce(is_birthday, false);

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

alter table public.post_revisions enable row level security;
alter table public.comment_revisions enable row level security;

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
  end as admin_author_id,
  p.image_url,
  p.edited_at,
  p.is_birthday
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
  with check (
    author_id = auth.uid()
    and public.is_verified()
    and coalesce(is_birthday, false) = false
  );

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

drop policy if exists "admins update any comment" on public.comments;

drop policy if exists "admins delete any comment" on public.comments;
create policy "admins delete any comment"
  on public.comments for delete
  to authenticated
  using (public.is_admin());

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

-- Post photos (optional, one per post). Full copy also lives in post-images.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post images are publicly readable" on storage.objects;
create policy "post images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'post-images');

drop policy if exists "verified members upload own post image" on storage.objects;
create policy "verified members upload own post image"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_verified()
  );

drop policy if exists "verified members update own post image" on storage.objects;
create policy "verified members update own post image"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_verified()
  )
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_verified()
  );

drop policy if exists "verified members delete own post image" on storage.objects;
create policy "verified members delete own post image"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_verified()
  );

drop policy if exists "admins delete any post image" on storage.objects;
create policy "admins delete any post image"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-images' and public.is_admin());

-- Groups (private feeds). Full copy also lives in groups.sql for existing projects.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists groups_name_unique
  on public.groups (lower(trim(name)));

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null default '',
  created_at timestamptz not null default now(),
  like_count integer not null default 0,
  edited_at timestamptz
);

create table if not exists public.group_comments (
  id uuid primary key default gen_random_uuid(),
  group_post_id uuid not null references public.group_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  parent_id uuid references public.group_comments(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.group_likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  group_post_id uuid not null references public.group_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, group_post_id)
);

create index if not exists group_members_user_id_idx on public.group_members (user_id);
create index if not exists group_posts_group_created_idx on public.group_posts (group_id, created_at desc);
create index if not exists group_comments_post_id_idx on public.group_comments (group_post_id, created_at);
create index if not exists group_comments_parent_id_idx on public.group_comments (parent_id);
create index if not exists group_likes_post_created_idx on public.group_likes (group_post_id, created_at desc);

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = gid
      and user_id = auth.uid()
  );
$$;

create or replace function public.sync_group_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.group_posts set like_count = like_count + 1 where id = new.group_post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.group_posts set like_count = greatest(like_count - 1, 0) where id = old.group_post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists group_likes_sync_count on public.group_likes;
create trigger group_likes_sync_count
  after insert or delete on public.group_likes
  for each row execute function public.sync_group_like_count();

create or replace function public.enforce_group_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_count integer;
begin
  select count(*) into post_count
  from public.group_posts
  where author_id = new.author_id
    and created_at > now() - interval '1 hour';

  if post_count >= 5 then
    raise exception 'Rate limit: you can post at most 5 times per hour';
  end if;
  return new;
end;
$$;

drop trigger if exists group_posts_rate_limit on public.group_posts;
create trigger group_posts_rate_limit
  before insert on public.group_posts
  for each row execute function public.enforce_group_post_rate_limit();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_posts enable row level security;
alter table public.group_comments enable row level security;
alter table public.group_likes enable row level security;

drop policy if exists "members read own groups" on public.groups;
create policy "members read own groups"
  on public.groups for select
  to authenticated
  using (public.is_verified() and (public.is_group_member(id) or public.is_admin()));

drop policy if exists "admins insert groups" on public.groups;
create policy "admins insert groups"
  on public.groups for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins update groups" on public.groups;
create policy "admins update groups"
  on public.groups for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins delete groups" on public.groups;
create policy "admins delete groups"
  on public.groups for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "members read own memberships" on public.group_members;
create policy "members read own memberships"
  on public.group_members for select
  to authenticated
  using (public.is_verified() and (user_id = auth.uid() or public.is_admin()));

drop policy if exists "admins insert memberships" on public.group_members;
create policy "admins insert memberships"
  on public.group_members for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "admins delete memberships" on public.group_members;
create policy "admins delete memberships"
  on public.group_members for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "members read group posts" on public.group_posts;
create policy "members read group posts"
  on public.group_posts for select
  to authenticated
  using (public.is_verified() and public.is_group_member(group_id));

drop policy if exists "members insert group posts" on public.group_posts;
create policy "members insert group posts"
  on public.group_posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_verified()
    and public.is_group_member(group_id)
  );

drop policy if exists "authors update own group posts" on public.group_posts;
create policy "authors update own group posts"
  on public.group_posts for update
  to authenticated
  using (author_id = auth.uid() and public.is_verified() and public.is_group_member(group_id))
  with check (author_id = auth.uid() and public.is_verified() and public.is_group_member(group_id));

drop policy if exists "authors delete own group posts" on public.group_posts;
create policy "authors delete own group posts"
  on public.group_posts for delete
  to authenticated
  using (author_id = auth.uid() and public.is_verified() and public.is_group_member(group_id));

drop policy if exists "admins delete any group post" on public.group_posts;
create policy "admins delete any group post"
  on public.group_posts for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "members read group comments" on public.group_comments;
create policy "members read group comments"
  on public.group_comments for select
  to authenticated
  using (
    public.is_verified()
    and exists (
      select 1 from public.group_posts p
      where p.id = group_post_id and public.is_group_member(p.group_id)
    )
  );

drop policy if exists "members insert group comments" on public.group_comments;
create policy "members insert group comments"
  on public.group_comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_verified()
    and exists (
      select 1 from public.group_posts p
      where p.id = group_post_id and public.is_group_member(p.group_id)
    )
  );

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

drop policy if exists "authors delete own group comments" on public.group_comments;
create policy "authors delete own group comments"
  on public.group_comments for delete
  to authenticated
  using (author_id = auth.uid() and public.is_verified());

drop policy if exists "admins delete any group comment" on public.group_comments;
create policy "admins delete any group comment"
  on public.group_comments for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "members read group likes" on public.group_likes;
create policy "members read group likes"
  on public.group_likes for select
  to authenticated
  using (
    public.is_verified()
    and exists (
      select 1 from public.group_posts p
      where p.id = group_post_id and public.is_group_member(p.group_id)
    )
  );

drop policy if exists "members insert own group likes" on public.group_likes;
create policy "members insert own group likes"
  on public.group_likes for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_verified()
    and exists (
      select 1 from public.group_posts p
      where p.id = group_post_id and public.is_group_member(p.group_id)
    )
  );

drop policy if exists "users delete own group likes" on public.group_likes;
create policy "users delete own group likes"
  on public.group_likes for delete
  to authenticated
  using (user_id = auth.uid() and public.is_verified());

alter table public.group_posts
  add column if not exists edited_at timestamptz;

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

alter table public.group_comments
  add column if not exists edited_at timestamptz;

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

insert into public.groups (name, description)
select v.name, v.description
from (
  values
    ('Youth Leadership', 'Private space for youth leaders to plan, pray, and coordinate.'),
    ('Choir', 'Private space for choir members to share rehearsals, songs, and updates.')
) as v(name, description)
where not exists (
  select 1 from public.groups g
  where lower(trim(g.name)) = lower(trim(v.name))
);

-- Web Push subscriptions. Full copy also lives in push-notifications.sql.
alter table public.profiles
  add column if not exists push_enabled boolean not null default true;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "users read own push subscriptions" on public.push_subscriptions;
create policy "users read own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = auth.uid() and public.is_verified());

drop policy if exists "users insert own push subscriptions" on public.push_subscriptions;
create policy "users insert own push subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid() and public.is_verified());

drop policy if exists "users update own push subscriptions" on public.push_subscriptions;
create policy "users update own push subscriptions"
  on public.push_subscriptions for update
  to authenticated
  using (user_id = auth.uid() and public.is_verified())
  with check (user_id = auth.uid() and public.is_verified());

drop policy if exists "users delete own push subscriptions" on public.push_subscriptions;
create policy "users delete own push subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid() and public.is_verified());

create or replace function public.upsert_push_subscription(
  target_endpoint text,
  target_p256dh text,
  target_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_verified() then
    raise exception 'Not allowed';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), target_endpoint, target_p256dh, target_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end;
$$;

create or replace function public.get_push_subscriptions(target_user_id uuid)
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  where s.user_id = target_user_id
    and p.push_enabled = true
    and public.is_verified();
$$;

create or replace function public.delete_stale_push_subscription(target_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions
  where endpoint = target_endpoint;
$$;

revoke all on function public.upsert_push_subscription(text, text, text) from public;
revoke all on function public.get_push_subscriptions(uuid) from public;
revoke all on function public.delete_stale_push_subscription(text) from public;

grant execute on function public.upsert_push_subscription(text, text, text) to authenticated;
grant execute on function public.get_push_subscriptions(uuid) to authenticated;
grant execute on function public.delete_stale_push_subscription(text) to authenticated;

-- Leaderboard, badges, admin activity. Full copy also lives in activity.sql.
alter table public.posts
  add column if not exists reached_trending boolean not null default false;

create table if not exists public.badge_awards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null check (
    badge_id in (
      'first_post',
      'prayer_warrior',
      'encourager',
      'trending',
      'faithful',
      'most_loved'
    )
  ),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists badge_awards_user_id_idx on public.badge_awards (user_id);

alter table public.badge_awards enable row level security;

grant select on public.badge_awards to authenticated;

drop policy if exists "verified members read badge awards" on public.badge_awards;
create policy "verified members read badge awards"
  on public.badge_awards for select
  to authenticated
  using (public.is_verified());

create or replace function public.award_badge(target uuid, badge text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.badge_awards (user_id, badge_id)
  values (target, badge)
  on conflict (user_id, badge_id) do nothing;
$$;

create or replace function public.refresh_badges_for_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  post_n integer;
  prayer_n integer;
  comment_n integer;
  like_n integer;
  streak integer;
begin
  select count(*) into post_n from public.posts where author_id = target;
  if post_n >= 1 then
    perform public.award_badge(target, 'first_post');
  end if;

  select count(*) into prayer_n
  from public.posts
  where author_id = target and category = 'Prayer';
  if prayer_n >= 5 then
    perform public.award_badge(target, 'prayer_warrior');
  end if;

  select count(*) into comment_n from public.comments where author_id = target;
  if comment_n >= 10 then
    perform public.award_badge(target, 'encourager');
  end if;

  if exists (
    select 1 from public.posts
    where author_id = target and reached_trending
  ) then
    perform public.award_badge(target, 'trending');
  end if;

  select count(*) into like_n
  from public.likes l
  join public.posts p on p.id = l.post_id
  where p.author_id = target;
  if like_n >= 20 then
    perform public.award_badge(target, 'most_loved');
  end if;

  with weeks as (
    select distinct
      date_trunc('week', timezone('Africa/Johannesburg', created_at))::date as wk
    from public.posts
    where author_id = target
  ),
  numbered as (
    select wk, wk - ((row_number() over (order by wk))::int * 7) as grp
    from weeks
  )
  select coalesce(max(cnt), 0) into streak
  from (select count(*) as cnt from numbered group by grp) s;

  if streak >= 4 then
    perform public.award_badge(target, 'faithful');
  end if;
end;
$$;

create or replace function public.badges_after_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_birthday then
    return new;
  end if;
  perform public.refresh_badges_for_user(new.author_id);
  return new;
end;
$$;

drop trigger if exists posts_refresh_badges on public.posts;
create trigger posts_refresh_badges
  after insert on public.posts
  for each row execute function public.badges_after_post();

create or replace function public.badges_after_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_badges_for_user(new.author_id);
  return new;
end;
$$;

drop trigger if exists comments_refresh_badges on public.comments;
create trigger comments_refresh_badges
  after insert on public.comments
  for each row execute function public.badges_after_comment();

create or replace function public.badges_after_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  recent integer;
begin
  select author_id into author from public.posts where id = new.post_id;
  if author is null then
    return new;
  end if;

  select count(*) into recent
  from public.likes
  where post_id = new.post_id
    and created_at >= now() - interval '24 hours';

  if recent >= 3 then
    update public.posts
    set reached_trending = true
    where id = new.post_id and not reached_trending;
  end if;

  perform public.refresh_badges_for_user(author);
  return new;
end;
$$;

drop trigger if exists likes_refresh_badges on public.likes;
create trigger likes_refresh_badges
  after insert on public.likes
  for each row execute function public.badges_after_like();

create or replace function public.community_scores(p_period text default 'all')
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  post_count bigint,
  comment_count bigint,
  like_count bigint,
  score bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since_at timestamptz;
begin
  if not public.is_verified() then
    raise exception 'Not allowed';
  end if;

  if p_period = 'week' then
    since_at := date_trunc('week', timezone('Africa/Johannesburg', now()))
      at time zone 'Africa/Johannesburg';
  else
    since_at := null;
  end if;

  return query
  select
    pr.id,
    pr.display_name,
    pr.avatar_url,
    coalesce(po.cnt, 0),
    coalesce(cm.cnt, 0),
    coalesce(lk.cnt, 0),
    coalesce(po.cnt, 0) + coalesce(cm.cnt, 0) + coalesce(lk.cnt, 0)
  from public.profiles pr
  left join (
    select p.author_id, count(*)::bigint as cnt
    from public.posts p
    where not p.is_anonymous
      and not coalesce(p.is_birthday, false)
      and (since_at is null or p.created_at >= since_at)
    group by p.author_id
  ) po on po.author_id = pr.id
  left join (
    select c.author_id, count(*)::bigint as cnt
    from public.comments c
    where since_at is null or c.created_at >= since_at
    group by c.author_id
  ) cm on cm.author_id = pr.id
  left join (
    select p.author_id, count(*)::bigint as cnt
    from public.likes l
    join public.posts p on p.id = l.post_id
    where not p.is_anonymous
      and not coalesce(p.is_birthday, false)
      and (since_at is null or l.created_at >= since_at)
    group by p.author_id
  ) lk on lk.author_id = pr.id
  where coalesce(po.cnt, 0) + coalesce(cm.cnt, 0) + coalesce(lk.cnt, 0) > 0
    and pr.deactivated_at is null
  order by 7 desc, pr.display_name asc;
end;
$$;

create or replace function public.admin_member_activity()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  post_count bigint,
  comment_count bigint,
  like_count bigint,
  last_post_at timestamptz,
  last_active_at timestamptz,
  member_since timestamptz,
  needs_follow_up boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    pr.id,
    pr.display_name,
    pr.avatar_url,
    coalesce(po.cnt, 0),
    coalesce(cm.cnt, 0),
    coalesce(lk.cnt, 0),
    po.last_at,
    greatest(po.last_at, cm.last_at, lg.last_at),
    pr.created_at,
    (
      pr.created_at < now() - interval '14 days'
      and (po.last_at is null or po.last_at < now() - interval '14 days')
    )
  from public.profiles pr
  left join (
    select p.author_id, count(*)::bigint as cnt, max(p.created_at) as last_at
    from public.posts p
    group by p.author_id
  ) po on po.author_id = pr.id
  left join (
    select c.author_id, count(*)::bigint as cnt, max(c.created_at) as last_at
    from public.comments c
    group by c.author_id
  ) cm on cm.author_id = pr.id
  left join (
    select p.author_id, count(*)::bigint as cnt
    from public.likes l
    join public.posts p on p.id = l.post_id
    group by p.author_id
  ) lk on lk.author_id = pr.id
  left join (
    select l.user_id, max(l.created_at) as last_at
    from public.likes l
    group by l.user_id
  ) lg on lg.user_id = pr.id
  where pr.deactivated_at is null
  order by
    (
      pr.created_at < now() - interval '14 days'
      and (po.last_at is null or po.last_at < now() - interval '14 days')
    ) desc,
    greatest(po.last_at, cm.last_at, lg.last_at) asc nulls first,
    pr.display_name asc;
end;
$$;

create or replace function public.admin_weekly_engagement()
returns table (
  week_start date,
  post_count bigint,
  comment_count bigint,
  like_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  first_week date;
  this_week date;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  this_week := date_trunc('week', timezone('Africa/Johannesburg', now()))::date;
  first_week := this_week - 49;

  return query
  with weeks as (
    select generate_series(first_week, this_week, interval '7 days')::date as week_start
  ),
  posts_w as (
    select date_trunc('week', timezone('Africa/Johannesburg', p.created_at))::date as week_start,
           count(*)::bigint as cnt
    from public.posts p
    where p.created_at >= first_week::timestamp at time zone 'Africa/Johannesburg'
    group by 1
  ),
  comments_w as (
    select date_trunc('week', timezone('Africa/Johannesburg', c.created_at))::date as week_start,
           count(*)::bigint as cnt
    from public.comments c
    where c.created_at >= first_week::timestamp at time zone 'Africa/Johannesburg'
    group by 1
  ),
  likes_w as (
    select date_trunc('week', timezone('Africa/Johannesburg', l.created_at))::date as week_start,
           count(*)::bigint as cnt
    from public.likes l
    where l.created_at >= first_week::timestamp at time zone 'Africa/Johannesburg'
    group by 1
  )
  select
    w.week_start,
    coalesce(pw.cnt, 0),
    coalesce(cw.cnt, 0),
    coalesce(lw.cnt, 0)
  from weeks w
  left join posts_w pw on pw.week_start = w.week_start
  left join comments_w cw on cw.week_start = w.week_start
  left join likes_w lw on lw.week_start = w.week_start
  order by w.week_start;
end;
$$;

revoke all on function public.award_badge(uuid, text) from public;
revoke all on function public.refresh_badges_for_user(uuid) from public;
revoke all on function public.community_scores(text) from public;
revoke all on function public.admin_member_activity() from public;
revoke all on function public.admin_weekly_engagement() from public;

grant execute on function public.community_scores(text) to authenticated;
grant execute on function public.admin_member_activity() to authenticated;
grant execute on function public.admin_weekly_engagement() to authenticated;

update public.posts
set reached_trending = true
where like_count >= 3 and not reached_trending;

select public.refresh_badges_for_user(id) from public.profiles;

-- Birthday celebrations. Full copy also lives in birthdays.sql.
alter table public.profiles
  add column if not exists date_of_birth date;

alter table public.profiles
  add column if not exists celebrate_birthday boolean not null default false;

alter table public.posts
  add column if not exists is_birthday boolean not null default false;

create table if not exists public.birthday_alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  year integer not null,
  created_at timestamptz not null default now(),
  unique (profile_id, year)
);

create index if not exists birthday_alerts_created_idx
  on public.birthday_alerts (created_at desc);

alter table public.birthday_alerts enable row level security;

grant select, delete on public.birthday_alerts to authenticated;

drop policy if exists "admins read birthday alerts" on public.birthday_alerts;
create policy "admins read birthday alerts"
  on public.birthday_alerts for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins delete birthday alerts" on public.birthday_alerts;
create policy "admins delete birthday alerts"
  on public.birthday_alerts for delete
  to authenticated
  using (public.is_admin());

create or replace function public.is_birthday_on(dob date, on_day date)
returns boolean
language sql
immutable
as $$
  select
    dob is not null
    and (
      (extract(month from dob) = extract(month from on_day)
        and extract(day from dob) = extract(day from on_day))
      or (
        extract(month from dob) = 2
        and extract(day from dob) = 29
        and extract(month from on_day) = 3
        and extract(day from on_day) = 1
        and not (
          (extract(year from on_day)::int % 4 = 0 and extract(year from on_day)::int % 100 <> 0)
          or extract(year from on_day)::int % 400 = 0
        )
      )
    );
$$;

create or replace function public.run_birthday_celebrations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date;
  this_year integer;
  person record;
  posted integer := 0;
  alerted integer := 0;
  already boolean;
  inserted integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed';
  end if;

  today := timezone('Africa/Johannesburg', now())::date;
  this_year := extract(year from today)::int;

  for person in
    select p.id, p.display_name, p.celebrate_birthday
    from public.profiles p
    where public.is_birthday_on(p.date_of_birth, today)
  loop
    if person.celebrate_birthday then
      select exists (
        select 1
        from public.posts po
        where po.is_birthday
          and po.author_id = person.id
          and extract(year from timezone('Africa/Johannesburg', po.created_at))::int = this_year
      ) into already;

      if not already then
        insert into public.posts (title, body, category, author_id, is_anonymous, is_birthday)
        values (
          'Happy birthday, ' || person.display_name || '!',
          'Joy House is celebrating ' || person.display_name ||
            ' today. Leave a comment to wish them a blessed year ahead.',
          'Events',
          person.id,
          false,
          true
        );
        posted := posted + 1;
      end if;
    else
      insert into public.birthday_alerts (profile_id, year)
      values (person.id, this_year)
      on conflict (profile_id, year) do nothing;
      get diagnostics inserted = row_count;
      if inserted > 0 then
        alerted := alerted + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('posted', posted, 'alerted', alerted, 'date', today);
end;
$$;

revoke all on function public.run_birthday_celebrations() from public;
grant execute on function public.run_birthday_celebrations() to anon, authenticated;
grant execute on function public.is_birthday_on(date, date) to authenticated;

do $$
begin
  create extension if not exists pg_cron;
  begin
    perform cron.unschedule('joy-house-birthdays');
  exception when others then
    null;
  end;
  perform cron.schedule(
    'joy-house-birthdays',
    '0 4 * * *',
    $cron$select public.run_birthday_celebrations();$cron$
  );
exception when others then
  raise notice 'pg_cron is not available. Use the Vercel daily cron instead.';
end $$;

-- First admin: after you sign up, run:
-- update public.profiles set role = 'admin' where id = '<your-user-uuid>';

-- Soft-delete accounts. Full copy also lives in soft-delete-accounts.sql.
-- Run this if Joy House already exists. New projects can skip this file;
-- the same statements are in schema.sql.
--
-- Before this change, deleting a user in Authentication (or deleting their
-- profile row) cascade-deleted their posts, comments, likes, and group posts.
-- Accounts are now deactivated instead: the profile stays as "Former Member"
-- and all posts/comments remain.

alter table public.profiles
  add column if not exists deactivated_at timestamptz;

-- Let Auth users be deleted without wiping the profile row.
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

-- Keep authored content if a profile row is ever force-deleted.
do $$
declare
  r record;
  t text;
begin
  foreach t in array array['posts', 'comments', 'group_posts', 'group_comments']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    for r in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_attribute att on att.attrelid = rel.oid and att.attnum = any (con.conkey)
      where nsp.nspname = 'public'
        and rel.relname = t
        and att.attname = 'author_id'
        and con.contype = 'f'
    loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I foreign key (author_id) references public.profiles(id) on delete restrict',
      t,
      t || '_author_id_fkey'
    );
  end loop;
end $$;

create or replace function public.is_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and p.deactivated_at is null
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
      and deactivated_at is null
  );
$$;

create or replace function public.anonymise_profile(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_id is null then
    return;
  end if;

  update public.profiles
  set
    display_name = 'Former Member',
    avatar_url = null,
    role = 'member',
    push_enabled = false,
    date_of_birth = null,
    celebrate_birthday = false,
    deactivated_at = coalesce(deactivated_at, now())
  where id = target_id;

  begin
    delete from public.group_members where user_id = target_id;
  exception when undefined_table then
    null;
  end;

  begin
    delete from public.push_subscriptions where user_id = target_id;
  exception when undefined_table then
    null;
  end;
end;
$$;

create or replace function public.freeze_deactivated_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deactivated_at is not null then
    new.display_name := 'Former Member';
    new.avatar_url := null;
    new.role := 'member';
    new.push_enabled := false;
    new.date_of_birth := null;
    new.celebrate_birthday := false;
    new.deactivated_at := old.deactivated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists freeze_deactivated_profile on public.profiles;
create trigger freeze_deactivated_profile
  before update on public.profiles
  for each row execute function public.freeze_deactivated_profile();

create or replace function public.prevent_profile_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Profiles cannot be deleted. Deactivate the account so posts and comments stay on the feed.';
end;
$$;

drop trigger if exists prevent_profile_hard_delete on public.profiles;
create trigger prevent_profile_hard_delete
  before delete on public.profiles
  for each row execute function public.prevent_profile_hard_delete();

create or replace function public.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.anonymise_profile(old.id);
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_auth_user_deleted();

create or replace function public.deactivate_account(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  target_role public.user_role;
  already timestamptz;
  admin_count integer;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'Not allowed';
  end if;
  if target_id is null then
    raise exception 'Not allowed';
  end if;
  if target_id is distinct from actor and not public.is_admin() then
    raise exception 'Not allowed';
  end if;

  select role, deactivated_at into target_role, already
  from public.profiles
  where id = target_id;

  if not found then
    raise exception 'Profile not found.';
  end if;

  if already is not null then
    begin
      delete from auth.users where id = target_id;
    exception when others then
      null;
    end;
    return;
  end if;

  if target_role = 'admin' then
    select count(*) into admin_count
    from public.profiles
    where role = 'admin'
      and deactivated_at is null;
    if admin_count <= 1 then
      raise exception 'There must be at least one admin. Promote someone else first.';
    end if;
  end if;

  perform public.anonymise_profile(target_id);

  begin
    delete from auth.users where id = target_id;
  exception when others then
    raise notice 'Auth user could not be deleted. The profile is deactivated.';
  end;
end;
$$;

revoke all on function public.anonymise_profile(uuid) from public;
revoke all on function public.deactivate_account(uuid) from public;
grant execute on function public.deactivate_account(uuid) to authenticated;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create or replace function public.community_scores(p_period text default 'all')
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  post_count bigint,
  comment_count bigint,
  like_count bigint,
  score bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since_at timestamptz;
begin
  if not public.is_verified() then
    raise exception 'Not allowed';
  end if;

  if p_period = 'week' then
    since_at := date_trunc('week', timezone('Africa/Johannesburg', now()))
      at time zone 'Africa/Johannesburg';
  else
    since_at := null;
  end if;

  return query
  select
    pr.id,
    pr.display_name,
    pr.avatar_url,
    coalesce(po.cnt, 0),
    coalesce(cm.cnt, 0),
    coalesce(lk.cnt, 0),
    coalesce(po.cnt, 0) + coalesce(cm.cnt, 0) + coalesce(lk.cnt, 0)
  from public.profiles pr
  left join (
    select p.author_id, count(*)::bigint as cnt
    from public.posts p
    where not p.is_anonymous
      and not coalesce(p.is_birthday, false)
      and (since_at is null or p.created_at >= since_at)
    group by p.author_id
  ) po on po.author_id = pr.id
  left join (
    select c.author_id, count(*)::bigint as cnt
    from public.comments c
    where since_at is null or c.created_at >= since_at
    group by c.author_id
  ) cm on cm.author_id = pr.id
  left join (
    select p.author_id, count(*)::bigint as cnt
    from public.likes l
    join public.posts p on p.id = l.post_id
    where not p.is_anonymous
      and not coalesce(p.is_birthday, false)
      and (since_at is null or l.created_at >= since_at)
    group by p.author_id
  ) lk on lk.author_id = pr.id
  where coalesce(po.cnt, 0) + coalesce(cm.cnt, 0) + coalesce(lk.cnt, 0) > 0
    and pr.deactivated_at is null
  order by 7 desc, pr.display_name asc;
end;
$$;

create or replace function public.admin_member_activity()
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  post_count bigint,
  comment_count bigint,
  like_count bigint,
  last_post_at timestamptz,
  last_active_at timestamptz,
  member_since timestamptz,
  needs_follow_up boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    pr.id,
    pr.display_name,
    pr.avatar_url,
    coalesce(po.cnt, 0),
    coalesce(cm.cnt, 0),
    coalesce(lk.cnt, 0),
    po.last_at,
    greatest(po.last_at, cm.last_at, lg.last_at),
    pr.created_at,
    (
      pr.created_at < now() - interval '14 days'
      and (po.last_at is null or po.last_at < now() - interval '14 days')
    )
  from public.profiles pr
  left join (
    select p.author_id, count(*)::bigint as cnt, max(p.created_at) as last_at
    from public.posts p
    group by p.author_id
  ) po on po.author_id = pr.id
  left join (
    select c.author_id, count(*)::bigint as cnt, max(c.created_at) as last_at
    from public.comments c
    group by c.author_id
  ) cm on cm.author_id = pr.id
  left join (
    select p.author_id, count(*)::bigint as cnt
    from public.likes l
    join public.posts p on p.id = l.post_id
    group by p.author_id
  ) lk on lk.author_id = pr.id
  left join (
    select l.user_id, max(l.created_at) as last_at
    from public.likes l
    group by l.user_id
  ) lg on lg.user_id = pr.id
  where pr.deactivated_at is null
  order by
    (
      pr.created_at < now() - interval '14 days'
      and (po.last_at is null or po.last_at < now() - interval '14 days')
    ) desc,
    greatest(po.last_at, cm.last_at, lg.last_at) asc nulls first,
    pr.display_name asc;
end;
$$;

