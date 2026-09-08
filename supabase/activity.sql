-- Run this if Joy House already exists and you need the leaderboard, badges,
-- and admin activity dashboard. New projects can skip this file; the same
-- statements are in schema.sql.

-- Weeks are Monday–Sunday in Africa/Johannesburg (Pretoria).

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
      'most_liked'
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
    perform public.award_badge(target, 'most_liked');
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

-- Public leaderboard. Only named posts and likes on named posts count.
-- Anonymous posts stay fully private and add nothing to the score.
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
      and (since_at is null or l.created_at >= since_at)
    group by p.author_id
  ) lk on lk.author_id = pr.id
  where coalesce(po.cnt, 0) + coalesce(cm.cnt, 0) + coalesce(lk.cnt, 0) > 0
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
