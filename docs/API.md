# ELUM API contract for Write

> Using Supabase? You do not need this document: the migration in
> `supabase/migrations` implements all of it. See `supabase/README.md`.
> This contract is for a custom ELUM API server.

This is what ELUM Write expects from the ELUM API. The app already speaks it
through `src/api/http/HttpApi.ts`. Until the API is live, `src/api/local/LocalApi.ts`
implements the same rules inside the browser, and `src/api/local/LocalApi.test.ts`
is the executable version of this document.

Set `VITE_ELUM_API_URL` (for example `https://api.elum.example/v1`) and the app
switches to the HTTP client. Nothing else changes.

## Conventions

- JSON in and out, UTF-8. Timestamps are ISO 8601 strings in UTC.
- Every call except sign-up and sign-in sends `Authorization: Bearer <token>`.
- `204 No Content` for calls that return nothing.
- Errors use one shape and a stable `code`:

  ```json
  { "error": { "code": "conflict", "message": "This document changed somewhere else.", "details": { "version": 12 } } }
  ```

  | code | status | when |
  | --- | --- | --- |
  | `unauthorized` | 401 | Missing, expired or revoked session. The app signs the person out. |
  | `invalid_credentials` | 401 | Wrong email or password. Use the same message for both. |
  | `email_taken` | 409 | Sign-up with an email that already has an account. |
  | `invalid` | 400 | Bad input. Put the field name in `details.field` (`name`, `email`, `password`). |
  | `forbidden` | 403 | Signed in, but the role does not allow this. Also for documents the person cannot open. |
  | `not_found` | 404 | The document or comment does not exist. |
  | `conflict` | 409 | Save based on an old version. Put the current `version` in `details`. |
  | `too_large` | 413 | Upload over the limit (15 MB). |
  | `server` | 500 | Anything else. |

  `message` is shown to people as is, so write it in ELUM's voice: short and plain.

## Types

```ts
type Role = 'owner' | 'editor' | 'commenter' | 'viewer';
type ShareRole = 'editor' | 'commenter' | 'viewer';

interface User { id: string; name: string; email: string; color: string; createdAt: string }
type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'color'>;
interface Session { token: string; user: User; expiresAt: string }

// ProseMirror JSON produced by the Write editor. Store it as an opaque JSON blob.
interface DocNode { type: string; attrs?: object; content?: DocNode[]; marks?: { type: string; attrs?: object }[]; text?: string }

interface PreviewBlock { kind: 'heading' | 'text' | 'list' | 'image' | 'rule' | 'quote'; text?: string; level?: number }

interface DocumentSummary {
  id: string; title: string; owner: PublicUser;
  role: Role;                    // the caller's role
  createdAt: string; updatedAt: string; updatedBy: PublicUser | null;
  lastOpenedAt: string | null;   // when the caller last opened it
  preview: PreviewBlock[];       // first ~10 blocks, see buildPreview() in src/api/content.ts
  sharedWithCount: number;
}
interface DocumentRecord extends DocumentSummary { content: DocNode; version: number }

interface Share { user: PublicUser; role: ShareRole; addedAt: string; addedBy: PublicUser | null }

interface CommentThread {
  id: string; docId: string; author: PublicUser; body: string;
  quote: string;                 // the text the comment was made on
  createdAt: string; resolved: boolean; resolvedAt: string | null; resolvedBy: PublicUser | null;
  replies: { id: string; author: PublicUser; body: string; createdAt: string }[];
}

interface Asset { id: string; url: string; mimeType: string; size: number }
```

## Accounts and sessions

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/auth/signup` | `{ name, email, password }` | `Session` |
| POST | `/auth/signin` | `{ email, password }` | `Session` |
| POST | `/auth/signout` | | 204, revokes the token |
| GET | `/auth/session` | | `Session` for the current token, or 401 |
| PATCH | `/me` | `{ name }` | `User` |
| GET | `/me/preferences` | | `Preferences` |
| PATCH | `/me/preferences` | any of `{ colors, dictionary, spellcheck, spellLanguage }` | `Preferences`, all of them |

- Emails are unique and compared case-insensitively. Names are required. Passwords are at least 8 characters.
- Hash passwords on the server (argon2id or bcrypt). Rate-limit sign-in by email and by IP.
- Sessions last 30 days in the local API. Any lifetime works; the app handles 401 at any time.
- New accounts should get a "Welcome to Write" document (`src/api/welcome.ts` has the content).
- Preferences follow the person to every device and only they can read them. A PATCH replaces
  the keys it sends and keeps the rest. Shapes and limits are in `src/api/preferences.ts`:
  up to 14 custom colours (`#rrggbb`), up to 5,000 dictionary words, `spellLanguage` is
  `en-US` or `en-GB`.

## People

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/users/search?q=<text>` | `PublicUser[]`, at most 8 |

Matches name or email, case-insensitive, at least 2 characters, never returns the caller.
Rank prefix matches first. Decide how wide search should reach (whole service,
same organisation, or people you have worked with) before launch; the app does
not assume either.

## Documents

| Method | Path | Body | Returns | Who |
| --- | --- | --- | --- | --- |
| GET | `/documents?filter=all\|owned\|shared` | | `DocumentSummary[]`, most recent first | anyone signed in |
| POST | `/documents` | `{ title?, content? }` | `DocumentRecord` | anyone signed in |
| GET | `/documents/:id` | | `DocumentRecord`, and records `lastOpenedAt` for the caller | viewer+ |
| PATCH | `/documents/:id` | `{ title }` | `DocumentSummary` | editor+ |
| PUT | `/documents/:id/content` | `{ content, baseVersion, force? }` | `{ version, updatedAt }` | see below |
| POST | `/documents/:id/copy` | | `DocumentRecord` owned by the caller, without comment anchors | viewer+ |
| DELETE | `/documents/:id` | | 204, also deletes shares and comments | owner |
| DELETE | `/documents/:id/shares/me` | | 204, removes a shared document from the caller's list | non-owners |

Titles are trimmed, whitespace is collapsed, at most 200 characters, and an empty title becomes "Untitled document".

### Saving content

- Each save carries the `baseVersion` the client started from. If it is not the
  current version, answer `conflict` with the current version, unless `force` is true.
  On success, increment `version`.
- **Editors and the owner** can save anything.
- **Commenters** can save only when the new content equals the stored content
  after removing every mark of type `comment` (that is how a comment is anchored
  to text). Compare with null attributes dropped and attribute keys sorted.
  `sameIgnoringComments()` in `src/api/content.ts` is the reference.
- A commenter save that only moves comment anchors does not change `updatedAt`.
- **Viewers** cannot save.

Real-time co-editing is planned (see the README). The version check keeps
concurrent edits safe until then: the app shows the person both choices.

## Sharing

| Method | Path | Body | Returns | Who |
| --- | --- | --- | --- | --- |
| GET | `/documents/:id/shares` | | `Share[]` in the order people were added | viewer+ |
| PUT | `/documents/:id/shares/:userId` | `{ role }` | `Share` | editor+ |
| DELETE | `/documents/:id/shares/:userId` | | 204 | editor+, or the person themselves |

The owner cannot be given a share. Changing a role keeps the original `addedAt` and `addedBy`.

## Comments

Viewers do not see comments. The client generates the thread id (8 to 64 characters of
`[A-Za-z0-9_-]`, a UUID in practice) because it places the anchor mark in the document.

| Method | Path | Body | Returns | Who |
| --- | --- | --- | --- | --- |
| GET | `/documents/:id/comments` | | `CommentThread[]`, oldest first | commenter+ |
| POST | `/documents/:id/comments` | `{ id, body, quote }` | `CommentThread` | commenter+ |
| POST | `/documents/:id/comments/:commentId/replies` | `{ body }` | `CommentThread` (a reply reopens a resolved thread) | commenter+ |
| PATCH | `/documents/:id/comments/:commentId` | `{ resolved }` | `CommentThread` | commenter+ |
| DELETE | `/documents/:id/comments/:commentId` | | 204 | the thread's author, or the owner |

Bodies are trimmed, required and at most 4,000 characters. Quotes are kept to 500 characters.

## Images

| Method | Path | Body | Returns | Who |
| --- | --- | --- | --- | --- |
| POST | `/documents/:id/assets` | `multipart/form-data` with `file` | `Asset` | editor+ |

Accept PNG, JPEG, GIF, WebP, AVIF, SVG and BMP up to 15 MB. `url` goes into the
document as the image `src`, so it must keep working for everyone who can open
the document: a stable URL behind access checks, or a signed URL the API refreshes.
Serve SVG with `Content-Security-Policy: sandbox` or convert it, since it can carry scripts.
