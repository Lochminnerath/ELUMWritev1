-- Every account in Supabase Auth has a profile, so it can sign in to every ELUM app.
--
-- The apps load public.profiles straight after Supabase Auth signs someone in. Accounts made
-- before the on_auth_user_created trigger existed (or while it was being replaced) had none, so
-- Auth accepted the password and the app then failed: "This document does not exist" in Write,
-- or straight back to the sign-in page. This gives those accounts a profile now, makes the
-- trigger safe to run twice, and lets an app create a missing profile for the person signed in.
-- Safe to run more than once.

-- The profile a new account gets: its name from sign-up, or the start of its email.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  colors text[] := array['#f59a52', '#3fc4a0', '#9b84ee', '#ec7fa9', '#e9b949', '#7093f8'];
begin
  insert into public.profiles (id, name, email, color)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'ELUM member'), 80),
    coalesce(new.email, ''),
    colors[1 + floor(random() * array_length(colors, 1))::int]
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Accounts that are in Auth but have no profile.
insert into public.profiles (id, name, email, color)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'ELUM member'), 80),
       coalesce(u.email, ''),
       (array['#f59a52', '#3fc4a0', '#9b84ee', '#ec7fa9', '#e9b949', '#7093f8'])[1 + floor(random() * 6)::int]
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Their sign-in address in the platform's address book, as the trigger would have added it.
insert into elum.addresses (address, account_id, kind, verified_at)
select lower(u.email), u.id, 'login', u.email_confirmed_at
from auth.users u
join public.profiles p on p.id = u.id
where u.email is not null and u.email <> ''
  and not exists (select 1 from elum.addresses a where a.address = lower(u.email))
on conflict (address) do nothing;

-- For the apps: makes sure the person signed in has a profile (and their sign-in address).
create or replace function public.elum_ensure_profile() returns void
language plpgsql security definer set search_path = public, elum as $$
declare
  v_user auth.users;
begin
  select * into v_user from auth.users where id = auth.uid();
  if v_user.id is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Sign in again.';
  end if;
  if exists (select 1 from public.profiles where id = v_user.id) then
    return;
  end if;
  insert into public.profiles (id, name, email, color)
  values (
    v_user.id,
    left(coalesce(nullif(btrim(v_user.raw_user_meta_data ->> 'name'), ''), nullif(split_part(coalesce(v_user.email, ''), '@', 1), ''), 'ELUM member'), 80),
    coalesce(v_user.email, ''),
    (array['#f59a52', '#3fc4a0', '#9b84ee', '#ec7fa9', '#e9b949', '#7093f8'])[1 + floor(random() * 6)::int]
  )
  on conflict (id) do nothing;
  if v_user.email is not null and v_user.email <> '' then
    insert into elum.addresses (address, account_id, kind, verified_at)
    values (lower(v_user.email), v_user.id, 'login', v_user.email_confirmed_at)
    on conflict (address) do nothing;
  end if;
end $$;

revoke all on function public.elum_ensure_profile() from public, anon;
grant execute on function public.elum_ensure_profile() to authenticated;
