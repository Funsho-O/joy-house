-- Run this if Joy House is already set up and you only need Web Push.
-- New projects can skip this file; the same statements are in schema.sql.

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
