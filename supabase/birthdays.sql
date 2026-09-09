-- Run this if Joy House already exists and you need birthday celebrations.
-- New projects can skip this file; the same statements are in schema.sql.
-- Weeks and "today" use Africa/Johannesburg (Pretoria).

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

-- Append is_birthday. Do not insert it in the middle of existing view columns.
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

drop policy if exists "verified members insert own posts" on public.posts;
create policy "verified members insert own posts"
  on public.posts for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.is_verified()
    and coalesce(is_birthday, false) = false
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
  order by 7 desc, pr.display_name asc;
end;
$$;

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
