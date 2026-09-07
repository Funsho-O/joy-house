-- Joy House groups. Run this in the Supabase SQL editor if the app is already live.
-- New projects can skip this file; the same statements are in schema.sql.

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
