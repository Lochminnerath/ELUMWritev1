# Running ELUM Write on Supabase

Write uses three Supabase services:

| Service | Used for |
| --- | --- |
| Auth | Sign up, sign in, sessions (email and password) |
| Database | Profiles, documents, sharing, comments. Row level security enforces every permission. |
| Storage | Images placed in documents, in a private `assets` bucket |

The app talks to Supabase from the browser with the **anon key**. That is safe by
design: the database only returns what each signed-in person is allowed to see.
Never put the **service role key** in the app or in `.env`.

## Set up a project

1. **Create the schema.** Open the project's SQL editor and run each file in
   `migrations/` in order (`20261017000000_elum_write.sql`, then
   `20261018000000_accounts_and_invites.sql`). Or, with the Supabase CLI:

   ```sh
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   This creates the tables, the policies, the `save_document` and `search_users`
   functions, and the private `assets` storage bucket with its policies.

2. **Configure Auth** (Authentication in the dashboard):
   - Providers: **Email** on.
   - Password: minimum length **8** (the app asks for 8; Supabase defaults to 6).
   - URL configuration: set **Site URL** to where Write is hosted, and add it
     (plus `http://localhost:5173` for development) to **Redirect URLs**.
   - **Confirm email**: on or off, your choice. On, new accounts get a link
     and the sign-up screen says so; they sign in after confirming. Off, people
     land in Write straight away.
   - Before launch, set up custom SMTP: Supabase's built-in email is rate
     limited and meant for testing.

3. **Point the app at it.** Copy `.env.example` to `.env.local` and fill in the
   two values from Project Settings, API:

   ```sh
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   ```

   Set the same two variables in your hosting provider for production builds.
   With them set, `npm run dev` and `npm run build` use Supabase; without them,
   Write falls back to its in-browser preview mode.

## Share emails (Brevo)

Every new share and every invite adds a row to `public.share_emails`. The
`send-share-emails` edge function sends them through Brevo and marks them sent.
Until it is set up, the rows simply wait, so nothing is lost.

1. Deploy the function and set its secrets:

   ```sh
   supabase functions deploy send-share-emails --no-verify-jwt
   supabase secrets set BREVO_API_KEY=... SHARE_EMAIL_FROM="ELUM Write <write@your-domain>" \
     APP_URL=https://write.your-domain CRON_SECRET=<a long random string>
   ```

   The sender address must be verified in Brevo.

2. Run it every minute (Database → Extensions: turn on `pg_cron` and `pg_net`), then in the SQL editor:

   ```sql
   select cron.schedule('send-share-emails', '* * * * *', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/send-share-emails',
       headers := jsonb_build_object('Authorization', 'Bearer <the CRON_SECRET>')
     )
   $$);
   ```

People with a Type account are skipped: their shares will arrive in the Type inbox once it exists.

The email design, the Supabase Auth templates (confirm sign-up, password reset and
more) and how to install them are in [docs/EMAIL.md](../docs/EMAIL.md).

## Accounts and invites

- Every account has a name and an `account_type`: `external` (their own email
  provider) or `type` (an ELUM Type inbox, not available yet). Sign-up offers Type as "coming soon".
- Editors can share with any email address. If no account uses it, an invite
  waits in `document_invites`. It becomes access only when someone **verifies**
  that address (by confirming at sign-up, or confirming a changed email), so an
  unverified sign-up cannot claim another person's invite.

## What the database enforces

- Roles: viewer < commenter < editor < owner. Viewers read; commenters also
  comment; editors also edit, rename and share; only owners delete.
- Document text changes only through `save_document()`. Commenters can save
  only to add or remove comment anchors (the function compares the documents
  with comment marks removed). Every save carries the version it started
  from, and a stale save fails with a conflict instead of overwriting.
- Viewers do not see comments.
- Images live at `assets/<document id>/<file>` and follow the document's access:
  anyone who can open it can see them, editors upload, owners delete.
- Signed-in people can find each other by name or email (that is how sharing
  works), so names and emails are visible to signed-in accounts. Signed-out
  visitors can read nothing.

## Tests

Both run against plain Postgres with a small stand-in for Supabase's `auth`
and `storage` schemas (`tests/supabase-stub.sql`), and both run in CI.

```sh
sh supabase/tests/run.sh          # row level security checks, needs psql
sh supabase/tests/integration.sh  # the app's SupabaseApi through PostgREST, needs psql and postgrest
```
