-- Checks the migration's rules by acting as each kind of person.
-- Run with supabase/tests/run.sh. Any failed check stops with an error.
\set ON_ERROR_STOP on
\set QUIET on

\set owner     '00000000-0000-0000-0000-00000000000a'
\set viewer    '00000000-0000-0000-0000-00000000000b'
\set commenter '00000000-0000-0000-0000-00000000000c'
\set editor    '00000000-0000-0000-0000-00000000000d'
\set stranger  '00000000-0000-0000-0000-00000000000e'
\set doc       '10000000-0000-0000-0000-000000000001'


-- Sign-up creates profiles.
insert into auth.users (id, email, raw_user_meta_data) values
  (:'owner', 'owner@example.org', '{"name": "Olu Owner"}'),
  (:'viewer', 'vee@example.org', '{"name": "Vee Viewer"}'),
  (:'commenter', 'cam@example.org', '{"name": "Cam Commenter"}'),
  (:'editor', 'eda@example.org', '{"name": "Eda Editor"}'),
  (:'stranger', 'stan@example.org', '{}');
select expect((select count(*) from profiles) = 5, 'a profile per account');
select expect((select name from profiles where id = :'stranger') = 'stan', 'name falls back to the email');

-- canonical_doc: only comment anchors, null attributes and key order are ignored.
select expect(canonical_doc('{"type":"doc","content":[{"type":"paragraph","attrs":{"indent":null,"textAlign":null},"content":[{"type":"text","text":"Hi "},{"type":"text","text":"there","marks":[{"type":"comment","attrs":{"commentId":"c-000001"}}]}]}]}')
            = canonical_doc('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hi there"}]}]}'),
              'comment anchors and nulls are ignored');
select expect(canonical_doc('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hi","marks":[{"type":"bold"}]}]}]}')
           <> canonical_doc('{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hi"}]}]}'),
              'formatting changes are not ignored');

-- ------------------------------------------------------------------ owner
select set_config('request.jwt.claim.sub', :'owner', false);
set role authenticated;

insert into documents (id, title, content) values
  (:'doc', 'Plans', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello world"}]}]}')
  returning id \gset created_
select expect(:'created_id' = :'doc', 'insert returns the new document');
select expect_error($$insert into documents (owner_id, title) values ('00000000-0000-0000-0000-00000000000b', 'Not mine')$$, '42501', 'cannot create documents for someone else');
select expect_error($$update documents set content = '{}' where true$$, '42501', 'content only changes through save_document');

insert into document_shares (doc_id, user_id, role) values
  (:'doc', :'viewer', 'viewer'), (:'doc', :'commenter', 'commenter'), (:'doc', :'editor', 'editor');
select expect_error(format($$insert into document_shares (doc_id, user_id, role) values (%L, %L, 'editor')$$, :'doc', :'owner'), '42501', 'the owner is never a share');
select expect((select count(*) from search_users('example')) = 4, 'search finds by email');
select expect((select name from search_users('eda')) = 'Eda Editor', 'search finds by name');
select expect(not exists (select 1 from search_users('olu')), 'search never returns yourself');
select expect(not exists (select 1 from search_users('e')), 'search needs two characters');
reset role;

-- --------------------------------------------------------------- stranger
select set_config('request.jwt.claim.sub', :'stranger', false);
set role authenticated;
select expect(not exists (select 1 from documents), 'strangers see no documents');
select expect(check_document_access(:'doc') = 'none', 'strangers learn only that they need access');
select expect(check_document_access('10000000-0000-0000-0000-0000000000ff') = 'missing', 'missing documents are reported as missing');
select expect_error(format($$select save_document(%L, '{"type":"doc"}', 1)$$, :'doc'), 'PT403', 'strangers cannot save');
select expect_error(format($$insert into document_shares (doc_id, user_id, role) values (%L, %L, 'editor')$$, :'doc', :'stranger'), '42501', 'strangers cannot share with themselves');
reset role;

-- ----------------------------------------------------------------- viewer
select set_config('request.jwt.claim.sub', :'viewer', false);
set role authenticated;
select expect((select count(*) from documents) = 1, 'viewers can read');
select expect(doc_role(:'doc') = 'viewer', 'viewer role');
select expect_error(format($$select save_document(%L, '{"type":"doc","content":[]}', 1)$$, :'doc'), 'PT403', 'viewers cannot save');
select expect_error(format($$insert into comments (id, doc_id, body) values ('comment-v1', %L, 'Hi')$$, :'doc'), '42501', 'viewers cannot comment');
select expect_error(format($$insert into document_shares (doc_id, user_id, role) values (%L, %L, 'viewer')$$, :'doc', :'stranger'), '42501', 'viewers cannot share');
select expect_error(format($$insert into storage.objects (bucket_id, name) values ('assets', %L)$$, :'doc' || '/a.png'), '42501', 'viewers cannot upload images');
update documents set title = 'Hacked' where id = :'doc';
select expect((select title from documents where id = :'doc') = 'Plans', 'viewers cannot rename');
reset role;

-- -------------------------------------------------------------- commenter
select set_config('request.jwt.claim.sub', :'commenter', false);
set role authenticated;
select expect_error(format($$select save_document(%L, '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Edited"}]}]}', 1)$$, :'doc'), 'PT403', 'commenters cannot change text');
select save_document(:'doc',
  '{"type":"doc","content":[{"type":"paragraph","attrs":{"textAlign":null},"content":[{"type":"text","text":"Hello "},{"type":"text","text":"world","marks":[{"type":"comment","attrs":{"commentId":"comment-c1"}}]}]}]}',
  1) ->> 'version' as v \gset
select expect(:'v' = '2', 'commenters can anchor comments');
insert into comments (id, doc_id, body, quote) values ('comment-c1', :'doc', 'Lovely', 'world');
select expect((select author_id from comments where id = 'comment-c1') = :'commenter', 'comments are authored by the commenter');
update comments set resolved = true where id = 'comment-c1';
select expect((select resolved_by from comments where id = 'comment-c1') = :'commenter', 'resolving records who');
insert into comment_replies (comment_id, body) values ('comment-c1', 'Reopening');
select expect((select not resolved from comments where id = 'comment-c1'), 'a reply reopens the thread');
reset role;

select expect((select updated_at = created_at from documents where id = :'doc'), 'comment anchors do not count as edits');

-- ----------------------------------------------------------------- editor
select set_config('request.jwt.claim.sub', :'editor', false);
set role authenticated;
select save_document(:'doc', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Edited by Eda"}]}]}', 2, false, '[{"kind":"text","text":"Edited by Eda"}]') ->> 'version' as v \gset
select expect(:'v' = '3', 'editors save');
select expect_error(format($$select save_document(%L, '{"type":"doc","content":[]}', 2)$$, :'doc'), 'PT409', 'stale saves conflict');
select expect((select save_document(:'doc', '{"type":"doc","content":[{"type":"paragraph"}]}', 2, true) ->> 'version') = '4', 'forced saves win');
update documents set title = 'Renamed' where id = :'doc';
select expect((select title from documents where id = :'doc') = 'Renamed', 'editors rename');
insert into document_shares (doc_id, user_id, role) values (:'doc', :'stranger', 'viewer');
update document_shares set role = 'commenter' where doc_id = :'doc' and user_id = :'stranger';
select expect((select role from document_shares where user_id = :'stranger') = 'commenter', 'editors share and change roles');
delete from document_shares where doc_id = :'doc' and user_id = :'stranger';
insert into storage.objects (bucket_id, name) values ('assets', :'doc' || '/picture.png');
delete from documents where id = :'doc';
delete from comments where id = 'comment-c1';
reset role;
select expect((select count(*) from documents) = 1, 'editors cannot delete documents');
select expect((select count(*) from comments) = 1, 'only the author or owner deletes a thread');

-- ------------------------------------------------- opens, leaving, deleting
select set_config('request.jwt.claim.sub', :'viewer', false);
set role authenticated;
insert into document_opens (doc_id) values (:'doc') on conflict (doc_id, user_id) do update set opened_at = now();
insert into document_opens (doc_id) values (:'doc') on conflict (doc_id, user_id) do update set opened_at = now();
select expect((select count(*) from storage.objects) = 1, 'viewers can load images');
delete from document_shares where doc_id = :'doc' and user_id = :'viewer';
select expect(not exists (select 1 from documents), 'leaving removes access');
reset role;
select expect((select count(*) from document_opens) = 1, 'open times are kept per person');

select set_config('request.jwt.claim.sub', :'stranger', false);
set role authenticated;
select expect(not exists (select 1 from storage.objects), 'strangers cannot load images');
reset role;

select set_config('request.jwt.claim.sub', :'owner', false);
set role authenticated;
select expect((select count(*) from comment_replies) = 1, 'owners read replies');
delete from comments where id = 'comment-c1';
select expect(not exists (select 1 from comments), 'owners delete any thread');
update profiles set name = 'Olu O.' where id = :'owner';
update profiles set name = 'Nope' where id = :'viewer';
select expect_error($$update profiles set email = 'x@example.org' where true$$, '42501', 'emails come from auth only');
delete from documents where id = :'doc';
select expect(not exists (select 1 from documents), 'owners delete documents');
reset role;

select expect((select name from profiles where id = :'owner') = 'Olu O.', 'people edit their own name');
select expect((select name from profiles where id = :'viewer') = 'Vee Viewer', 'not other people''s');
select expect(not exists (select 1 from document_shares), 'deleting a document removes its shares');

-- anon has nothing.
set role anon;
select expect_error($$select * from documents$$, '42501', 'signed-out visitors read nothing');
reset role;

\echo 'All database checks passed.'
