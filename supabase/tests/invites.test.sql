-- Account types, sharing by email, invites and the share email queue.
-- Runs after rls.test.sql on the same database (see run.sh).
\set ON_ERROR_STOP on
\set QUIET on

\set owner '00000000-0000-0000-0000-00000000001a'
\set ally  '00000000-0000-0000-0000-00000000001b'
\set doc   '10000000-0000-0000-0000-000000000011'

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:'owner', 'ines@example.org', now(), '{"name": "Ines Owner"}'),
  (:'ally', 'al@example.org', now(), '{"name": "Al Ally"}');
select expect((select account_type from profiles where id = :'owner') = 'external', 'accounts default to their own provider');

select set_config('request.jwt.claim.sub', :'owner', false);
set role authenticated;
insert into documents (id, title) values (:'doc', 'Invites');

-- An address with an account is shared with directly.
select expect((select share_by_email(:'doc', '  AL@Example.org ', 'commenter') ->> 'kind') = 'share', 'existing accounts are shared with directly');
select expect((select role from document_shares where doc_id = :'doc' and user_id = :'ally') = 'commenter', 'with the chosen role');
-- An address without one gets an invite.
select expect((select share_by_email(:'doc', 'New.Person@Example.org', 'viewer') ->> 'email') = 'new.person@example.org', 'unknown addresses get an invite');
select expect((select share_by_email(:'doc', 'new.person@example.org', 'editor') ->> 'kind') = 'invite', 'inviting again changes the role');
select expect((select role from document_invites where doc_id = :'doc') = 'editor', 'one invite per address');
select expect_error(format($$select share_by_email(%L, 'not an email', 'viewer')$$, :'doc'), 'PT400', 'addresses must be valid');
select expect_error(format($$select share_by_email(%L, 'ines@example.org', 'viewer')$$, :'doc'), 'PT400', 'the owner cannot be invited');
select expect_error(format($$insert into document_invites (doc_id, email, role) values (%L, 'x@example.org', 'viewer')$$, :'doc'), '42501', 'invites only through share_by_email');
reset role;

-- Commenters see invites but cannot send them.
select set_config('request.jwt.claim.sub', :'ally', false);
set role authenticated;
select expect((select count(*) from document_invites) = 1, 'people with access see pending invites');
select expect_error(format($$select share_by_email(%L, 'z@example.org', 'viewer')$$, :'doc'), 'PT403', 'commenters cannot invite');
delete from document_invites where doc_id = :'doc';
select expect_error($$select * from share_emails$$, '42501', 'the email queue is server-only');
reset role;
select expect((select count(*) from document_invites) = 1, 'commenters cannot cancel invites');

-- Emails were queued for the share and the invite, not for the role change.
select expect((select count(*) from share_emails where doc_id = :'doc') = 2, 'one email per new share or invite');
select expect((select kind from share_emails where to_email = 'new.person@example.org') = 'invited', 'invite email');

-- Signing up does not claim the invite until the address is verified.
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000001c', 'new.person@example.org', '{"name": "Nia New"}');
select expect(not exists (select 1 from document_shares where user_id = '00000000-0000-0000-0000-00000000001c'), 'unverified addresses claim nothing');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000001c';
select expect((select role from document_shares where user_id = '00000000-0000-0000-0000-00000000001c') = 'editor', 'verifying the address turns the invite into access');
select expect(not exists (select 1 from document_invites where doc_id = :'doc'), 'the invite is used up');
select expect((select count(*) from share_emails where doc_id = :'doc') = 2, 'claiming does not email again');

-- A changed email that is confirmed also claims invites, keeping the higher role.
select set_config('request.jwt.claim.sub', :'owner', false);
set role authenticated;
select share_by_email(:'doc', 'al.new@example.org', 'editor');
reset role;
update auth.users set email = 'al.new@example.org' where id = :'ally';
select expect((select role from document_shares where doc_id = :'doc' and user_id = :'ally') = 'editor', 'a confirmed new address upgrades access');

\echo 'Invite checks passed.'
