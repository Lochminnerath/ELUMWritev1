-- Every Auth account gets a profile, even one that was made without it.
\set ON_ERROR_STOP on
\set QUIET on

\set old '00000000-0000-0000-0000-00000000003a'
\set fresh '00000000-0000-0000-0000-00000000003b'

-- An account made while the profile trigger was missing.
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (:'old', 'Lee@Example.org', now(), '{}');
alter table auth.users enable trigger on_auth_user_created;
select expect((select count(*) from profiles where id = :'old') = 0, 'starts without a profile');

-- Signed in, the app asks for one.
select set_config('request.jwt.claim.sub', :'old', false);
set role authenticated;
select elum_ensure_profile();
select expect((select name from profiles where id = auth.uid()) = 'Lee', 'gets a profile named from the email');
select expect((select email from profiles where id = auth.uid()) = 'Lee@Example.org', 'with the sign-in email');
select elum_ensure_profile();
select expect((select count(*) from profiles where id = auth.uid()) = 1, 'asking twice changes nothing');
reset role;
select expect((select kind from elum.addresses where address = 'lee@example.org') = 'login', 'and the sign-in address is in the address book');

-- Signed out, nothing happens.
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select expect_error($$select elum_ensure_profile()$$, '42501', 'only for signed-in people');
reset role;

-- A normal sign-up still gets its profile from the trigger, named from sign-up.
insert into auth.users (id, email, raw_user_meta_data) values (:'fresh', 'new@example.org', '{"name": "New Person"}');
select expect((select name from profiles where id = :'fresh') = 'New Person', 'sign-ups get a profile straight away');

\echo 'Profile checks passed.'
