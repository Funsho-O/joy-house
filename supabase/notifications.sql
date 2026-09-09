-- Run this if Joy House already exists and you need in-app notification badges.
-- New projects can skip this file; the same statements are in schema.sql.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('post_reply', 'comment_reply', 'post_like')),
  post_id uuid not null references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

grant select, update on public.notifications to authenticated;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications for select
  to authenticated
  using (recipient_id = auth.uid() and public.is_verified());

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
  on public.notifications for update
  to authenticated
  using (recipient_id = auth.uid() and public.is_verified())
  with check (recipient_id = auth.uid() and public.is_verified());

create or replace function public.guard_notification_update()
returns trigger
language plpgsql
as $$
begin
  if new.recipient_id is distinct from old.recipient_id
    or new.actor_id is distinct from old.actor_id
    or new.kind is distinct from old.kind
    or new.post_id is distinct from old.post_id
    or new.comment_id is distinct from old.comment_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update
  before update on public.notifications
  for each row execute function public.guard_notification_update();

create or replace function public.insert_notification(
  p_recipient uuid,
  p_actor uuid,
  p_kind text,
  p_post_id uuid,
  p_comment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_actor is null or p_post_id is null then
    return;
  end if;
  if p_recipient = p_actor then
    return;
  end if;

  insert into public.notifications (recipient_id, actor_id, kind, post_id, comment_id)
  values (p_recipient, p_actor, p_kind, p_post_id, p_comment_id);
end;
$$;

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
  kind text;
begin
  if new.parent_id is null then
    select author_id into recipient from public.posts where id = new.post_id;
    kind := 'post_reply';
  else
    select author_id into recipient from public.comments where id = new.parent_id;
    kind := 'comment_reply';
  end if;

  perform public.insert_notification(recipient, new.author_id, kind, new.post_id, new.id);
  return new;
end;
$$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  select author_id into recipient from public.posts where id = new.post_id;
  perform public.insert_notification(recipient, new.user_id, 'post_like', new.post_id, null);
  return new;
end;
$$;

drop trigger if exists likes_notify on public.likes;
create trigger likes_notify
  after insert on public.likes
  for each row execute function public.notify_on_like();

create or replace function public.notify_on_unlike()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where actor_id = old.user_id
    and post_id = old.post_id
    and kind = 'post_like'
    and read_at is null;
  return old;
end;
$$;

drop trigger if exists likes_notify_unlike on public.likes;
create trigger likes_notify_unlike
  after delete on public.likes
  for each row execute function public.notify_on_unlike();

revoke all on function public.insert_notification(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.notify_on_comment() from public;
revoke all on function public.notify_on_like() from public;
revoke all on function public.notify_on_unlike() from public;
