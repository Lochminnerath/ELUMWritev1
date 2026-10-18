-- The ELUM platform: accounts and addresses, services, events, deliveries and notifications.
\set ON_ERROR_STOP on
\set QUIET on

\set owner '00000000-0000-0000-0000-00000000003a'
\set friend '00000000-0000-0000-0000-00000000003b'
\set doc '10000000-0000-0000-0000-000000000031'

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (:'owner', 'Ola@Example.org', now(), '{"name": "Ola Owner"}'),
  (:'friend', 'fen@example.org', null, '{"name": "Fen Friend"}');

-- Workers switch their consumers on when they ship.
update elum.consumers set active = true;

-- Addresses follow Supabase Auth.
select expect((select verified_at is not null from elum.addresses where address = 'ola@example.org'), 'confirmed login address is verified');
select expect((select verified_at is null from elum.addresses where address = 'fen@example.org'), 'unconfirmed login address is not');
update auth.users set email_confirmed_at = now() where id = :'friend';
select expect((select verified_at is not null from elum.addresses where address = 'fen@example.org'), 'confirming verifies it');
select expect(elum.account_for_address(' FEN@example.org ') = :'friend', 'addresses resolve to accounts');
select expect((select count(*) from elum.events where type = 'elum.account.created') = 2, 'new accounts are announced');

-- Type addresses: server only, unique, and not reserved names.
select expect(elum.assign_type_address(:'friend', 'Fen') = 'fen@type.elum.services', 'Type address from the handle');
select expect((select account_type = 'type' and handle = 'fen' from profiles where id = :'friend'), 'the account becomes a Type account');
select expect(elum.delivery_channel(:'friend') = 'type_inbox' and elum.delivery_channel(:'owner') = 'email', 'channels follow the account type');
select expect_error($$select elum.assign_type_address('00000000-0000-0000-0000-00000000003a', 'fen')$$, 'PT409', 'handles are unique');
select expect_error($$select elum.assign_type_address('00000000-0000-0000-0000-00000000003a', 'support')$$, 'PT409', 'reserved handles');
select expect_error($$select elum.assign_type_address('00000000-0000-0000-0000-00000000003a', 'a..b')$$, 'PT400', 'handle format');

-- Signed in as the owner.
select set_config('request.jwt.claim.sub', :'owner', false);
set role authenticated;
select expect((select elum_me() ->> 'email') = 'Ola@Example.org', 'elum_me returns the account');
select expect((select jsonb_array_length(elum_me() -> 'services')) = 5, 'and every product');
select expect((select elum_join_service('write') ->> 'joined') = 'true', 'first use of a service joins it');
select expect((select elum_join_service('write') ->> 'joined') = 'false', 'later uses do not');
select expect_error($$select elum_join_service('browse')$$, 'PT400', 'services that are not open cannot be joined');
select expect_error($$select * from elum.events$$, '42501', 'events are server only');
select expect_error($$select elum_emit('write.document.shared', null, null)$$, '42501', 'apps cannot emit events');
select expect_error($$select elum.assign_type_address(auth.uid(), 'mine')$$, '42501', 'apps cannot take handles');
select expect(not elum_handle_available('fen') and elum_handle_available('ola.k') and not elum_handle_available('admin'), 'handle availability');

-- Sharing with someone's Type address reaches their account and tells them.
insert into documents (id, title) values (:'doc', 'Field notes');
select expect((select share_by_email(:'doc', 'fen@type.elum.services', 'commenter') ->> 'userId') = :'friend', 'Type addresses resolve when sharing');
select expect((select share_by_email(:'doc', 'new@example.org', 'viewer') ->> 'kind') = 'invite', 'unknown addresses are invited');
select expect((select count(*) from elum_notifications()) = 0, 'the actor gets no notification');
insert into comments (id, doc_id, body) values ('c-own-000001', :'doc', 'Note to self');
reset role;

select expect((select count(*) from elum.events where type = 'write.document.shared' and recipient_id = :'friend') = 1, 'share event');
select expect((select recipient_address from elum.events where type = 'write.document.invited') = 'new@example.org', 'invite event keeps the address');
select expect((select count(*) from elum.deliveries d join elum.events e on e.id = d.event_id where e.type = 'write.document.shared') = 2,
              'share events go to the email and Type inbox consumers');
select expect((select count(*) from elum.notifications where type = 'write.comment.created') = 0, 'no notification for your own comment');

-- The friend sees the share, comments, and the owner hears about it.
select set_config('request.jwt.claim.sub', :'friend', false);
set role authenticated;
select expect((select title from elum_notifications()) = 'Ola Owner shared “Field notes” with you', 'notification title');
select expect((select link from elum_notifications()) = '/d/10000000-0000-0000-0000-000000000031', 'notification link');
select expect((select count(*) from elum.notifications) = 1, 'people see only their own notifications');
insert into comments (id, doc_id, body) values ('c-fen-000001', :'doc', 'Lovely start');
select expect(elum_mark_notifications_read() = 1, 'mark all read');
select expect((select (elum_me() ->> 'unread')::int) = 0, 'unread count');
reset role;

select set_config('request.jwt.claim.sub', :'owner', false);
set role authenticated;
select expect((select title from elum_notifications() where type = 'write.comment.created') = 'Fen Friend commented on “Field notes”', 'owner hears about comments');
insert into comment_replies (comment_id, body) values ('c-fen-000001', 'Thank you');
select elum_set_notification_setting('write.comment.replied', false, false);
reset role;
select expect((select count(*) from elum.notifications where type = 'write.comment.replied' and account_id = :'friend') = 1, 'replies notify the commenter');

-- Workers drain their queues with retries and backoff.
set role service_role;
select expect((select count(*) from elum_claim_deliveries('type-inbox', 100) where channel = 'type_inbox') >= 1, 'Type inbox worker gets Type accounts');
select expect((select count(*) from elum_claim_deliveries('type-inbox', 100)) = 0, 'claimed deliveries are leased');
select elum_finish_delivery('email', (select min(event_id) from elum.deliveries where consumer_id = 'email'), 'retry', 'Brevo said no');
reset role;
select expect((select status = 'pending' and available_at > now() and last_error = 'Brevo said no'
               from elum.deliveries where consumer_id = 'email' order by event_id limit 1), 'retries back off');
select expect(elum.emit('elum.account.deleted', null, :'owner', '{}', null, 'same-key') = elum.emit('elum.account.deleted', null, :'owner', '{}', null, 'same-key'),
              'an idempotency key makes one event');

-- Rate limits.
select expect(elum.take_rate_limit('test', 2, 60) and elum.take_rate_limit('test', 2, 60) and not elum.take_rate_limit('test', 2, 60), 'rate limit');

\echo 'Platform checks passed.'
