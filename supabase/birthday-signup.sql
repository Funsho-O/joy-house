-- Run this if Joy House already exists and you need birthday fields on email signup.
-- New projects can skip this file; the same statements are in schema.sql.
-- Requires birthday columns on profiles (see birthdays.sql).
-- Does not change the 06:00 celebration job or Check today.

alter table public.profiles
  add column if not exists date_of_birth date;

alter table public.profiles
  add column if not exists celebrate_birthday boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dob date;
  celebrate boolean := false;
  dob_text text;
begin
  dob_text := nullif(trim(new.raw_user_meta_data->>'date_of_birth'), '');
  if dob_text is not null then
    begin
      dob := dob_text::date;
    exception when others then
      dob := null;
    end;
  end if;

  celebrate :=
    dob is not null
    and lower(coalesce(new.raw_user_meta_data->>'celebrate_birthday', 'false')) in ('true', 't', '1');

  insert into public.profiles (id, display_name, avatar_url, date_of_birth, celebrate_birthday)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url',
    dob,
    celebrate
  );
  return new;
end;
$$;
