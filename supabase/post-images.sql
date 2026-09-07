-- Run this if Joy House is already set up and you only need post photos.
-- New projects can skip this file; the same statements are in schema.sql.

alter table public.posts
  add column if not exists image_url text;

-- CREATE OR REPLACE cannot insert a column in the middle of an existing view.
-- Append image_url after the original columns so author_id stays in place.
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
  p.image_url
from public.posts p;

grant select on public.posts_visible to authenticated;

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
