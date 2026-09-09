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
