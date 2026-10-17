-- Settings that follow a person: only they can read or change them, and changes merge.
\set ON_ERROR_STOP on
\set QUIET on

\set me    '00000000-0000-0000-0000-00000000002a'
\set other '00000000-0000-0000-0000-00000000002b'

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:'me', 'pia@example.org', now(), '{"name": "Pia"}'),
  (:'other', 'olu@example.org', now(), '{"name": "Olu"}');

select set_config('request.jwt.claim.sub', :'me', false);
set role authenticated;
select expect((select count(*) from user_preferences) = 0, 'nothing stored until something changes');
select expect((select update_preferences('{"colors": ["#ff8800"], "spellcheck": true}') ->> 'spellcheck') = 'true', 'first change is stored');
select expect((select update_preferences('{"dictionary": ["ELUM"]}') -> 'colors' ->> 0) = '#ff8800', 'changes merge with what is there');
select expect((select preferences -> 'dictionary' ->> 0 from user_preferences) = 'ELUM', 'and can be read back');
select expect_error($$select update_preferences('[1]')$$, 'PT400', 'only objects');
select expect_error($$insert into user_preferences (preferences) values ('{}')$$, '42501', 'writes only through update_preferences');
select expect_error($$update user_preferences set preferences = '{}'$$, '42501', 'no direct updates');
reset role;

select set_config('request.jwt.claim.sub', :'other', false);
set role authenticated;
select expect((select count(*) from user_preferences) = 0, 'nobody else can read them');
select update_preferences('{"colors": []}');
reset role;
select expect((select preferences -> 'colors' ->> 0 from user_preferences where user_id = :'me') = '#ff8800', 'nobody else can change them');

set role anon;
select expect_error($$select update_preferences('{}')$$, '42501', 'signed-out visitors cannot save');
reset role;
\echo Preference checks passed.
