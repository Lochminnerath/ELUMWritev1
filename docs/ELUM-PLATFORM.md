# ELUM platform and ELUM Type: the handoff

This one file is everything a team or agent needs to build any ELUM service, starting with
**ELUM Type**, on the same foundation as **ELUM Write**. It covers:

- the shared account system;
- how services make requests, talk to each other and grow;
- a design brief and data model for Type;
- an expanded design system, so every product looks and behaves as one family.

Read it with the ELUM brand kit (`BRAND-BOOK.md`, `tokens/`, logos, motion). This file builds on
the kit and does not repeat it.

**Already built and running (in the Write repository):**

- the platform database layer: `supabase/migrations/20261020000000_elum_platform.sql`, copied in Appendix A;
- tests for every rule in it: `supabase/tests/platform.test.sql`;
- Write, which uses it: it joins the platform on sign-in, sends events, shows the notification bell, and can share one sign-in across subdomains.

**Not built yet:**

- ELUM Type itself;
- the platform email worker;
- the central account pages (section 3.8).

| Part | Read it if you are |
| --- | --- |
| 1. The family and the rules | Everyone |
| 2. Architecture | Everyone |
| 3. Accounts | Building sign-up, sign-in or account settings |
| 4. Services and growth | Adding a service, plan or feature flag |
| 5. Requests | Writing any backend call |
| 6. Events and notifications | Making services aware of each other |
| 7. Email | Sending or receiving mail |
| 8. ELUM Type: product and data | Building Type |
| 9. Design system | Designing or building any screen |
| 10. Operations | Deploying, migrating, configuring |
| 11. Checklist and open decisions | Starting work |
| Appendix A–C | Platform SQL, token additions, product glyphs |

---

## 1. The family and the rules

ELUM makes everyday work tools built by people that run without AI: **Write** (documents),
**Type** (messaging and email), **Browse** (search), **Make** (graphs, design, software) and
**Store** (files). Every product name ends in "e"; keep that for new ones.

Rules every service keeps:

1. **One account per person, for every service.** Nobody signs up twice. A service never has its own user table.
2. **One database project, clear ownership.** Every table belongs to exactly one service (or the platform). A service never writes another service's tables.
3. **Services talk through events.** "Something happened" is an event in `elum.events`. Services do not call each other's databases.
4. **Apps reach the platform only through `public.elum_*` functions.** The `elum` schema's tables are private. This keeps the platform free to change.
5. **The database enforces permissions.** Every table has row level security. UI checks are for comfort, not safety.
6. **Same look, same words.** One design system (section 9); each product changes only its accent colour, mark and product-specific patterns.
7. **No AI features**, no tracking beyond what a feature needs, no dark patterns. "Your words stay yours."

---

## 2. Architecture

```
                       ┌──────────── one Supabase project ─────────────┐
 write.elum.example ──▶│ Auth      one user per person (auth.users)    │
 type.elum.example  ──▶│ Postgres                                       │
 account.elum.example ▶│   public.profiles      the ELUM account        │
 (browse, make, store) │   elum.*               platform (private)      │
                       │   public.* (Write)     documents, shares ...   │
                       │   type.*               Type's own tables       │
                       │ Storage   one bucket per service               │
                       │ Edge functions  <service>-<action>             │
                       │ Realtime  notifications, live updates          │
                       └────────────────────────────────────────────────┘
                                  │ events (elum.events → elum.deliveries)
                  ┌───────────────┼──────────────────┐
              email worker   type-inbox worker   (future workers)
              (Brevo out)    (Type inbox)        search index, Store ...
```

- **Domains** (placeholders until you choose them; see section 11):
  - `elum.example` is the family home.
  - `account.elum.example` hosts the shared sign-in and account pages.
  - Each product has a subdomain: `write.`, `type.` and so on.
  - Type addresses live on their own mail domain: `type_domain` in `elum.config`, today `type.elum.example`.
- **Sign-in is shared.** All products keep the Supabase session in cookies on the parent domain (`.elum.example`), so signing in once covers every product (section 3.6).
- **Schemas and ownership:**

| Owner | Where | Contents |
| --- | --- | --- |
| Platform | `elum.*` (private), `public.profiles`, `public.elum_*` functions | Accounts, addresses, services, events, notifications, rate limits, audit |
| Write | `public.*` tables and functions (historical; may move to `write.*`) | `documents`, `document_shares`, `document_invites`, `comments`, `comment_replies`, `document_opens`, `user_preferences`, `share_emails`; storage bucket `assets` |
| Type | `type.*` (new) | Section 8.4 |
| Others | `browse.*`, `make.*`, `store.*` | Their own |

`public.user_preferences` is Write's per-person settings today (colours, spelling dictionary).
New services keep their own preferences in their own schema. Settings shared by all services go in
`public.profiles`, or in a new platform table added through a platform migration.

---

## 3. Accounts

### 3.1 The account record

`auth.users` (Supabase Auth) holds credentials. `public.profiles` is the ELUM account, with the
same id. Every service references people by `public.profiles(id)`.

| Column | Meaning | Who changes it |
| --- | --- | --- |
| `id` | Account id (= `auth.users.id`) | Never changes |
| `name` | Display name, 1–80 characters, collected for every account type | The person (`update profiles set name`, already granted) |
| `email` | The login address | Follows Auth automatically |
| `color` | Avatar colour, one of the product colours | Assigned at sign-up |
| `account_type` | `external` (own email provider) or `type` (has an ELUM Type address) | Server only |
| `handle` | Unique name for Type: the part before `@` in the Type address | Server only (`elum_assign_type_address`) |
| `status` | `active`, `suspended` or `deleted` | Server only |
| `locale`, `time_zone` | Formatting preferences | The person (`elum_update_account`) |
| `welcomed` | Write's welcome document was created | Write |
| `created_at`, `updated_at` | Timestamps | Automatic |

Signed-in people can see each other's `id, name, email, color` (for sharing and people search).
New sensitive fields must not go on `profiles`. Put them in a platform table with owner-only access.

### 3.2 Two kinds of account

Both kinds collect a name, use the same profile, and can use every service. The only difference
is how ELUM reaches them outside the apps:

| | External account | Type account |
| --- | --- | --- |
| Signs up with | Their own email and a password | A new Type address (`handle@type domain`) and a password |
| Address verified by | Confirming a link sent to their email | Construction: ELUM owns the address, so it is verified when created |
| Shares, comments and invites arrive | By email to their own address (Brevo) | In their Type inbox |
| `elum.delivery_channel()` | `email` | `type_inbox` |
| Recovery | Password reset email | A recovery email address or code (section 3.4) |

An external account can add a Type address later ("Get an ELUM address"). The same
`elum_assign_type_address` call does it. Their login address stays and becomes a recovery option,
and their channel switches to the Type inbox.

### 3.3 Addresses

`elum.addresses` lists every address that reaches an account:

| Kind | What it is |
| --- | --- |
| `login` | Mirrors `auth.users.email`. Kept in step by a trigger, and verified when Auth confirms it. |
| `type` | The Type address. Verified on creation. |
| `alias` | Another address the person has verified (by a code sent to it). |

- **Resolving an address.** `elum.account_for_address(address)` returns the account that owns an address. Sharing in Write uses it, so sharing with someone's Type address reaches their account. Every service resolves people this way.
- **Unverified addresses never resolve**, except the login address. This is what stops someone signing up with another person's address to receive their shares.
- **Invites are claimed only after verification.** An invite for an address with no account waits in Write's `document_invites` table. It is claimed only when someone verifies that address.

### 3.4 Creating a Type account (to build)

People choose a handle, a name and a password. Optionally they add a recovery email, and later a
phone number. The edge function `type-signup` (service role) does the work:

1. **Check abuse limits.**
   - A captcha such as hCaptcha or Turnstile (Supabase Auth supports both).
   - `elum.take_rate_limit('type.signup:<ip>', 5, 3600)`.
   - A denylist of disposable recovery domains.
2. **Check the handle.**
   - `elum_handle_available(handle)`; also callable from the form as the person types.
   - Format: 3–30 characters of `a–z 0–9 . _ -`; no two symbols in a row; no symbol first or last; not in `elum.reserved_handles`.
3. **Create the user.**
   - Call `auth.admin.createUser({ email: handle@typeDomain, password, email_confirm: true, user_metadata: { name } })`.
   - The profile and login address are created by triggers.
   - `account_type` defaults to `external` and must be set by the next step.
4. **Assign the address.** `elum_assign_type_address(userId, handle)` sets `account_type = 'type'` and the handle, and adds the `type` address.
5. **Verify the recovery email**, if given.
   - Send a 6-digit code with the Reauthentication-style template (see `docs/EMAIL.md`).
   - Store the address as an `alias` only after the code matches.
6. **Return a session.** Sign the person in and redirect to Type. Type calls `elum_join_service('type')`.

Never let an app set `account_type`, `handle` or `status`. Supabase sign-up metadata is
user-controlled. The migration ignores it for these fields, and new code must too.

Recovery for Type accounts:

- With a recovery email: a reset link or code goes to that address.
- With nothing: there is no recovery. Say so clearly at sign-up, and encourage adding one.

### 3.5 Signing in (both kinds)

- **Email and password** through Supabase Auth, at `account.elum.example/signin?next=<url>` or inside each product.
  - Write signs people in itself today. Products may keep their own sign-in page, but it must look and behave the same (section 9.6).
  - `next` must be a path or an `https://*.elum.example` URL. Reject anything else, to avoid open redirects.
- **Email confirmation** must stay on in Auth settings for external accounts.
- **Password rules:** at least 8 characters. Check against leaked passwords (an Auth setting).
- **Later:** passkeys and two-factor (Supabase MFA). Design the account pages with room for a Security section.

### 3.6 One sign-in for every service

Set `VITE_ELUM_COOKIE_DOMAIN=.elum.example` (or the equivalent) in every web app. Write then
stores the Supabase session in cookies on that domain, using storage key `elum-auth`; see
`src/api/supabase/cookieStorage.ts` in Write, which can be copied as is. Large sessions are split
across numbered cookies, with `SameSite=Lax; Secure` and a 400-day lifetime.

- **Every service** uses the same Supabase URL, anon key, storage key and cookie domain. That is all it takes.
- **Signing out** in any service clears the shared cookies, which signs out everywhere. Supabase fires `SIGNED_OUT` in every open tab.
- **Native apps** (later) use Supabase Auth with PKCE and the system browser. They do not share cookies.
- **Local development** runs on `localhost` with the variable unset, so each app keeps its own session.

### 3.7 Deleting an account

1. **Ask to confirm.** Then call the edge function `account-delete` (service role).
2. **Mark the account** with `status = 'deleted'` and emit `elum.account.deleted`.
3. **Let each service clean up.** Each one consumes the event and removes or anonymises its data. For example, Write deletes owned documents and keeps comments as "Former member".
4. **Delete the user** once every consumer has finished (delivery status `done`): `auth.admin.deleteUser`. The profile cascades.

### 3.8 Account pages (to build, shared by all services)

Host them at `account.elum.example`, with a link from every product's user menu ("Your ELUM
account"). The sections:

| Section | Contents |
| --- | --- |
| Profile | Name, avatar colour, locale, time zone |
| Addresses | Login address, Type address, aliases (add, verify, remove), recovery email |
| Security | Change password; later passkeys, two-factor and signed-in devices; recent activity (`elum.audit_log`) |
| Services | Which products you use (from `elum_me().services`); plans later |
| Notifications | Per event type: in the app, and by email or Type (`elum_set_notification_setting`) |
| Delete account | Section 3.7 |

`elum_me()` returns everything the Profile, Addresses and Services sections need in one call.

---

## 4. Services and growth

- **The service registry.**
  - `elum.services` lists every product, with its brand colour token and status: `planned`, `beta`, `active` or `retired`.
  - Today Write is `active`; Type, Browse, Make and Store are `planned`.
  - Switch Type to `beta` when it opens: `update elum.services set status = 'beta', url = 'https://type.elum.example' where id = 'type'`.
- **Joining a service.** Apps call `elum_join_service('<id>')` on every sign-in or app start.
  - The first call creates a `service_accounts` row and emits `elum.service.joined`.
  - Later calls update `last_seen_at`.
  - Use it for onboarding ("Welcome to Type"), the app switcher and usage counts.
- **Plans.** `service_accounts.plan` defaults to `free`. Paid plans can be added later without changing services: billing writes the plan, and apps read it from `elum_me()`.

**Adding a new service (the growth checklist):**

1. Pick a name ending in "e", a colour from the brand kit, and a mark built from glass discs. Add tokens for its colour (section 9.2).
2. Insert into `elum.services` (platform migration).
3. Create its schema (`create schema <id>`), with row level security on every table. Expose the schema in the API settings only if the app reads tables directly.
4. Register its event types in `elum.event_types`, with descriptions and payload notes.
5. If it reacts to other services, add a consumer in `elum.consumers` (inactive), build its worker, then switch it on.
6. Use the shared sign-in (section 3.6), `elum_join_service`, the notification bell and the design system.
7. Add its storage bucket, with paths `<bucket>/<owner or object id>/<file>` and policies that follow the object's access.

---

## 5. Requests

### 5.1 Three ways to ask the backend

| Kind | Use for | How |
| --- | --- | --- |
| Table access with row level security | Simple reads and writes of the service's own data | `supabase.from(table)` |
| Database functions (RPC) | Anything with rules across rows or tables: saving with version checks, sharing, sending | `supabase.rpc(name, args)`; `security definer`, with `search_path` set and permissions checked inside |
| Edge functions | Third-party calls (Brevo), admin actions (creating Type users), webhooks, anything that needs a secret | `https://<project>.functions.supabase.co/<service>-<action>` |

**Naming:**

- Database functions: `public.<service>_<verb>`. Write's predate this rule.
- Edge functions: `<service>-<action>`, such as `type-signup` or `type-inbound`.
- Platform functions: `elum_*`.

### 5.2 Errors (one vocabulary everywhere)

Database functions raise these codes. The client maps them to the same `ApiError` codes in every
app; see `src/api/errors.ts` and `toApiError` in Write.

| Database code | Client code | HTTP | When |
| --- | --- | --- | --- |
| `PT400` | `invalid` | 400 | Bad input; the message says what to fix |
| `PT401` | `unauthorized` | 401 | No or expired session |
| `PT403` | `forbidden` | 403 | Signed in, not allowed |
| `PT404` | `not_found` | 404 | Missing or deleted |
| `PT409` | `conflict` | 409 | Version conflict or taken name. `detail` carries the current version where relevant |
| `PT429` | `rate_limited` | 429 | Too many requests |
| `42501` (Postgres) | `forbidden` | 403 | Row level security or grant denied |
| Others | `server` / `network` | 500 / 0 | Unexpected |

Messages are written for people: plain, short, saying what to do next ("Enter a valid email
address."). Edge functions return:

- on failure: `{ "error": { "code": "...", "message": "...", "details": {} } }` with the matching HTTP status;
- on success: `{ "data": ... }`.

### 5.3 Rules for every request

- **Idempotency.** Anything a client may retry carries a key, and the server makes it a no-op the second time: `elum.emit(..., idempotency_key)`, or a unique constraint on a client-generated id (Write's comments use client ids).
- **Optimistic concurrency.** Documents, drafts and settings carry a `version`, and saves send the version they started from (see `save_document` in Write). Conflicts return `PT409`; the UI then offers "keep mine" or "load theirs".
- **Rate limits.** Call `elum.take_rate_limit(key, limit, windowSeconds)` in any function that sends something or creates accounts. For signed-in callers, keys are scoped to the account automatically. Current limits:

| Action | Limit |
| --- | --- |
| `write.share_by_email` | 60 per hour per account |
| Type sign-up | 5 per hour per IP |
| Type messages to external addresses | 200 per day per account at first |

- **Auditing.** Security-relevant changes call `elum.audit(account, 'action.name', service, detail)`.
- **Time.** Store `timestamptz`; send ISO 8601; show in the person's `time_zone`.
- **Ids.** Use UUIDs, or text ids from the client where the client must know the id first (comment anchors). Never expose sequential ids in URLs.
- **Pagination.** Use a cursor (`p_before timestamptz` or the last id), never offsets, with a limit of 100 at most.

### 5.4 The client pattern

Each app has one interface listing every call (Write's `ElumApi` in `src/api/client.ts`), with
backends behind it. The UI never imports Supabase directly. This keeps the UI testable, and lets
a service run in a local preview mode (`LocalApi`) without a server. Type should copy:

- `ApiError` and `toApiError`;
- `cookieStorage.ts`;
- the `notifications` part of `ElumApi`;
- `NotificationBell`.

---

## 6. Events and notifications

### 6.1 Events

An event records that something happened.

- **Name:** `service.object.verb`, in the past tense, such as `write.document.shared` or `type.message.received`.
- **Registration:** every type is registered in `elum.event_types`, with a version, whether it notifies, and a description of its payload.
- **Sending:** `elum.emit(type, actor, recipient, payload, subject, idempotency_key, recipient_address)` (server-side), or `public.elum_emit` (service role, from edge functions). It does three things:
  1. stores the event (or returns the existing one for a repeated key);
  2. creates a delivery for every active consumer whose pattern matches;
  3. creates an in-app notification if the type has `notify` and the payload has `notification: { title, body, link }`, unless the recipient is the actor or has switched it off.

Payload rules:

- Ids, not copies. Use enough to render a notification and route it, such as `docId` and `title`.
- No secrets. Keep it under 64 KB.
- Add fields freely. Removing or changing one means a new `version` and a note in the description.

Events today:

| Type | Notifies | Payload |
| --- | --- | --- |
| `elum.account.created` | No | `{ accountType }` |
| `elum.account.deleted` | No | `{}`. Every service cleans up. |
| `elum.address.verified` | No | `{ address, kind }` |
| `elum.service.joined` | No | `{ service }` |
| `write.document.shared` | Yes | `{ docId, title, role, notification }` |
| `write.document.invited` | No | `{ docId, title, role }`; `recipient_address` set, no account |
| `write.comment.created` | Yes (document owner) | `{ docId, commentId, notification }` |
| `write.comment.replied` | Yes (comment author) | `{ docId, commentId, notification }` |
| `type.message.received` | Yes | `{ threadId, messageId, from, subject, notification }`. For Type to emit. |

### 6.2 Consumers and deliveries

A consumer is a worker with patterns, such as `write.%`. Each event it matches gets a row in
`elum.deliveries`: a queue per consumer, so a slow email worker never holds up Type's inbox.

```
loop (every minute via pg_cron, or continuously):
  rows = rpc('elum_claim_deliveries', { p_consumer: 'type-inbox', p_limit: 50 })   // leased for 2 minutes
  for row in rows:
    try   handle(row); rpc('elum_finish_delivery', { p_consumer, p_event: row.event_id, p_status: 'done' })
    catch rpc('elum_finish_delivery', { ..., p_status: 'retry', p_error: message })    // 1, 2, 4 … min, up to 6 h; fails after 10
    // 'skipped' when the event does not apply (a recipient whose channel is not yours)
```

Each row includes `channel`: `type_inbox` or `email`, from the recipient's account type. Each
worker skips rows that aren't its channel.

Handling must be idempotent, because a lease can expire mid-work and the row comes back. Use the
event id as a unique key in the consumer's own tables.

| Consumer | Status | Does |
| --- | --- | --- |
| `email` | Inactive | Sends email for events whose channel is `email`, after checking `elum.notification_settings.outside`. When switched on, it replaces Write's `send-share-emails` function and `share_emails` queue. |
| `type-inbox` | Inactive | Turns events for Type accounts into inbox items (section 8.5). Owned by Type. |

Switch a consumer on only once its worker is deployed:
`update elum.consumers set active = true where id = 'type-inbox'`.

### 6.3 Notifications (the bell)

`elum.notifications` is one list per person across all services. Apps use four calls:

- `elum_notifications(limit, before, unreadOnly)` lists them;
- `elum_mark_notifications_read(ids | null)` marks some or all as read;
- Supabase Realtime (`schema: 'elum', table: 'notifications', filter: account_id=eq.<me>`) delivers new ones live;
- `elum_me().unread` gives the count.

Write's `NotificationBell` shows the design to reuse:

- an unread dot in ELUM blue (the bell is a platform element, so it uses the parent brand colour);
- each item shows the actor's avatar, or a dot in the service's colour;
- each item has a title, a body line, then the service name in its deep colour and a time.

Notification copy follows one pattern: "<Name> <did what> <object> [with you]", in sentence case
with no full stop.

- "Ola Owner shared “Field notes” with you"
- "Fen commented on “Field notes”"
- "Rae sent you a message"

Links:

- inside the same service, a path (`/d/<id>`);
- to another service, a full URL.

---

## 7. Email

- **Design.** Write's `docs/EMAIL.md` defines the ELUM email layout: the product lockup, one card, one action, the plain-text version and the footer. `supabase/functions/_shared/email.ts` implements it. Type's system emails (verification codes, recovery) reuse it with the Type lockup and mint accent.
- **Outbound.** Brevo, via its API from edge functions, with secrets `BREVO_API_KEY` and `<SERVICE>_EMAIL_FROM`. Brevo also serves as Supabase Auth's SMTP (Auth → SMTP settings), which removes Supabase's two-a-day test limit.
- **Type mail domain.** Type sends and receives as `handle@<type_domain>`. That domain needs:
  - MX records pointing at the inbound provider;
  - SPF including Brevo;
  - DKIM keys from Brevo;
  - DMARC `p=quarantine` to start, moving to `reject`;
  - a `postmaster@` and `abuse@` that go to the team. Both are reserved handles.
- **Inbound for Type.** Brevo inbound parsing, or another inbound provider, POSTs each received message to `type-inbound` (an edge function). It:
  1. checks the provider's signature;
  2. resolves the recipient with `elum.account_for_address`;
  3. stores the message (section 8.4) with attachments in the `type-attachments` bucket;
  4. runs the spam checks (SPF, DKIM and DMARC results from the provider, plus Type's own rules);
  5. emits `type.message.received`.

---

## 8. ELUM Type: product and data

### 8.1 What Type is

Type is ELUM's messaging and email app: one inbox for conversations with other ELUM people and
for email with anyone. It is calm, fast and private. It has:

- no AI features: no smart replies, summaries or auto-categories;
- no tracking pixels: incoming remote images are blocked until the person allows them;
- no read receipts outside ELUM.

Mark: three rising discs, a message being typed and sent. Colour: `type` (mint) and `type-deep`.

Two kinds of conversation share one inbox:

- **ELUM conversations**, between ELUM accounts, delivered instantly through the database. They can show presence and seen-by, if both people allow it.
- **Email**, to and from any address, through Brevo outbound and the inbound webhook.

Type also receives the platform's events for Type accounts as **inbox cards**. For example,
"Ola shared “Field notes” with you", with an **Open in Write** button.

### 8.2 Screens

| Screen | Contents |
| --- | --- |
| Inbox | Conversation list: avatar, name, subject or first words, time, unread state, attachment icon. Filters: All, Unread, From ELUM, Email, Archived. Search. |
| Conversation | Messages oldest to newest. ELUM conversations as bubbles; email as cards with full headers on demand. A reply dock at the bottom, like Write's formatting dock. |
| Compose | To, Cc and Bcc as address chips (ELUM accounts show their avatar and a verified badge), subject (email only), body with basic formatting (bold, italic, lists, links), attachments, send. Drafts save as you type. |
| Contacts | People you have written to, and ELUM people found by name or address (same rules as Write's people search). |
| Settings | Signature, default send address, image loading, notifications, vacation reply; links to the ELUM account pages. |
| Sign-up | Choose a handle (checked as you type), name, password, optional recovery email (section 3.4). |

### 8.3 Layout (from section 9.6)

The Type layout uses the same shapes as Write so the family feels the same:

- **App bar (64px):** Type lockup, search field, notification bell, user menu.
- **Rail (60px):** Inbox, Unread, Archived, Contacts, Settings. The active item uses `type-mist` with a 3px `type` bar on the left.
- **Columns:** the list (320–380px), then the conversation. On phones these become one column with back navigation.
- **Compose:** opens as a floating panel bottom-right on desktop, or a full sheet on phones, with a **Send** button in the mint pill style.
- **Loaders:** the Type loader (`elum-loader-type.svg`) while sending or loading.

### 8.4 Data model (draft for the Type team to finish)

The SQL below is a starting point, not applied anywhere. Put it in a migration named
`<timestamp>_type.sql`, in the `type` schema, with row level security everywhere.

```sql
create schema type;

-- A mailbox per account (one today; room for shared team mailboxes later).
create table type.mailboxes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  address text not null unique,              -- handle@type domain (matches elum.addresses)
  display_name text not null,
  signature text,
  created_at timestamptz not null default now()
);

-- A conversation: ELUM-only or email.
create table type.threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('elum', 'email')),
  subject text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Who is in a thread, and each person's state for it.
create table type.participants (
  thread_id uuid not null references type.threads (id) on delete cascade,
  mailbox_id uuid references type.mailboxes (id) on delete cascade,   -- ELUM people
  address text not null,                                             -- everyone, lowercase
  name text,
  folder text not null default 'inbox' check (folder in ('inbox', 'archive', 'trash', 'spam')),
  last_read_at timestamptz,
  muted boolean not null default false,
  primary key (thread_id, address)
);

create table type.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references type.threads (id) on delete cascade,
  sender_address text not null,
  sender_mailbox uuid references type.mailboxes (id) on delete set null,
  body_text text not null default '',
  body_html text,                       -- sanitised on the way in; never trusted
  headers jsonb,                        -- email only (Message-ID, In-Reply-To, References)
  message_id text unique,               -- RFC 5322 Message-ID for threading and de-duplication
  status text not null default 'sent' check (status in ('draft', 'queued', 'sent', 'delivered', 'failed', 'received')),
  event_id bigint unique,               -- set when created from a platform event (idempotency)
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table type.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references type.messages (id) on delete cascade,
  path text not null,                   -- type-attachments/<thread>/<file>
  name text not null,
  mime text not null,
  bytes integer not null check (bytes <= 25 * 1024 * 1024)
);

-- Platform events shown as cards in the inbox (shares, comments ...).
create table type.inbox_cards (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references type.mailboxes (id) on delete cascade,
  event_id bigint not null unique,      -- elum.events.id
  service_id text not null,             -- write, store ...
  title text not null,
  body text,
  action_label text,                    -- "Open in Write"
  action_url text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  archived_at timestamptz
);
```

Access rules to write as policies:

- People see threads where they are a participant through one of their mailboxes, and only those threads' messages and attachments.
- Sending goes through `type_send_message(thread, body, to[])`, a security-definer function that checks:
  - the sender owns the mailbox;
  - rate limits;
  - recipients' addresses resolve.

  It then writes the message for ELUM recipients, and queues email for the rest.
- For ELUM-to-ELUM conversations, Realtime on `type.messages`, filtered by thread, gives instant delivery.

### 8.5 How Type consumes Write (and everyone else)

The `type-inbox` worker claims deliveries:

- it skips rows with `channel != 'type_inbox'`;
- for each `write.*` event, it creates a `type.inbox_cards` row:
  - title and body from `payload.notification`;
  - action "Open in Write" pointing to `https://write.elum.example` plus the link;
- it then finishes the delivery.

Write's own email for that share was already skipped, because `send-share-emails` skips Type
accounts. People get the card in Type, and the bell entry in every app.

Type emits `type.message.received` for each new message, with a `notification`. The bell in Write
and every other product then shows "Rae sent you a message", linking to
`https://type.elum.example/t/<thread>`.

### 8.6 Acceptance for a first Type release

**Accounts:**

- Sign up for a Type account with a handle. A taken or reserved handle is refused as you type.
- Sign in once, and you are signed in to Write too, and the other way round.

**Messaging:**

- Send a message to another ELUM person. It appears live in their inbox with a notification.
- Send an email to an outside address, and receive the reply in the same thread.
- Remote images in received email stay blocked until allowed.
- HTML email is sanitised; no scripts, ever.

**Working with Write:**

- Sharing a Write document with a Type account puts an inbox card in Type and an entry in the bell. No email goes to that account.

**Quality:**

- Light and dark mode, keyboard use, screen reader labels, phone layout and reduced motion all work.
- Tests cover every access rule (the same style as Write's `supabase/tests`).

---

## 9. Design system (the expanded brand kit)

The brand kit defines the identity: logo, product marks, colours, type, motion and loaders. This
section adds what apps need to look like one family: semantic tokens, product accents, layout,
components, icons and patterns. **Write is the reference implementation.** Its CSS
(`src/styles/tokens.css`, `base.css`, `components.css`, the editor and toolbar CSS) can be copied,
then given the product's accent.

### 9.1 Principles

- **Quiet surfaces, one moment of colour.** Most of a view is `surface`, `surface-glass`, `ink` and `ink-muted`. The product colour marks the active thing, the primary action of the product, the loader, and the lens moments.
- **Circles are the motif.** Use pills for buttons, chips and badges; round avatars; and disc-based marks. Cards use 12–16px radii.
- **Depth is glass.** Use floating panels with `shadow-glass` and a translucent surface with backdrop blur, not heavy shadows.
- **Motion is light moving:** 160ms hovers, 320ms panels, 640ms entrances, eased with `cubic-bezier(.22,1,.36,1)`. Honour reduced motion.
- **Words:** short and plain, in sentence case, "we" to "you", no emoji, no urgency tricks.

### 9.2 Tokens added to the kit

These are in addition to `tokens.json`; Appendix B has them as JSON. Each product has the same
four colour roles, so components take `--accent-*` and a product sets them once:

```css
/* In each product's root CSS (Write shown; Type uses type, type-deep, type-mist, type-line). */
:root { --accent: var(--write); --accent-deep: var(--write-deep); --accent-mist: var(--write-mist); --accent-line: var(--write-line); }
```

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `write-mist` / `write-line` | `#fdf0e4` / `#f8c79f` | `#2b2320` / `#6b4a33` | Active ground / active border (Write's tuned values) |
| `type-mist` / `type-line` | `#e2f6f1` / `#95dfcb` | `#142931` / `#225953` | Same, for Type |
| `browse-mist` / `browse-line` | `#f0edfc` / `#c8bbf6` | `#20213b` / `#464072` | Same, for Browse |
| `make-mist` / `make-line` | `#fcecf2` / `#f5b9d0` | `#2b2032` / `#673e57` | Same, for Make |
| `store-mist` / `store-line` | `#fcf4e4` / `#f3d89b` | `#2a2825` / `#665530` | Same, for Store |
| `canvas` | `surface-glass` | `surface` | The desk behind pages and lists |
| `page` | `#ffffff` | `surface-glass` | Paper, message cards |
| `scrim` | `rgba(20,26,46,.32)` | `rgba(0,0,0,.55)` | Behind dialogs and drawers |
| `danger` / `danger-mist` | `#b42318` / `#fdecea` | `#ff9b8f` / `#3a1f22` | Errors, destructive actions |
| `success` / `success-mist` | `type-deep` / `type-mist` | `type-deep` / `type-mist` | Confirmations (reuse mint, never a new green) |
| `warning` / `warning-mist` | `store-deep` / `store-mist` | `store-deep` / `store-mist` | Cautions (reuse gold) |
| `selection` | `rgba(112,147,248,.24)` | `rgba(112,147,248,.35)` | Text selection |
| `tooltip-bg` / `tooltip-ink` | `ink` / `surface` | `ink` / `surface` | Tooltips, toasts |

Each product's `-deep` text holds at least 4.5:1 on its `-mist`, in both themes. These were checked
when derived: Write 5.0 / 8.6, Type 4.7 / 9.6, Browse 6.6 / 7.4, Make 5.6 / 8.4, Store 5.6 / 10.3.

**Non-colour tokens:**

| Group | Tokens |
| --- | --- |
| Duration | `dur-hover` 160ms, `dur-panel` 320ms, `dur-hero` 640ms |
| Ease | `cubic-bezier(.22,1,.36,1)` |
| Layout | `bar-h` 64px (56 on phones), `rail-w` 60px, `panel-w` 296px, `list-w` 360px, `dock-h` 52px |
| Z-index | content 1, sticky 10, dock 20, drawer 40, popover 1000, toast 2000, tooltip 3000 |
| Breakpoints | phone ≤ 560, narrow ≤ 860, wide ≥ 1180 |
| Control heights | 52px (the new-item button), 44px (buttons and inputs), 36px (small buttons and inputs), 32px (toolbar and icon buttons) |

### 9.3 Iconography (decided)

- **Set:** [Lucide](https://lucide.dev), ISC licence: rounded monoline, matching the wordmark's round caps and joins.
  - Stroke: 1.75px at 18–24px; 2px at 16px and below.
  - Colour: `ink-muted` at rest, `ink` on hover, and the product's `-deep` colour when active.
  - Icons never carry meaning alone: give them a label or a tooltip.
- **Same action, same icon, everywhere:**

| Action | Lucide icon | Action | Lucide icon |
| --- | --- | --- | --- |
| Share / add people | `user-plus` | Comment | `message-square` |
| Add comment | `message-square-plus` | Notifications | `bell` |
| New | `plus` | Search | `search` |
| More actions | `ellipsis` (menu) / `chevron-down` (document menu) | Settings | `settings` or `sliders-horizontal` |
| Delete | `trash-2` | Remove from my list | `log-out` |
| Copy | `copy` | Rename | `pen-line` |
| Download | `download` | Print | `printer` |
| Undo / redo | `undo-2` / `redo-2` | Close | `x` |
| Saved to account | `cloud-check` | Saved on this device only | `hard-drive` |
| Not saved / offline | `cloud-off` | Conflict / warning | `triangle-alert` |
| Insert image | `image-plus` | Link | `link-2` |
| Outline | `panel-left` | Spelling | `spell-check-2` |
| Citations / academic | `graduation-cap` | Page break | `file-stack` |
| Keyboard shortcuts | `keyboard` | Light / dark | `moon` / `sun` |
| **Type:** inbox | `inbox` | **Type:** compose | `square-pen` |
| **Type:** send | `send-horizontal` | **Type:** reply / reply all / forward | `reply` / `reply-all` / `forward` |
| **Type:** archive | `archive` | **Type:** attachment | `paperclip` |
| **Type:** draft | `file-pen` | **Type:** spam | `shield-alert` |
| **Type:** mute | `bell-off` | **Type:** contacts | `contact` |
| **Type:** ELUM address / verified | `at-sign` / `badge-check` | **Type:** images blocked | `image-off` |
| **Store:** folder / upload | `folder` / `upload` | **Browse:** history | `history` |

- **Product glyphs:** small monoline versions of each product mark, for places where the full-colour mark is too detailed:
  - the app switcher;
  - the dot at the start of a notification;
  - tabs;
  - 16–24px menus.

  Use the glass marks (from the kit) everywhere else. The SVGs are in Appendix C and in Write's `public/brand/icons/`. They take `currentColor`: set it to the product's `-deep` colour (or its main colour on dark).

### 9.4 Components

Every component is built from the tokens and follows these specs. Write's implementation is named
in brackets.

| Component | Spec |
| --- | --- |
| Buttons (`.elum-btn`) | Pill shape, 600 weight 15px, 44px tall (`--sm` 36px). **Primary** is `action` blue, the platform action (sign in, save). **Product primary** fills with the product colour and `#141a2e` text, used once per view for the product's signature action (Write: Share and New document; Type: Send and Compose). **Secondary** is outlined. **Quiet** is text only in `action`. **Danger**. Focus: 2px `action` ring, offset 2px. |
| Icon button (`.icon-btn`) | 32px square (`--round` circle; 40px in the rail), icon 18px; active state `accent-mist` ground with an `accent-deep` icon. |
| Inputs (`.input`, `.select`) | 44px (`--sm` 36px), 1.5px border, 8px radius; focus border `action` with a 3px `elum-mist` halo; errors in `danger` with text below. |
| Chips (`.chip`) | 26px pill, 1px `hairline`; pressed state `accent-mist` ground with an `accent` border and `accent-deep` text. Used for filters, zoom levels, kinds of source, address chips. |
| Switch (`.switch`) | 38 × 22 track; the on state fills with the product colour. |
| Segmented control (`.segmented`) | Pill group on `surface-glass`; the selected segment is `surface` with a shadow. |
| Menu / popover (`Menu`, `Popover`) | `surface`, 8px radius (`radius-sm`), `shadow-glass`, 6px padding; items 36px with an icon, label, shortcut (mono) and check. Menus flip above near the bottom edge. |
| Dialog (`Dialog`) | Native `<dialog>`, 28px radius (`radius-lg`), title in display 22px, description muted, footer buttons on the right (cancel first, action last). |
| Toast (`Toast`) | Inverted pill at the bottom centre, an optional action, auto-dismiss after 5s, `role=status`. |
| Tooltip (`TooltipLayer`) | Inverted, 12px text; below by default, beside the rail, above the dock. |
| Avatar (`Avatar`) | Circle in the person's colour with initials in `#141a2e`. |
| Badges | Uppercase `label` style on `accent-mist`, such as "View only" or "From ELUM". |
| Loader (`Loader`) | The product loader at 18–64px. The brand loader on account pages. A still mark when people prefer reduced motion. |
| Save / send status | Loader with "Saving", then an icon with where it went ("Saved to your account"). Errors in `danger` with what happens next ("Not saved yet. Trying again"). |
| Empty state | Product glass mark (64–72px), a display heading, one sentence, one action. |
| Notification bell (`NotificationBell`) | Section 6.3. |

### 9.5 Layout patterns

- **App bar (64px):**
  - left: the product lockup, or mark plus title in a document context;
  - middle: search, on list screens;
  - right: product actions, the bell, the theme toggle and the avatar menu.
  - It has a `surface` ground and a hairline bottom border.
- **Tool rail (60px):**
  - 40px icon buttons;
  - the active one has `accent-mist` and a 3px accent bar on its left edge;
  - utility buttons (shortcuts, help) sit at the bottom;
  - tooltips sit on the right;
  - a badge for counts (`danger` for problems).
- **Side panel (296px):** a title in display 16px, a close button, and sections separated by small `label` headings. On narrow screens it becomes a drawer with a scrim.
- **Dock:**
  - formatting or reply tools in a floating glass bar: 52px tall with a 20px radius, centred at the bottom of the content;
  - background `surface` at 86% with a 16px blur;
  - menus open upward.
- **Status bar:** small mono text at the bottom corners (counts, zoom).
- **Lists:** rows 56–72px, with the avatar or icon left, two lines of text, and meta right. Selected rows use `accent-mist`; unread rows use bold title text and a mint dot in Type.

### 9.6 Shared screens

- **Sign in / sign up** (all products and `account.`):
  - centred card on `canvas`, with the ELUM lockup on account pages or the product lockup inside a product;
  - fields for name (sign-up), email and password;
  - the account-type choice at sign-up:
    - "Use my email": an external account;
    - "Get an ELUM address": a Type account;
  - the brand loader while working;
  - errors in plain words.
- **App switcher:**
  - opened from the ELUM mark in the user menu;
  - shows the five product glyphs in brand order (Write, Type, Browse, Make, Store) with names;
  - planned services are greyed, with "Coming soon";
  - uses the spectrum loader while switching.
- **Account pages:** section 3.8, in ELUM blue (platform), not a product colour.

### 9.7 Native apps (later)

- Take colours from `tokens.json` plus Appendix B into asset catalogs (iOS) or `colors.xml` (Android).
- Bundle Sora, Manrope and IBM Plex Mono.
- Use the same Lucide SVGs. Do not substitute SF Symbols or Material icons, so the family looks the same everywhere.
- Platform conventions win for navigation (tab bars, back gestures), but colours, type, icons, words and loaders stay ELUM's.

### 9.8 Accessibility checklist (every screen)

- **Contrast:** text at least 4.5:1 and large text at least 3:1. The `-deep` tokens are built for this, and product main colours are never small text on light grounds.
- **Keyboard:** everything works by keyboard; focus is always visible (the `action` ring); dialogs trap focus and Escape closes them.
- **Assistive technology:** icon buttons have labels; live regions announce saving and sending; avatars are decorative when a name is next to them.
- **Motion:** reduced motion shows still marks and turns off slides.
- **Phones:** 44px touch targets on phones; nothing scrolls sideways at 360px wide.

---

## 10. Operations

- **Environments:**
  - one Supabase project per environment (production, and later staging);
  - each app sets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_ELUM_COOKIE_DOMAIN`;
  - the service role key lives only in edge function secrets and CI, never in an app.
- **Migrations:**
  - **Ownership.** Platform migrations (`*_elum_platform*.sql`) live in one place, the Write repository today; move them to an `elum-platform` repository once a second service ships. Each service's migrations touch only its own schema.
  - **Naming.** Use timestamped names so they apply in order across repositories: `YYYYMMDDHHMMSS_<service>_<what>.sql`.
  - **Tests.** Each repository runs its own SQL tests against a database with every migration applied, using Write's `supabase/tests/supabase-stub.sql` approach.
- **Supabase dashboard settings:**
  - Authentication:
    - email confirmations on;
    - minimum password length 8;
    - leaked password protection on;
    - captcha on for sign-up;
    - Site URL and Redirect URLs for every product domain;
    - SMTP set to Brevo.
  - API:
    - add `type` to the exposed schemas if Type reads tables directly;
    - `elum` is never exposed.
  - Realtime: on for `elum.notifications` (the migration adds it to the publication).
  - Extensions: `pg_cron` and `pg_net` for the workers' schedules.
- **Workers:** each worker is an edge function on a schedule. `pg_cron` calls it every minute with a shared `CRON_SECRET`; see `send-share-emails` in Write. Workers must be idempotent and finish or retry every delivery they claim.
- **Monitoring:** these deliveries need attention:
  - status `failed`;
  - status `pending` with `available_at` more than an hour old.

  Watch `elum.deliveries` for them. Add a daily check that alerts the team by email.

---

## 11. Checklist and open decisions

### For the next agent (Type)

1. Read sections 1–3, 5, 6, 8 and 9.
2. Create the Type app (Vite, React and TypeScript, like Write). Copy Write's:
   - tokens and base CSS;
   - `components/` (Menu, Popover, Dialog, Toast, TooltipLayer, Avatar, Loader, NotificationBell);
   - `api/errors.ts` and `api/supabase/cookieStorage.ts`.

   Set the accent to Type's mint.
3. Write the `type` schema migration (section 8.4) with row level security and tests.
4. Build the edge functions:
   - `type-signup` (section 3.4);
   - `type-send` (outbound through Brevo);
   - `type-inbound` (webhook);
   - `type-inbox-worker` (consumer).
5. Switch on the `type-inbox` consumer, and set Type's service status to `beta`.
6. Meet the acceptance list in section 8.6.

### Decisions for the owner

| Decision | Options / note |
| --- | --- |
| Family domain | Replaces `elum.example` everywhere. Needed for shared sign-in. |
| Type mail domain | Such as `elumtype.com`, or a subdomain of the family domain. Update `elum.config.type_domain`. Choose before anyone takes a handle, because addresses are permanent. |
| Inbound mail provider | Brevo inbound parsing (one vendor), or a dedicated inbound service. |
| Recovery for Type accounts | Is a recovery email required or optional? Optional is friendlier; required is safer. |
| Central account site | Build `account.elum.example` now, or keep sign-in inside each product for the first Type release. |
| Who can find whom | People search reaches every signed-in account today. Consider limiting it to people you have shared or written with. |

---

## Appendix A: platform SQL

This is a copy of `supabase/migrations/20261020000000_elum_platform.sql` from the Write
repository. That file is applied to the shared Supabase project and wins if the two ever differ.
It depends on Write's earlier migrations, which create `public.profiles` and the sharing tables.

```sql
-- ELUM platform: what every service (Write, Type, Browse, Make, Store) shares in one Supabase project.
--
--   Accounts       public.profiles is the ELUM account (one per person, for every service).
--   Addresses      elum.addresses: every email address that reaches an account (login, Type, aliases).
--   Services       elum.services and elum.service_accounts: which services exist and who uses them.
--   Events         elum.events: one outbox for everything that happens; consumers (Type's inbox, the
--                  email sender, search indexers ...) each get their own delivery queue.
--   Notifications  elum.notifications: what people see in any service's bell.
--   Guards         elum.rate_limits and elum.audit_log.
--
-- Rules every service follows (docs/ELUM-PLATFORM.md has the full contract):
--   - Apps never read the elum schema directly. They call public.elum_* functions, which
--     check who is asking. The tables can change behind them.
--   - A service's own data lives in its own tables (Write's are in public for now; new services
--     use their own schema, such as type.*) and references accounts by public.profiles(id).
--   - Services tell each other things only through events, never by writing each other's tables.
--
-- Run after 20261019000000_preferences.sql. Safe to run once.

create schema if not exists elum;
revoke all on schema elum from public, anon, authenticated;
grant usage on schema elum to service_role;

-- Platform settings, such as the domain Type addresses live on.
create table elum.config (
  key text primary key,
  value text not null
);
insert into elum.config (key, value) values ('type_domain', 'type.elum.example');

-- ---------------------------------------------------------------- services

create table elum.services (
  id text primary key check (id ~ '^[a-z][a-z0-9]{1,30}$'),
  name text not null,
  kind text not null default 'product' check (kind in ('platform', 'product')),
  -- Brand token for the service's colour (see the brand kit).
  color_token text not null,
  url text,
  status text not null default 'planned' check (status in ('planned', 'beta', 'active', 'retired')),
  sort integer not null default 100
);

insert into elum.services (id, name, kind, color_token, status, sort) values
  ('elum', 'ELUM', 'platform', 'elum-blue', 'active', 0),
  ('write', 'Write', 'product', 'write', 'active', 10),
  ('type', 'Type', 'product', 'type', 'planned', 20),
  ('browse', 'Browse', 'product', 'browse', 'planned', 30),
  ('make', 'Make', 'product', 'make', 'planned', 40),
  ('store', 'Store', 'product', 'store', 'planned', 50);

-- Which services each account uses, and on what plan.
create table elum.service_accounts (
  account_id uuid not null references public.profiles (id) on delete cascade,
  service_id text not null references elum.services (id),
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  plan text not null default 'free',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (account_id, service_id)
);

-- ---------------------------------------------------------------- accounts

-- The account record every service shares. account_type is set only by the server:
-- 'external' for people who sign up with their own email, 'type' for ELUM Type addresses.
alter table public.profiles
  add column handle text unique check (handle ~ '^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$'),
  add column status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  add column locale text check (char_length(locale) <= 35),
  add column time_zone text check (char_length(time_zone) <= 64),
  add column updated_at timestamptz not null default now();

comment on table public.profiles is
  'The ELUM account: one per person, shared by every ELUM service. Services reference accounts by id.';
comment on column public.profiles.handle is
  'Unique name for Type: the part before @ in the person''s Type address. Set by the server.';

-- Names nobody can take as a handle.
create table elum.reserved_handles (handle text primary key);
insert into elum.reserved_handles (handle) values
  ('admin'), ('administrator'), ('elum'), ('support'), ('help'), ('security'), ('abuse'), ('postmaster'),
  ('hostmaster'), ('webmaster'), ('noreply'), ('no-reply'), ('mailer-daemon'), ('root'), ('system'),
  ('write'), ('type'), ('browse'), ('make'), ('store'), ('billing'), ('privacy'), ('legal'), ('team'), ('hello');

-- Every address that reaches an account.
--   login    the address the person signs in with (auth.users.email)
--   type     their ELUM Type address, handle@<type_domain>
--   alias    other addresses they have verified
create table elum.addresses (
  address text primary key check (address = lower(btrim(address)) and address ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  account_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('login', 'type', 'alias')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index addresses_account_idx on elum.addresses (account_id);

-- Keeps the login address in step with Supabase Auth: added at sign-up, verified when confirmed,
-- moved when the email changes. Named to fire after on_auth_user_created, so the profile exists.
create function elum.sync_login_address() returns trigger
language plpgsql security definer set search_path = elum, public as $$
begin
  if new.email is null or not exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email is distinct from new.email then
    delete from elum.addresses where account_id = new.id and kind = 'login' and address <> lower(new.email);
  end if;
  insert into elum.addresses (address, account_id, kind, verified_at)
  values (lower(new.email), new.id, 'login', new.email_confirmed_at)
  on conflict (address) do update
    set verified_at = coalesce(elum.addresses.verified_at, excluded.verified_at)
    where elum.addresses.account_id = excluded.account_id;
  return new;
end $$;

create trigger on_auth_user_created_address
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function elum.sync_login_address();

-- Accounts that already exist.
insert into elum.addresses (address, account_id, kind, verified_at)
select lower(u.email), u.id, 'login', u.email_confirmed_at
from auth.users u join public.profiles p on p.id = u.id
where u.email is not null
on conflict (address) do nothing;

-- The account an address belongs to, if any. Only verified addresses count, except a login
-- address (it is how the person signs in). Every service resolves people through this.
create function elum.account_for_address(p_address text) returns uuid
language sql stable security definer set search_path = elum, public as $$
  select a.account_id
  from elum.addresses a join public.profiles p on p.id = a.account_id
  where a.address = lower(btrim(p_address)) and p.status = 'active'
    and (a.verified_at is not null or a.kind = 'login')
  limit 1
$$;

-- Gives an account its Type address. Server only: Type's sign-up function calls it after
-- creating the auth user (whose email is this same address, confirmed by construction).
create function elum.assign_type_address(p_account uuid, p_handle text) returns text
language plpgsql security definer set search_path = elum, public as $$
declare
  v_handle text := lower(btrim(p_handle));
  v_address text;
begin
  if v_handle !~ '^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$' or v_handle ~ '[._-]{2}' then
    raise exception using errcode = 'PT400', message = 'Handles are 3 to 30 letters, numbers, dots, dashes or underscores.';
  end if;
  if exists (select 1 from elum.reserved_handles where handle = v_handle) then
    raise exception using errcode = 'PT409', message = 'That name is not available.';
  end if;
  v_address := v_handle || '@' || (select value from elum.config where key = 'type_domain');
  begin
    update public.profiles set handle = v_handle, account_type = 'type', updated_at = now() where id = p_account;
    insert into elum.addresses (address, account_id, kind, verified_at) values (v_address, p_account, 'type', now());
  exception when unique_violation then
    raise exception using errcode = 'PT409', message = 'That name is taken.';
  end;
  return v_address;
end $$;

-- How to reach an account outside an app: its Type inbox, or email at its login address.
create function elum.delivery_channel(p_account uuid) returns text
language sql stable security definer set search_path = elum, public as $$
  select case when account_type = 'type' then 'type_inbox' else 'email' end
  from public.profiles where id = p_account
$$;

-- -------------------------------------------------------------------- events

-- Every kind of event, named service.object.verb. `notify` events also create a notification
-- for their recipient from payload.notification = {title, body, link}.
create table elum.event_types (
  type text primary key check (type ~ '^[a-z]+\.[a-z_]+\.[a-z_]+$'),
  service_id text not null references elum.services (id),
  version integer not null default 1,
  notify boolean not null default false,
  description text not null
);

insert into elum.event_types (type, service_id, notify, description) values
  ('elum.account.created', 'elum', false, 'A new ELUM account. Payload: {accountType}.'),
  ('elum.account.deleted', 'elum', false, 'An account is being deleted; services remove what is theirs.'),
  ('elum.address.verified', 'elum', false, 'An address was verified for an account. Payload: {address, kind}.'),
  ('elum.service.joined', 'elum', false, 'An account used a service for the first time. Payload: {service}.'),
  ('write.document.shared', 'write', true, 'Someone was given access to a document. Payload: {docId, title, role, notification}.'),
  ('write.document.invited', 'write', false, 'An address without an account was invited to a document. Payload: {docId, title, role}.'),
  ('write.comment.created', 'write', true, 'A comment on a document. Payload: {docId, commentId, quote, notification}.'),
  ('write.comment.replied', 'write', true, 'A reply in a comment thread. Payload: {docId, commentId, notification}.'),
  ('type.message.received', 'type', true, 'A message arrived in a Type inbox. Payload: {threadId, messageId, from, subject, notification}.');

create table elum.events (
  id bigint generated always as identity primary key,
  type text not null references elum.event_types (type),
  source text not null references elum.services (id),
  actor_id uuid references public.profiles (id) on delete set null,
  -- Who the event is for: an account, or an address with no account yet (invites).
  recipient_id uuid references public.profiles (id) on delete cascade,
  recipient_address text,
  -- What it is about, as service:kind:id (write:document:<uuid>), for grouping and clean-up.
  subject text,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) < 65536),
  -- The same key never makes a second event, so a retried request is safe.
  idempotency_key text unique check (char_length(idempotency_key) <= 200),
  created_at timestamptz not null default now()
);
create index events_recipient_idx on elum.events (recipient_id, created_at desc);
create index events_subject_idx on elum.events (subject);

-- Consumers: workers that act on events (Type's inbox, the email sender ...). Each matches
-- event types by pattern, such as 'write.%' or 'write.document.shared'.
create table elum.consumers (
  id text primary key check (id ~ '^[a-z][a-z0-9_-]{1,40}$'),
  service_id text not null references elum.services (id),
  patterns text[] not null,
  active boolean not null default true,
  description text not null
);

-- Both start switched off, so nothing queues up for a worker that does not exist yet. Each is
-- switched on (update elum.consumers set active = true where id = ...) when its worker ships.
insert into elum.consumers (id, service_id, patterns, active, description) values
  ('email', 'elum', array['write.document.shared', 'write.document.invited', 'write.comment.%'], false,
   'Emails people whose channel is email (Brevo), after checking their notification settings. Replaces Write''s send-share-emails.'),
  ('type-inbox', 'type', array['write.%', 'elum.account.%'], false,
   'Puts events for Type accounts into their Type inbox. Owned by Type.');

-- One delivery per event and consumer: a queue each worker drains at its own pace.
create table elum.deliveries (
  event_id bigint not null references elum.events (id) on delete cascade,
  consumer_id text not null references elum.consumers (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'skipped', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  finished_at timestamptz,
  primary key (event_id, consumer_id)
);
create index deliveries_ready_idx on elum.deliveries (consumer_id, available_at) where status in ('pending', 'processing');

-- Notifications people see in any service.
create table elum.notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.profiles (id) on delete cascade,
  event_id bigint references elum.events (id) on delete set null,
  service_id text not null references elum.services (id),
  type text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 1000),
  -- Where it opens: a full URL or a path inside the service.
  link text check (char_length(link) <= 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_account_idx on elum.notifications (account_id, created_at desc);

-- Per-person choice of channel for each event type. No row means the default: in-app plus
-- the account's channel (Type inbox or email).
create table elum.notification_settings (
  account_id uuid not null references public.profiles (id) on delete cascade,
  type text not null references elum.event_types (type) on delete cascade,
  in_app boolean not null default true,
  outside boolean not null default true,
  primary key (account_id, type)
);

-- Records an event, fans it out to consumers and creates its notification. Server only:
-- services call it from their own security-definer functions and triggers, or from edge
-- functions with the service role. Returns the event id (the existing one for a repeated key).
create function elum.emit(
  p_type text,
  p_actor uuid,
  p_recipient uuid,
  p_payload jsonb default '{}',
  p_subject text default null,
  p_idempotency_key text default null,
  p_recipient_address text default null
) returns bigint
language plpgsql security definer set search_path = elum, public as $$
declare
  t elum.event_types;
  v_id bigint;
  v_note jsonb;
begin
  select * into t from elum.event_types where type = p_type;
  if t.type is null then
    raise exception using errcode = 'PT400', message = format('Unknown event type %s.', p_type);
  end if;
  if p_idempotency_key is not null then
    select id into v_id from elum.events where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  insert into elum.events (type, source, actor_id, recipient_id, recipient_address, subject, payload, idempotency_key)
  values (p_type, t.service_id, p_actor, p_recipient, lower(nullif(btrim(p_recipient_address), '')), p_subject, coalesce(p_payload, '{}'), p_idempotency_key)
  returning id into v_id;

  insert into elum.deliveries (event_id, consumer_id)
  select v_id, c.id from elum.consumers c
  where c.active and exists (select 1 from unnest(c.patterns) pat where p_type like pat);

  v_note := p_payload -> 'notification';
  if t.notify and p_recipient is not null and p_recipient is distinct from p_actor
     and jsonb_typeof(v_note) = 'object' and coalesce(v_note ->> 'title', '') <> ''
     and coalesce((select in_app from elum.notification_settings s where s.account_id = p_recipient and s.type = p_type), true) then
    insert into elum.notifications (account_id, event_id, service_id, type, actor_id, title, body, link)
    values (p_recipient, v_id, t.service_id, p_type, p_actor, left(v_note ->> 'title', 200), left(v_note ->> 'body', 1000), left(v_note ->> 'link', 500));
  end if;
  return v_id;
end $$;

-- Workers: take a batch, then mark each delivery done, skipped or failed.
create function elum.claim_deliveries(p_consumer text, p_limit integer default 50, p_lease_seconds integer default 120)
returns table (event_id bigint, attempts integer, type text, actor_id uuid, recipient_id uuid, recipient_address text,
               subject text, payload jsonb, created_at timestamptz, channel text)
language plpgsql security definer set search_path = elum, public as $$
begin
  return query
  with ready as (
    select d.event_id from elum.deliveries d
    where d.consumer_id = p_consumer
      and ((d.status = 'pending' and d.available_at <= now()) or (d.status = 'processing' and d.locked_until < now()))
    order by d.available_at
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  ), taken as (
    update elum.deliveries d
       set status = 'processing', attempts = d.attempts + 1, locked_until = now() + make_interval(secs => p_lease_seconds)
      from ready where d.event_id = ready.event_id and d.consumer_id = p_consumer
    returning d.event_id, d.attempts
  )
  select e.id, taken.attempts, e.type, e.actor_id, e.recipient_id, e.recipient_address, e.subject, e.payload, e.created_at,
         case when e.recipient_id is null then 'email' else elum.delivery_channel(e.recipient_id) end
  from taken join elum.events e on e.id = taken.event_id
  order by e.id;
end $$;

create function elum.finish_delivery(p_consumer text, p_event bigint, p_status text default 'done', p_error text default null)
returns void
language plpgsql security definer set search_path = elum, public as $$
declare
  v_attempts integer;
begin
  if p_status in ('done', 'skipped') then
    update elum.deliveries set status = p_status, finished_at = now(), locked_until = null, last_error = null
    where event_id = p_event and consumer_id = p_consumer;
  elsif p_status = 'retry' then
    -- Back off: 1, 2, 4 ... minutes, at most 6 hours; give up after 10 tries.
    update elum.deliveries
       set status = case when attempts >= 10 then 'failed' else 'pending' end,
           available_at = now() + least(make_interval(mins => power(2, greatest(attempts - 1, 0))::integer), interval '6 hours'),
           locked_until = null, last_error = left(p_error, 1000),
           finished_at = case when attempts >= 10 then now() end
     where event_id = p_event and consumer_id = p_consumer
    returning attempts into v_attempts;
  else
    raise exception using errcode = 'PT400', message = 'Status is done, skipped or retry.';
  end if;
end $$;

-- ------------------------------------------------------------ rate limits

create table elum.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- Counts one use of `p_key` in a fixed window; true while under `p_limit`. Signed-in callers'
-- keys are scoped to their account, so nobody can use up someone else's allowance.
create function elum.take_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = elum, public as $$
declare
  v_key text := case when auth.uid() is not null then auth.uid()::text || ':' || p_key else p_key end;
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into elum.rate_limits (key, window_start, count) values (v_key, v_start, 1)
  on conflict (key, window_start) do update set count = elum.rate_limits.count + 1
  returning count into v_count;
  -- Old windows are cleared now and then.
  if random() < 0.01 then delete from elum.rate_limits where window_start < now() - interval '1 day'; end if;
  return v_count <= p_limit;
end $$;

-- ----------------------------------------------------------------- audit log

-- Security-relevant changes to an account: sign-in from a new device, password or address
-- changes, handle changes, sessions revoked. Written by the server; people read their own.
create table elum.audit_log (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  service_id text references elum.services (id),
  action text not null check (action ~ '^[a-z]+\.[a-z_.]+$'),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_account_idx on elum.audit_log (account_id, created_at desc);

create function elum.audit(p_account uuid, p_action text, p_service text default 'elum', p_detail jsonb default '{}')
returns void
language sql security definer set search_path = elum, public as $$
  insert into elum.audit_log (account_id, actor_id, service_id, action, detail)
  values (p_account, auth.uid(), p_service, p_action, coalesce(p_detail, '{}'))
$$;

-- -------------------------------------------------------- account events

create function elum.on_profile_created() returns trigger
language plpgsql security definer set search_path = elum, public as $$
begin
  perform elum.emit('elum.account.created', new.id, new.id, jsonb_build_object('accountType', new.account_type),
                    'elum:account:' || new.id, 'elum.account.created:' || new.id);
  return new;
end $$;

create trigger profiles_account_created
  after insert on public.profiles
  for each row execute function elum.on_profile_created();

create function elum.on_address_verified() returns trigger
language plpgsql security definer set search_path = elum, public as $$
begin
  if new.verified_at is not null and (tg_op = 'INSERT' or old.verified_at is null) then
    perform elum.emit('elum.address.verified', new.account_id, new.account_id,
                      jsonb_build_object('address', new.address, 'kind', new.kind),
                      'elum:account:' || new.account_id, 'elum.address.verified:' || new.address || ':' || new.account_id);
  end if;
  return new;
end $$;

create trigger addresses_verified
  after insert or update of verified_at on elum.addresses
  for each row execute function elum.on_address_verified();

-- ------------------------------------------------------------- Write events

-- Shares and invites become events: notifications now, Type inbox delivery once Type exists.
-- Write's own share emails (public.share_emails) keep working alongside until the platform's
-- email consumer replaces them.
create function public.emit_write_share_event() returns trigger
language plpgsql security definer set search_path = public, elum as $$
declare
  v_title text;
  v_actor uuid;
  v_actor_name text;
begin
  select title into v_title from public.documents where id = new.doc_id;
  if tg_table_name = 'document_shares' then
    v_actor := new.added_by;
    select name into v_actor_name from public.profiles where id = v_actor;
    perform elum.emit('write.document.shared', v_actor, new.user_id,
      jsonb_build_object('docId', new.doc_id, 'title', v_title, 'role', new.role,
        'notification', jsonb_build_object(
          'title', coalesce(v_actor_name, 'Someone') || ' shared “' || coalesce(v_title, 'a document') || '” with you',
          'body', 'You can ' || case new.role when 'viewer' then 'view' when 'commenter' then 'comment' else 'edit' end || '.',
          'link', '/d/' || new.doc_id)),
      'write:document:' || new.doc_id);
  else
    perform elum.emit('write.document.invited', new.invited_by, null,
      jsonb_build_object('docId', new.doc_id, 'title', v_title, 'role', new.role),
      'write:document:' || new.doc_id, null, new.email);
  end if;
  return new;
end $$;

create trigger document_shares_event
  after insert on public.document_shares
  for each row when (new.added_by is distinct from new.user_id and current_setting('elum.claiming', true) is distinct from 'on')
  execute function public.emit_write_share_event();

create trigger document_invites_event
  after insert on public.document_invites
  for each row execute function public.emit_write_share_event();

create function public.emit_write_comment_event() returns trigger
language plpgsql security definer set search_path = public, elum as $$
declare
  v_doc uuid;
  v_title text;
  v_owner uuid;
  v_to uuid;
  v_name text;
begin
  if tg_table_name = 'comments' then
    v_doc := new.doc_id;
    select title, owner_id into v_title, v_owner from public.documents where id = v_doc;
    v_to := v_owner;
  else
    select c.doc_id, c.author_id into v_doc, v_to from public.comments c where c.id = new.comment_id;
    select title into v_title from public.documents where id = v_doc;
  end if;
  if v_to is null or v_to = new.author_id then return new; end if;
  select name into v_name from public.profiles where id = new.author_id;
  perform elum.emit(
    case when tg_table_name = 'comments' then 'write.comment.created' else 'write.comment.replied' end,
    new.author_id, v_to,
    jsonb_build_object('docId', v_doc, 'commentId', coalesce(to_jsonb(new) ->> 'comment_id', to_jsonb(new) ->> 'id'),
      'notification', jsonb_build_object(
        'title', coalesce(v_name, 'Someone') || case when tg_table_name = 'comments' then ' commented on “' else ' replied to you in “' end
                 || coalesce(v_title, 'a document') || '”',
        'body', left(new.body, 200),
        'link', '/d/' || v_doc)),
    'write:document:' || v_doc);
  return new;
end $$;

create trigger comments_event
  after insert on public.comments
  for each row execute function public.emit_write_comment_event();

create trigger comment_replies_event
  after insert on public.comment_replies
  for each row execute function public.emit_write_comment_event();

-- Sharing with any of someone's addresses (their Type address, a verified alias) reaches their account.
create or replace function public.share_by_email(p_doc uuid, p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_owner uuid;
  v_user uuid;
begin
  if not public.has_doc_role(p_doc, 'editor') then
    raise exception using errcode = 'PT403', message = 'Only the owner and editors can add people.';
  end if;
  if p_role not in ('viewer', 'commenter', 'editor') then
    raise exception using errcode = 'PT400', message = 'Choose a role.';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using errcode = 'PT400', message = 'Enter a valid email address.';
  end if;
  if not elum.take_rate_limit('write.share_by_email', 60, 3600) then
    raise exception using errcode = 'PT429', message = 'You have shared a lot in the last hour. Try again later.';
  end if;

  select owner_id into v_owner from public.documents where id = p_doc;
  v_user := coalesce(elum.account_for_address(v_email), (select id from public.profiles where lower(email) = v_email));

  if v_user is not null then
    if v_user = v_owner then
      raise exception using errcode = 'PT400', message = 'The owner already has full access.';
    end if;
    insert into public.document_shares (doc_id, user_id, role, added_by)
    values (p_doc, v_user, p_role, auth.uid())
    on conflict (doc_id, user_id) do update set role = excluded.role;
    return jsonb_build_object('kind', 'share', 'userId', v_user);
  end if;

  insert into public.document_invites (doc_id, email, role, invited_by)
  values (p_doc, v_email, p_role, auth.uid())
  on conflict (doc_id, email) do update set role = excluded.role;
  return jsonb_build_object('kind', 'invite', 'email', v_email);
end $$;

-- --------------------------------------------------------------- public API
--
-- What apps call (supabase.rpc('elum_...')). Each acts as the signed-in person.

-- The signed-in account: profile, addresses, services and unread notifications.
create function public.elum_me() returns jsonb
language plpgsql stable security definer set search_path = elum, public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Sign in again.';
  end if;
  return (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'email', p.email, 'color', p.color, 'accountType', p.account_type,
      'handle', p.handle, 'status', p.status, 'locale', p.locale, 'timeZone', p.time_zone, 'createdAt', p.created_at,
      'addresses', coalesce((select jsonb_agg(jsonb_build_object('address', a.address, 'kind', a.kind, 'verified', a.verified_at is not null) order by a.kind, a.address)
                             from elum.addresses a where a.account_id = p.id), '[]'),
      'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status, 'joined', sa.account_id is not null,
                                                                 'plan', sa.plan, 'lastSeenAt', sa.last_seen_at) order by s.sort)
                            from elum.services s left join elum.service_accounts sa on sa.service_id = s.id and sa.account_id = p.id
                            where s.kind = 'product' and s.status <> 'retired'), '[]'),
      'unread', (select count(*) from elum.notifications n where n.account_id = p.id and n.read_at is null))
    from public.profiles p where p.id = v_me
  );
end $$;

-- Records that the signed-in person uses a service (call on every sign-in or app start).
create function public.elum_join_service(p_service text) returns jsonb
language plpgsql security definer set search_path = elum, public as $$
declare
  v_me uuid := auth.uid();
  v_new boolean;
begin
  if v_me is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Sign in again.';
  end if;
  if not exists (select 1 from elum.services where id = p_service and kind = 'product' and status in ('beta', 'active')) then
    raise exception using errcode = 'PT400', message = 'That service is not open yet.';
  end if;
  insert into elum.service_accounts (account_id, service_id) values (v_me, p_service)
  on conflict (account_id, service_id) do update set last_seen_at = now()
  returning (xmax = 0) into v_new;
  if v_new then
    perform elum.emit('elum.service.joined', v_me, v_me, jsonb_build_object('service', p_service),
                      'elum:account:' || v_me, 'elum.service.joined:' || p_service || ':' || v_me);
  end if;
  return jsonb_build_object('service', p_service, 'joined', v_new);
end $$;

-- Notifications for the signed-in person, newest first; `p_before` pages back.
create function public.elum_notifications(p_limit integer default 30, p_before timestamptz default null, p_unread_only boolean default false)
returns table (id uuid, service_id text, type text, title text, body text, link text, created_at timestamptz, read_at timestamptz,
               actor jsonb)
language sql stable security definer set search_path = elum, public as $$
  select n.id, n.service_id, n.type, n.title, n.body, n.link, n.created_at, n.read_at,
         case when a.id is null then null else jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color) end
  from elum.notifications n left join public.profiles a on a.id = n.actor_id
  where n.account_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
    and (not p_unread_only or n.read_at is null)
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- Marks notifications read (all of them when `p_ids` is null). Returns how many changed.
create function public.elum_mark_notifications_read(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = elum, public as $$
declare
  v_count integer;
begin
  update elum.notifications set read_at = now()
  where account_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Changes the signed-in person's notification choice for one event type.
create function public.elum_set_notification_setting(p_type text, p_in_app boolean, p_outside boolean) returns void
language plpgsql security definer set search_path = elum, public as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Sign in again.';
  end if;
  insert into elum.notification_settings (account_id, type, in_app, outside) values (auth.uid(), p_type, p_in_app, p_outside)
  on conflict (account_id, type) do update set in_app = excluded.in_app, outside = excluded.outside;
end $$;

-- Changes account details everyone may change themselves.
create function public.elum_update_account(p_locale text default null, p_time_zone text default null) returns void
language plpgsql security definer set search_path = elum, public as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'PT401', message = 'Your session has ended. Sign in again.';
  end if;
  update public.profiles set locale = coalesce(p_locale, locale), time_zone = coalesce(p_time_zone, time_zone), updated_at = now()
  where id = auth.uid();
end $$;

-- Whether a Type handle can be taken (for Type's sign-up form).
create function public.elum_handle_available(p_handle text) returns boolean
language plpgsql stable security definer set search_path = elum, public as $$
declare
  v text := lower(btrim(p_handle));
begin
  return v ~ '^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$' and v !~ '[._-]{2}'
     and not exists (select 1 from elum.reserved_handles where handle = v)
     and not exists (select 1 from public.profiles where handle = v);
end $$;

-- Server-side wrappers for workers and edge functions (service role only).
create function public.elum_emit(p_type text, p_actor uuid, p_recipient uuid, p_payload jsonb default '{}', p_subject text default null,
                                 p_idempotency_key text default null, p_recipient_address text default null) returns bigint
language sql security definer set search_path = elum, public as $$
  select elum.emit(p_type, p_actor, p_recipient, p_payload, p_subject, p_idempotency_key, p_recipient_address)
$$;
create function public.elum_claim_deliveries(p_consumer text, p_limit integer default 50, p_lease_seconds integer default 120)
returns table (event_id bigint, attempts integer, type text, actor_id uuid, recipient_id uuid, recipient_address text,
               subject text, payload jsonb, created_at timestamptz, channel text)
language sql security definer set search_path = elum, public as $$
  select * from elum.claim_deliveries(p_consumer, p_limit, p_lease_seconds)
$$;
create function public.elum_finish_delivery(p_consumer text, p_event bigint, p_status text default 'done', p_error text default null) returns void
language sql security definer set search_path = elum, public as $$
  select elum.finish_delivery(p_consumer, p_event, p_status, p_error)
$$;
create function public.elum_assign_type_address(p_account uuid, p_handle text) returns text
language sql security definer set search_path = elum, public as $$
  select elum.assign_type_address(p_account, p_handle)
$$;

-- ------------------------------------------------------------------ grants

revoke all on all tables in schema elum from public, anon, authenticated;
revoke all on all functions in schema elum from public, anon, authenticated;
grant all on all tables in schema elum to service_role;
grant execute on all functions in schema elum to service_role;

revoke all on function public.elum_me(), public.elum_join_service(text), public.elum_notifications(integer, timestamptz, boolean),
  public.elum_mark_notifications_read(uuid[]), public.elum_set_notification_setting(text, boolean, boolean),
  public.elum_update_account(text, text), public.elum_handle_available(text),
  public.elum_emit(text, uuid, uuid, jsonb, text, text, text), public.elum_claim_deliveries(text, integer, integer),
  public.elum_finish_delivery(text, bigint, text, text), public.elum_assign_type_address(uuid, text),
  public.emit_write_share_event(), public.emit_write_comment_event()
  from public, anon, authenticated;

grant execute on function public.elum_me(), public.elum_join_service(text), public.elum_notifications(integer, timestamptz, boolean),
  public.elum_mark_notifications_read(uuid[]), public.elum_set_notification_setting(text, boolean, boolean),
  public.elum_update_account(text, text) to authenticated;
-- Type's sign-up form checks names before an account exists.
grant execute on function public.elum_handle_available(text) to anon, authenticated;
grant execute on function public.elum_emit(text, uuid, uuid, jsonb, text, text, text), public.elum_claim_deliveries(text, integer, integer),
  public.elum_finish_delivery(text, bigint, text, text), public.elum_assign_type_address(uuid, text) to service_role;

-- Live notifications: apps subscribe to their own rows with Supabase Realtime.
alter table elum.notifications enable row level security;
create policy "people see their own notifications" on elum.notifications
  for select to authenticated using (account_id = auth.uid());
grant usage on schema elum to authenticated;
grant select on elum.notifications to authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table elum.notifications;
  end if;
end $$;

-- Row level security on everything else, with no client policies: server only.
alter table elum.config enable row level security;
alter table elum.services enable row level security;
alter table elum.service_accounts enable row level security;
alter table elum.reserved_handles enable row level security;
alter table elum.addresses enable row level security;
alter table elum.event_types enable row level security;
alter table elum.events enable row level security;
alter table elum.consumers enable row level security;
alter table elum.deliveries enable row level security;
alter table elum.notification_settings enable row level security;
alter table elum.rate_limits enable row level security;
alter table elum.audit_log enable row level security;
```

## Appendix B: token additions (JSON)

Merge into the kit's `tokens.json` under `color.tokens`. Values are `light` / `dark`.

```json
[
  {
    "name": "write-mist",
    "value": {
      "light": "#fdf0e4",
      "dark": "#2b2320"
    },
    "usage": "Write's active ground: selected rail items, pressed chips, highlighted rows. Holds write-deep text."
  },
  {
    "name": "write-line",
    "value": {
      "light": "#f8c79f",
      "dark": "#6b4a33"
    },
    "usage": "Write's active border and quiet rules."
  },
  {
    "name": "type-mist",
    "value": {
      "light": "#e2f6f1",
      "dark": "#142931"
    },
    "usage": "Type's active ground. Holds type-deep text (4.7:1 light, 9.6:1 dark)."
  },
  {
    "name": "type-line",
    "value": {
      "light": "#95dfcb",
      "dark": "#225953"
    },
    "usage": "Type's active border and quiet rules."
  },
  {
    "name": "browse-mist",
    "value": {
      "light": "#f0edfc",
      "dark": "#20213b"
    },
    "usage": "Browse's active ground. Holds browse-deep text."
  },
  {
    "name": "browse-line",
    "value": {
      "light": "#c8bbf6",
      "dark": "#464072"
    },
    "usage": "Browse's active border."
  },
  {
    "name": "make-mist",
    "value": {
      "light": "#fcecf2",
      "dark": "#2b2032"
    },
    "usage": "Make's active ground. Holds make-deep text."
  },
  {
    "name": "make-line",
    "value": {
      "light": "#f5b9d0",
      "dark": "#673e57"
    },
    "usage": "Make's active border."
  },
  {
    "name": "store-mist",
    "value": {
      "light": "#fcf4e4",
      "dark": "#2a2825"
    },
    "usage": "Store's active ground. Holds store-deep text."
  },
  {
    "name": "store-line",
    "value": {
      "light": "#f3d89b",
      "dark": "#665530"
    },
    "usage": "Store's active border."
  },
  {
    "name": "canvas",
    "value": {
      "light": "#f4f5f8",
      "dark": "#0e1220"
    },
    "usage": "The desk behind pages, lists and panels (surface-glass in light, surface in dark)."
  },
  {
    "name": "page",
    "value": {
      "light": "#ffffff",
      "dark": "#171c2e"
    },
    "usage": "Paper and message cards on the canvas."
  },
  {
    "name": "scrim",
    "value": {
      "light": "rgba(20,26,46,0.32)",
      "dark": "rgba(0,0,0,0.55)"
    },
    "usage": "Behind dialogs and drawers."
  },
  {
    "name": "danger",
    "value": {
      "light": "#b42318",
      "dark": "#ff9b8f"
    },
    "usage": "Errors and destructive actions. Text and icons."
  },
  {
    "name": "danger-mist",
    "value": {
      "light": "#fdecea",
      "dark": "#3a1f22"
    },
    "usage": "Ground for error messages and destructive confirmations."
  },
  {
    "name": "success",
    "value": {
      "light": "#187a5f",
      "dark": "#7ce0c3"
    },
    "usage": "Confirmations. The same as type-deep: ELUM has no separate green."
  },
  {
    "name": "success-mist",
    "value": {
      "light": "#e2f6f1",
      "dark": "#142931"
    },
    "usage": "Ground for confirmations (type-mist)."
  },
  {
    "name": "warning",
    "value": {
      "light": "#7f5c00",
      "dark": "#f5d58a"
    },
    "usage": "Cautions. The same as store-deep."
  },
  {
    "name": "warning-mist",
    "value": {
      "light": "#fcf4e4",
      "dark": "#2a2825"
    },
    "usage": "Ground for cautions (store-mist)."
  },
  {
    "name": "selection",
    "value": {
      "light": "rgba(112,147,248,0.24)",
      "dark": "rgba(112,147,248,0.35)"
    },
    "usage": "Text selection."
  }
]
```

## Appendix C: product glyphs (24px, monoline, `currentColor`)

| Glyph | Meaning |
| --- | --- |
| `elum` | The lens: two discs meeting, the meeting point filled |
| `write` | Two discs and a full stop |
| `type` | Three rising discs |
| `browse` | Large disc, small disc at its lower right |
| `make` | Four discs on a grid |
| `store` | A disc holding a smaller filled disc |

```html
<!-- elum.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/><path d="M12 7.8a5.5 5.5 0 0 1 0 8.4a5.5 5.5 0 0 1 0-8.4z" fill="currentColor" stroke="none"/></svg>
<!-- write.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6.75" cy="12" r="4.25"/><circle cx="13.25" cy="12" r="4.25"/><circle cx="20.25" cy="15.25" r="1.1" fill="currentColor" stroke="none"/></svg>
<!-- type.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="16.5" r="3.75"/><circle cx="12" cy="12" r="3.75"/><circle cx="18" cy="7.5" r="3.75"/></svg>
<!-- browse.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><circle cx="17.25" cy="17.25" r="3.5"/></svg>
<!-- make.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="4.4"/><circle cx="16" cy="8" r="4.4"/><circle cx="8" cy="16" r="4.4"/><circle cx="16" cy="16" r="4.4"/></svg>
<!-- store.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="14.5" r="2.6" fill="currentColor" stroke="none"/></svg>
```
