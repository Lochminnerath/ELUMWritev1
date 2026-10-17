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

1. **Create the schema.** Open the project's SQL editor, paste
   `migrations/20261017000000_elum_write.sql` and run it. Or, with the Supabase CLI:

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
