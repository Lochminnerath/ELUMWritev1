<p align="center">
  <img src="public/brand/write/elum-write-lockup.svg" alt="ELUM Write" height="56">
</p>

# ELUM Write

Documents and writing, from the ELUM family. Write, format and share documents
with the people you work with. Built by people. Runs without AI.

This repository replaces the old HORIZON project. It is a React app that runs
today with a built-in local API, and switches to the ELUM API with one setting
when that is ready.

## Run it

You need Node.js 20 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
```

Without any settings it runs in preview mode, with data kept in the browser. To use
Supabase, follow [supabase/README.md](supabase/README.md).

Create an account, or sign in as one of the demo people (preview mode only):

| Name | Email | Password |
| --- | --- | --- |
| Ada Okafor | ada@example.com | `write-demo` |
| Jonah Reyes | jonah@example.com | `write-demo` |
| Mira Lindqvist | mira@example.com | `write-demo` |
| Theo Park | theo@example.com | `write-demo` |

Share a document with one of them, then sign in as them to see the viewer,
commenter or editor experience.

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (Vitest) |
| `sh supabase/tests/run.sh` | Database permission checks (needs `psql`) |
| `sh supabase/tests/integration.sh` | The Supabase client against the real schema (needs `psql` and `postgrest`) |

## What Write does today

**Accounts.** Sign up (with optional email confirmation on Supabase), sign in, sign out, edit your name. Pages behind sign-in
redirect to it and bring you back afterwards. Signing out in one tab signs out
every tab.

**Documents.** A home page with your documents and those shared with you, as a
grid of page thumbnails or a list. Search, sort, rename, copy, delete, or
remove a shared document from your list. Start blank or from a template
(meeting notes, letter, project brief). Every document has its own logo:
`public/brand/write/elum-write-doc.svg` (and `-reversed` for dark grounds).

**The editor.** Write has its own layout rather than a menu bar and a ribbon:
- The bar holds the Write mark, the document's own logo and title, a document menu
  (new, copy, rename, download, print, delete), comments and **Share**.
- A tool rail on the left opens **Outline** (jump between headings), **Insert**,
  **Spelling** and **Page and view** (zoom, page colour, counts).
- Formatting sits in a floating **dock** at the bottom of the page.
- The status beside the title shows the Write loader while saving, then where the
  document lives: "Saved to your account" (Supabase or the ELUM API) or "Saved in this
  browser only" (preview mode).

**Writing and formatting.**
- Type, delete, undo and redo. Changes save as you go.
- Bold, italic, underline, strikethrough, superscript, subscript, inline code.
- Text colour and highlight from brand-tuned swatches, or any colour from Write's own picker. Colours you make are saved to your account and appear on every device.
- Change case: Sentence case, lowercase, UPPERCASE, Title Case, and Shift+F3 to cycle. Formatting is kept.
- Fonts from a catalogue built for growth (see "Fonts" below), with search and live previews.
- Font size in points, typed or picked, with bigger and smaller buttons.
- Paragraph styles: Normal text, Title, Heading 1 to 3.
- Alignment: left, centre, right, justify.
- Line spacing (single, 1.15, 1.5, double), space before and after paragraphs, and letter spacing.
- Tab inserts a tab; with several paragraphs selected it indents them. Shift+Tab steps back.
  Indent and outdent buttons (Ctrl/Cmd+] and [). In lists, Tab nests items.
- Bulleted, numbered and checklists; quotes; horizontal lines; links (Ctrl/Cmd+K).
- Clear formatting, word count, keyboard shortcut sheet (Ctrl/Cmd+/).
- Zoom from 50% to 200%. Page colour can follow light or dark mode, or always be white paper.
- Download as PDF, a web page (images embedded) or plain text; print. Printing uses a clean copy of the document in a hidden frame, never the editor page itself.

**Academic formats.** The Styles and citations panel sets a document to MLA (9th),
APA (7th, student), Chicago (17th, author-date), Harvard or IEEE:

- **The look:** Times New Roman, the style's spacing and first-line indents, and headings.
- **The header:** your surname and page number (MLA), or page numbers, printed in the top right.
- **The first page:** a heading block or title page from a short form.
- **Sources:** add books, journal articles and web pages. Write formats each entry in the chosen style, cites it in the text ("(Kimmerer 42)", "(Lopez & Okafor, 2021, p. 45)", "[1]"), and builds the Works Cited or References list (sorted, with hanging indents) on a new page.
- **Switching styles** reformats everything.

There are also page breaks, and first-line and hanging indents for any paragraph.

**Notifications.** On Supabase, a bell lists shares, comments and replies from every ELUM
service, live.

**Spelling.** Write checks spelling itself, so it is the same on every device and
browser: Hunspell dictionaries for English (US) and English (UK) run in a background
worker ([nspell](https://github.com/wooorm/nspell)). Misspelled words get a wavy line;
right-click one for suggestions, add it to your dictionary or ignore it, or work
through them all in the Spelling panel. The dictionary, the language and the on/off
switch are saved to your account. Code, links, web and email addresses, ACRONYMS and
mixedCase names are skipped.

**Images.** Insert from your computer, drag them onto the page, or paste them.
Select an image to resize it from any corner, set it to 25%, 50% or 100% of
the line, choose how text wraps (in line, wrap left or right, or break text
with left, centre or right alignment), add alt text, or delete it.

**Sharing.** Find people by name or email, pick several, and give them a
role: viewer (read), commenter (read and comment) or editor (edit and share).
Change or remove access at any time. Viewers and commenters see a badge
instead of the toolbar, and the API enforces the same rules.

**Comments.** Select text and press Ctrl+Alt+M (Cmd+Option+M), or use the
toolbar. Threads sit beside the text they belong to, with replies, resolve
and reopen, and delete for the author or owner. On small screens comments
open in a drawer.

**Light and dark.** Follows the device by default. Switch with the moon and
sun button, or choose in the account menu. The choice is remembered.

**Mobile.** Pages reflow to the screen width, the toolbar scrolls, and the
comments panel becomes a drawer.

## How it is built

```
src/
  api/                 The data layer. The UI only ever talks to `api`.
    client.ts          ElumApi: every call Write makes
    types.ts           Shared data shapes
    local/             LocalApi: the API running inside the browser (today)
    http/HttpApi.ts    The same calls over HTTPS (when the ELUM API is live)
    content.ts         Document helpers shared by both (previews, comment rules)
    roles.ts           Viewer < commenter < editor < owner
  auth/                Session state, sign-in redirects
  preferences/         Settings saved with the account (colours, dictionary)
  theme/               Light, dark and match-system
  components/          Menus, popovers, dialogs, toasts, tooltips, avatars, logos
  pages/               Sign in and sign up, documents home
  editor/              The document editor (loaded only when a document opens)
    extensions/        TipTap extensions: paragraph format, letter spacing, case,
                       Tab keys, comments, images, permissions
    toolbar/           The formatting dock: fonts, sizes, colours (own picker), links
    spelling/          Spell check: worker, word finder, suggestions, menu
    academic/          MLA, APA, Chicago, Harvard, IEEE: styles, citations, sources
    SidePanels.tsx     The tool rail and its panels
    fonts.ts           The font catalogue
    DocWorkspace.tsx   Bar, rail, page, dock, comments, autosave
  styles/              Brand tokens (from the ELUM brand kit) and base styles
public/brand/          Logos, Write marks, document logo, loaders
docs/API.md            The contract for the ELUM API
docs/EMAIL.md          Email design, the list of emails, and how to install them
docs/ELUM-PLATFORM.md  The shared platform for every ELUM service, and the ELUM Type handoff
supabase/              Database migrations, tests, edge functions and email templates
```

The editor is [TipTap](https://tiptap.dev) on ProseMirror. Documents are
stored as ProseMirror JSON; the schema is defined in `src/editor/extensions`.

### Backends

`src/api/index.ts` picks one at start-up:

| Set in `.env.local` | Backend |
| --- | --- |
| `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` | **Supabase**: Auth, Postgres with row level security, Storage. Setup in [supabase/README.md](supabase/README.md). |
| `VITE_ELUM_API_URL` | A custom ELUM API over HTTPS, following [docs/API.md](docs/API.md). |
| neither | Preview mode: everything stays in this browser. |

All three implement the same `ElumApi` interface and the same rules, so the UI
never changes. In preview mode, records live in `localStorage`
(`elum.local.v1.*`) and images in IndexedDB (`elum-write-assets`); passwords are
stored only as salted PBKDF2 hashes even there. Clearing site data resets it.

### Fonts

`src/editor/fonts.ts` is the catalogue: 22 fonts today (the ELUM brand faces,
a range of Google Fonts, and common system fonts). To add the ELUM typefaces,
put each font's files and an `@font-face` stylesheet in `public/fonts/elum/`
and add an entry:

```ts
{
  id: 'elum-serif-text',
  name: 'ELUM Serif Text',
  category: 'serif',
  stack: '"ELUM Serif Text", Georgia, serif',
  source: { kind: 'elum', css: '/fonts/elum/elum-serif-text.css' },
  collection: 'elum',
}
```

The picker groups ELUM fonts first. Font files only download once a document
uses them. Documents store the CSS font stack, so they stay readable if a font
is ever retired.

### Brand

Colours, type, radii and shadows come from the ELUM brand kit
(`src/styles/tokens.css`). Write uses apricot (`--write`, `--write-deep`) for
active states, the comment lens and loaders, and ELUM blue for primary actions,
following the brand book. Icons are Lucide at a 1.75px stroke, matching the
rounded monoline guidance. The favicon is the Write mark: the flat mark for
small sizes (`favicon.ico`, `favicon.svg`) and the app icon for touch and
install icons.

## What comes next

- **Real-time co-editing** once the API has a live channel (Yjs on the
  existing schema). Today, two people saving the same version get a clear
  choice instead of losing work.
- **Page layout:** true page breaks, page size and margins, headers, footers and page numbers.
- **Tables**, footnotes, a table of contents.
- **Version history** and suggestions (track changes).
- **Exports** to .docx and PDF without the print dialog.
- **The 55 ELUM fonts**, dropped into the catalogue above.
- **Notifications** when someone shares a document or replies to a comment.
