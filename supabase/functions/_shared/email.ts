/**
 * ELUM Write emails: one layout, and every message Write sends built from it.
 *
 * Used by the send-share-emails edge function (Deno) and by
 * scripts/build-email-templates.ts, which writes the Supabase Auth templates.
 * Plain TypeScript with no runtime APIs, so it runs in both.
 *
 * Design: the brand's calm glass card on a soft ground, the Write lockup on top,
 * one idea per email, one blue button, and a plain footer saying why it came.
 * Voice: short, plain, warm, "we" to "you", sentence case, no emoji.
 */

export interface EmailContent {
  /** Inbox preview line, shown after the subject. */
  preheader: string;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: string;
  paragraphs: string[];
  /** A document, drawn as a small card with the document logo. */
  document?: { title: string; meta: string };
  /** A comment being quoted. */
  quote?: { author: string; text: string };
  button?: { label: string; url: string };
  /** A one-time code, shown large. */
  code?: string;
  /** Small print under the button, such as how long a link lasts. */
  note?: string;
  /** Why this person got the email. */
  reason: string;
}

export interface RenderOptions {
  /** Where /brand/email/*.png are served from: the app's URL, or {{ .SiteURL }} in Auth templates. */
  assetBase: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Brand colours (tokens.css), fixed values because email clients have no CSS variables.
const C = {
  ground: '#f4f5f8',
  card: '#ffffff',
  ink: '#141a2e',
  muted: '#5a6178',
  hairline: '#e2e5ee',
  action: '#3b5bd6',
  writeDeep: '#a84d17',
  writeLine: '#f8c79f',
  mist: '#eef2ff',
};

const SANS = "Manrope, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const DISPLAY = "Sora, 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', Menlo, Consolas, monospace";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const row = (html: string, style = '', className = '') =>
  `<tr><td${className ? ` class="${className}"` : ''} style="${style}">${html}</td></tr>`;

export function renderEmail(subject: string, c: EmailContent, { assetBase }: RenderOptions): RenderedEmail {
  const base = assetBase.replace(/\/+$/, '');
  const e = escapeHtml;
  const parts: string[] = [];

  if (c.eyebrow) {
    parts.push(row(e(c.eyebrow), `padding:0 0 10px;font:600 12px/16px ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${C.writeDeep}`, 'eyebrow'));
  }
  parts.push(row(e(c.title), `padding:0;font:400 24px/32px ${DISPLAY};letter-spacing:-.01em;color:${C.ink}`, 'title'));
  for (const p of c.paragraphs) {
    parts.push(row(e(p), `padding:14px 0 0;font:400 16px/26px ${SANS};color:${C.muted}`));
  }
  if (c.document) {
    parts.push(
      row(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="doc" style="border:1px solid ${C.hairline};border-radius:12px;background:${C.ground}">
<tr><td width="56" style="padding:14px 0 14px 16px;vertical-align:middle"><img src="${base}/brand/email/write-doc.png" width="32" height="40" alt="" style="display:block;border:0"></td>
<td style="padding:14px 16px 14px 12px;vertical-align:middle"><div class="ink" style="font:600 16px/22px ${SANS};color:${C.ink}">${e(c.document.title)}</div>
<div class="muted" style="font:400 13px/20px ${SANS};color:${C.muted}">${e(c.document.meta)}</div></td></tr></table>`,
        'padding:22px 0 0',
      ),
    );
  }
  if (c.quote) {
    parts.push(row('', 'padding:18px 0 0;font-size:0;line-height:0'));
    parts.push(
      row(
        `<div class="muted" style="font:600 13px/20px ${SANS};color:${C.muted}">${e(c.quote.author)}</div>
<div class="ink" style="font:400 15px/24px ${SANS};color:${C.ink};white-space:pre-wrap">${e(c.quote.text)}</div>`,
        `padding:4px 0 4px 14px;border-left:3px solid ${C.writeLine}`,
      ),
    );
  }
  if (c.code) {
    parts.push(
      row(
        `<span class="code" style="display:inline-block;padding:12px 20px;border-radius:12px;background:${C.mist};font:500 28px/36px ${MONO};letter-spacing:.2em;color:${C.ink}">${e(c.code)}</span>`,
        'padding:24px 0 0',
      ),
    );
  }
  if (c.button) {
    parts.push(
      row(
        `<a href="${e(c.button.url)}" class="button" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${C.action};color:#ffffff;font:600 15px/20px ${SANS};text-decoration:none">${e(c.button.label)}</a>`,
        'padding:28px 0 0',
      ),
    );
    parts.push(
      row(
        `If the button does not work, paste this link into your browser:<br><a href="${e(c.button.url)}" class="link" style="color:${C.action};word-break:break-all">${e(c.button.url)}</a>`,
        `padding:16px 0 0;font:400 13px/20px ${SANS};color:${C.muted}`,
      ),
    );
  }
  if (c.note) parts.push(row(e(c.note), `padding:12px 0 0;font:400 13px/20px ${SANS};color:${C.muted}`));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${e(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600&family=Sora:wght@400&display=swap" rel="stylesheet">
<style>
  @media (prefers-color-scheme: dark) {
    .ground { background: #0e1220 !important; }
    .card { background: #171c2e !important; border-color: #2a3149 !important; }
    .card td, .muted { color: #a3aac0 !important; }
    .card .ink, .card .title { color: #eef1fa !important; }
    .card .eyebrow { color: #ffb27a !important; }
    .card .link { color: #8fa9fa !important; }
    .logo-dark { display: block !important; max-height: none !important; overflow: visible !important; }
    .doc { background: #0e1220 !important; border-color: #2a3149 !important; }
    .code { background: #1b2340 !important; color: #eef1fa !important; }
    .button { background: #7093f8 !important; color: #0e1220 !important; }
    .footer td { color: #a3aac0 !important; }
    .logo-light { display: none !important; }
  }
  @media (max-width: 600px) { .card-pad { padding: 28px 22px !important; } }
</style>
</head>
<body class="ground" style="margin:0;padding:0;background:${C.ground}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(c.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ground" style="background:${C.ground}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px">
<img class="logo-light" src="${base}/brand/email/write-lockup.png" width="140" height="41" alt="ELUM Write" style="display:block;border:0">
<!--[if !mso]><!--><img class="logo-dark" src="${base}/brand/email/write-lockup-reversed.png" width="140" height="41" alt="ELUM Write" style="display:none;max-height:0;overflow:hidden;border:0"><!--<![endif]-->
</td></tr>
<tr><td class="card card-pad" style="background:${C.card};border:1px solid ${C.hairline};border-radius:16px;padding:36px 36px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${parts.join('\n')}
</table>
</td></tr>
<tr><td class="footer" style="padding:24px 4px 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding:0 10px 0 0;vertical-align:middle"><img src="${base}/brand/email/elum-mark.png" width="20" height="20" alt="ELUM" style="display:block;border:0"></td>
<td style="font:600 12px/16px ${SANS};color:${C.muted};vertical-align:middle">Built by people. Runs without AI.</td>
</tr></table>
<div style="padding:10px 0 0;font:400 12px/18px ${SANS};color:${C.muted}">${e(c.reason)}</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  const text = [
    c.eyebrow ? c.eyebrow.toUpperCase() : null,
    c.title,
    ...c.paragraphs,
    c.document ? `${c.document.title}\n${c.document.meta}` : null,
    c.quote ? `${c.quote.author}:\n${c.quote.text.replace(/^/gm, '> ')}` : null,
    c.code ? `Your code: ${c.code}` : null,
    c.button ? `${c.button.label}: ${c.button.url}` : null,
    c.note ?? null,
    '--',
    'ELUM Write. Built by people. Runs without AI.',
    c.reason,
  ]
    .filter((l): l is string => l !== null)
    .join('\n\n');

  return { subject, html, text: `${text}\n` };
}

// ------------------------------------------------------------ the messages

export type ShareRole = 'viewer' | 'commenter' | 'editor';

const CAN: Record<ShareRole, string> = { viewer: 'view', commenter: 'comment on', editor: 'edit' };
const ROLE_META: Record<ShareRole, string> = { viewer: 'You can view', commenter: 'You can comment', editor: 'You can edit' };

export interface ShareDetails {
  senderName: string;
  senderEmail: string;
  docTitle: string;
  role: ShareRole;
  toEmail: string;
  /** Link to the document (shares) or to sign-up with a return to the document (invites). */
  url: string;
}

/** Someone with an account was given access. */
export function shareEmail(d: ShareDetails, o: RenderOptions): RenderedEmail {
  return renderEmail(
    `${d.senderName} shared “${d.docTitle}” with you`,
    {
      preheader: `You can ${CAN[d.role]} it in ELUM Write.`,
      eyebrow: 'Shared with you',
      title: `${d.senderName} shared a document with you`,
      paragraphs: [`You can ${CAN[d.role]} it now. It also appears under Shared with me in your documents.`],
      document: { title: d.docTitle, meta: `${ROLE_META[d.role]} · from ${d.senderName}` },
      button: { label: 'Open the document', url: d.url },
      reason: `You got this because ${d.senderName} (${d.senderEmail}) shared a document with ${d.toEmail}.`,
    },
    o,
  );
}

/** An address with no account yet was invited. */
export function inviteEmail(d: ShareDetails, o: RenderOptions): RenderedEmail {
  return renderEmail(
    `${d.senderName} invited you to “${d.docTitle}”`,
    {
      preheader: `Create a free ELUM account with this address to open it.`,
      eyebrow: 'You are invited',
      title: `${d.senderName} wants to work on a document with you`,
      paragraphs: [
        `They invited you to ${CAN[d.role]} “${d.docTitle}” in ELUM Write, a calm place to write and share documents.`,
        `Create your account with this email address, ${d.toEmail}. Once you confirm it, the document is waiting for you.`,
      ],
      document: { title: d.docTitle, meta: `${ROLE_META[d.role]} · from ${d.senderName}` },
      button: { label: 'Create your account', url: d.url },
      note: 'Already have an ELUM account under another address? Ask them to share with that one instead.',
      reason: `You got this because ${d.senderName} (${d.senderEmail}) invited ${d.toEmail}. If you were not expecting it, you can ignore this email.`,
    },
    o,
  );
}

export interface CommentDetails {
  authorName: string;
  docTitle: string;
  comment: string;
  /** The text the comment is about, when it is a new thread. */
  quote?: string;
  isReply: boolean;
  url: string;
  toEmail: string;
}

/** A comment or reply on a document you are part of. */
export function commentEmail(d: CommentDetails, o: RenderOptions): RenderedEmail {
  return renderEmail(
    d.isReply ? `${d.authorName} replied in “${d.docTitle}”` : `${d.authorName} commented on “${d.docTitle}”`,
    {
      preheader: d.comment.slice(0, 120),
      eyebrow: d.isReply ? 'New reply' : 'New comment',
      title: d.isReply ? `${d.authorName} replied to a comment` : `${d.authorName} left a comment`,
      paragraphs: d.quote ? [`On “${d.quote.slice(0, 160)}”`] : [],
      quote: { author: d.authorName, text: d.comment },
      document: { title: d.docTitle, meta: 'Open it to reply or resolve' },
      button: { label: 'Reply in Write', url: d.url },
      reason: `You got this because you take part in “${d.docTitle}” as ${d.toEmail}.`,
    },
    o,
  );
}

// ------------------------------------------------- Supabase Auth templates

/**
 * Supabase fills in {{ .ConfirmationURL }}, {{ .Token }}, {{ .Email }},
 * {{ .NewEmail }} and {{ .SiteURL }}. They pass through escaping unchanged.
 */
export const AUTH_TEMPLATES = {
  confirmation: () =>
    renderEmail(
      'Confirm your email for ELUM Write',
      {
        preheader: 'One click and you are in.',
        eyebrow: 'Welcome',
        title: 'Confirm your email',
        paragraphs: ['Thanks for joining ELUM Write. Confirm this address and we will open your first document for you.'],
        button: { label: 'Confirm my email', url: '{{ .ConfirmationURL }}' },
        note: 'Any documents people have shared with this address appear once you confirm.',
        reason: 'You got this because someone signed up for ELUM Write with {{ .Email }}. If it was not you, ignore this email and no account is made.',
      },
      { assetBase: '{{ .SiteURL }}' },
    ),
  recovery: () =>
    renderEmail(
      'Reset your ELUM Write password',
      {
        preheader: 'Choose a new password.',
        eyebrow: 'Password',
        title: 'Reset your password',
        paragraphs: ['We got a request to reset the password for your account. Choose a new one with the button below.'],
        button: { label: 'Choose a new password', url: '{{ .ConfirmationURL }}' },
        note: 'This link works once and expires soon. Your current password keeps working until you change it.',
        reason: 'You got this because a password reset was requested for {{ .Email }}. If it was not you, you can ignore this email.',
      },
      { assetBase: '{{ .SiteURL }}' },
    ),
  email_change: () =>
    renderEmail(
      'Confirm your new email for ELUM Write',
      {
        preheader: 'Confirm the change to your sign-in email.',
        eyebrow: 'Account',
        title: 'Confirm your new email',
        paragraphs: ['You asked to change your ELUM Write email from {{ .Email }} to {{ .NewEmail }}. Confirm it to finish.'],
        button: { label: 'Confirm the change', url: '{{ .ConfirmationURL }}' },
        reason: 'You got this because an email change was requested on your account. If it was not you, sign in and change your password.',
      },
      { assetBase: '{{ .SiteURL }}' },
    ),
  reauthentication: () =>
    renderEmail(
      'Your ELUM Write confirmation code',
      {
        preheader: 'Use this code to confirm it is you.',
        eyebrow: 'Security',
        title: 'Confirm it is you',
        paragraphs: ['Enter this code in ELUM Write to continue.'],
        code: '{{ .Token }}',
        note: 'The code expires soon. Never share it with anyone.',
        reason: 'You got this because a sensitive change was requested on {{ .Email }}.',
      },
      { assetBase: '{{ .SiteURL }}' },
    ),
};
