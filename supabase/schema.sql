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
  push_enabled boolean not null default true,
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
  is_pinned boolean not null default false,
  image_url text,
  edited_at timestamptz
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(trim(body)) between 1 and 2000),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
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
  p.edited_at
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

drop policy if exists "admins update any comment" on public.comments;
create policy "admins update any comment"
  on public.comments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  body text not null default '',
  created_at timestamptz not null default now(),
  like_count integer not null default 0
);

create table if not exists public.group_comments (
  id uuid primary key default gen_random_uuid(),
  group_post_id uuid not null references public.group_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.group_comments(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
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

-- First admin: after you sign up, run:
-- update public.profiles set role = 'admin' where id = '<your-user-uuid>';
