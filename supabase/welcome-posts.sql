-- Run this if Joy House already exists and you need welcome posts for new members.
-- New projects can skip this file; the same statements are in schema.sql.
-- Welcome posts are created immediately when a verified member opts in.
-- Cleanup of expired welcome (24h) and birthday (previous Pretoria day) posts
-- runs inside run_birthday_celebrations() (06:00 Pretoria / Check today).

alter table public.profiles
  add column if not exists announce_arrival boolean not null default false;

alter table public.posts
  add column if not exists is_welcome boolean not null default false;

create unique index if not exists posts_one_welcome_per_author
  on public.posts (author_id)
  where coalesce(is_welcome, false);

create index if not exists posts_welcome_created_idx
  on public.posts (created_at)
  where coalesce(is_welcome, false);

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
  p.is_birthday,
  p.is_welcome
from public.posts p;

grant select on public.posts_visible to authenticated;

drop policy if exists "verified members insert own posts" on public.posts;
create policy "verified members insert own posts"
  on public.posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_verified()
    and coalesce(is_birthday, false) = false
    and coalesce(is_welcome, false) = false
  );

drop policy if exists "authors delete own posts" on public.posts;
create policy "authors delete own posts"
  on public.posts for delete
  to authenticated
  using (
    author_id = auth.uid()
    and public.is_verified()
    and coalesce(is_birthday, false) = false
    and coalesce(is_welcome, false) = false
  );

create or replace function public.enforce_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_count integer;
begin
  if new.is_birthday or new.is_welcome then
    return new;
  end if;

  select count(*) into post_count
  from public.posts
  where author_id = new.author_id
    and created_at > now() - interval '1 hour'
    and not coalesce(is_birthday, false)
    and not coalesce(is_welcome, false);

  if post_count >= 5 then
    raise exception 'Rate limit: you can post at most 5 times per hour';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_post_edit_rules()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    if coalesce(old.is_birthday, false) or coalesce(old.is_welcome, false) then
      raise exception 'This post cannot be edited';
    end if;
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

create or replace function public.badges_after_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_birthday or new.is_welcome then
    return new;
  end if;
  perform public.refresh_badges_for_user(new.author_id);
  return new;
end;
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
  select count(*) into post_n
  from public.posts
  where author_id = target
    and not coalesce(is_birthday, false)
    and not coalesce(is_welcome, false);
  if post_n >= 1 then
    perform public.award_badge(target, 'first_post');
  end if;

  select count(*) into prayer_n
  from public.posts
  where author_id = target
    and category = 'Prayer'
    and not coalesce(is_birthday, false)
    and not coalesce(is_welcome, false);
  if prayer_n >= 5 then
    perform public.award_badge(target, 'prayer_warrior');
  end if;

  select count(*) into comment_n from public.comments where author_id = target;
  if comment_n >= 10 then
    perform public.award_badge(target, 'encourager');
  end if;

  if exists (
    select 1 from public.posts
    where author_id = target
      and reached_trending
      and not coalesce(is_birthday, false)
      and not coalesce(is_welcome, false)
  ) then
    perform public.award_badge(target, 'trending');
  end if;

  select count(*) into like_n
  from public.likes l
  join public.posts p on p.id = l.post_id
  where p.author_id = target
    and not coalesce(p.is_birthday, false)
    and not coalesce(p.is_welcome, false);
  if like_n >= 20 then
    perform public.award_badge(target, 'most_loved');
  end if;

  with weeks as (
    select distinct
      date_trunc('week', timezone('Africa/Johannesburg', created_at))::date as wk
    from public.posts
    where author_id = target
      and not coalesce(is_birthday, false)
      and not coalesce(is_welcome, false)
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
      and not coalesce(p.is_welcome, false)
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
      and not coalesce(p.is_welcome, false)
      and (since_at is null or l.created_at >= since_at)
    group by p.author_id
  ) lk on lk.author_id = pr.id
  where coalesce(po.cnt, 0) + coalesce(cm.cnt, 0) + coalesce(lk.cnt, 0) > 0
    and pr.deactivated_at is null
  order by 7 desc, pr.display_name asc;
end;
$$;

create or replace function public.announce_welcome_if_needed(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person record;
  already boolean;
  given_name text;
begin
  select p.id, p.display_name, p.announce_arrival, p.deactivated_at, p.created_at
  into person
  from public.profiles p
  where p.id = target;

  if person.id is null then
    return;
  end if;
  if not person.announce_arrival or person.deactivated_at is not null then
    return;
  end if;
  if person.created_at < now() - interval '14 days' then
    return;
  end if;
  if not exists (
    select 1
    from auth.users u
    where u.id = target
      and u.email_confirmed_at is not null
  ) then
    return;
  end if;

  select exists (
    select 1
    from public.posts po
    where po.is_welcome
      and po.author_id = target
  ) into already;
  if already then
    return;
  end if;

  given_name := nullif(split_part(trim(person.display_name), ' ', 1), '');
  if given_name is null then
    given_name := 'A new member';
  end if;

  begin
    insert into public.posts (title, body, category, author_id, is_anonymous, is_welcome)
    values (
      'Welcome, ' || given_name || '!',
      given_name || ' just joined Joy House! Say hello and make them feel at home!',
      'General',
      target,
      false,
      true
    );
  exception when unique_violation then
    null;
  end;
end;
$$;

create or replace function public.announce_welcome_on_preference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.announce_arrival and (tg_op = 'INSERT' or old.announce_arrival is distinct from true) then
    perform public.announce_welcome_if_needed(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_announce_welcome on public.profiles;
create trigger profiles_announce_welcome
  after insert or update of announce_arrival on public.profiles
  for each row execute function public.announce_welcome_on_preference();

create or replace function public.announce_welcome_on_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and (old.email_confirmed_at is null or old.email_confirmed_at is distinct from new.email_confirmed_at)
  then
    perform public.announce_welcome_if_needed(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_verified_welcome on auth.users;
create trigger on_auth_user_verified_welcome
  after update of email_confirmed_at on auth.users
  for each row execute function public.announce_welcome_on_verified();

create or replace function public.cleanup_expired_announcements()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  welcome_n integer := 0;
  birthday_n integer := 0;
begin
  delete from public.posts
  where coalesce(is_welcome, false)
    and created_at < now() - interval '24 hours';
  get diagnostics welcome_n = row_count;

  delete from public.posts
  where coalesce(is_birthday, false)
    and timezone('Africa/Johannesburg', created_at)::date
      < timezone('Africa/Johannesburg', now())::date;
  get diagnostics birthday_n = row_count;

  return jsonb_build_object('welcome_deleted', welcome_n, 'birthday_deleted', birthday_n);
end;
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
  cleaned jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed';
  end if;

  cleaned := public.cleanup_expired_announcements();

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
          'House of Joy is celebrating ' || person.display_name ||
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

  return jsonb_build_object('posted', posted, 'alerted', alerted, 'date', today) || cleaned;
end;
$$;

revoke all on function public.announce_welcome_if_needed(uuid) from public;
revoke all on function public.announce_welcome_on_preference() from public;
revoke all on function public.announce_welcome_on_verified() from public;
revoke all on function public.cleanup_expired_announcements() from public;
revoke all on function public.run_birthday_celebrations() from public;

grant execute on function public.run_birthday_celebrations() to anon, authenticated;
