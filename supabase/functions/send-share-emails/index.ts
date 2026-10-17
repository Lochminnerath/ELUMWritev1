// Sends the emails queued in public.share_emails ("X shared a document with you",
// "X invited you to a document") through Brevo. Runs on Supabase Edge Functions (Deno).
//
// Secrets (supabase secrets set ...):
//   BREVO_API_KEY      Brevo API key. Without it, nothing is sent and the queue waits.
//   SHARE_EMAIL_FROM   Sender, for example "ELUM Write <write@elum.example>". Must be a Brevo-verified sender.
//   APP_URL            Where Write is hosted, for example https://write.elum.example
//   CRON_SECRET        Shared secret the scheduler sends as "Authorization: Bearer <secret>".
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Schedule it every minute with pg_cron; see supabase/README.md.

import { createClient } from 'npm:@supabase/supabase-js@2';

const BATCH = 50;
const MAX_ATTEMPTS = 5;

interface Row {
  id: number;
  doc_id: string;
  kind: 'shared' | 'invited';
  to_email: string;
  role: 'viewer' | 'commenter' | 'editor';
  attempts: number;
  document: { title: string } | null;
  sender: { name: string; email: string } | null;
  recipient: { name: string; account_type: 'type' | 'external' } | null;
}

const ROLE_WORDS = { viewer: 'view', commenter: 'comment on', editor: 'edit' } as const;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function parseSender(value: string): { name: string; email: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1] || 'ELUM Write', email: match[2] } : { name: 'ELUM Write', email: value.trim() };
}

function compose(row: Row, appUrl: string) {
  const who = row.sender?.name ?? 'Someone';
  const title = row.document?.title ?? 'a document';
  const can = ROLE_WORDS[row.role];
  const open = `${appUrl}/d/${row.doc_id}`;
  const link = row.kind === 'invited' ? `${appUrl}/signup?next=${encodeURIComponent(`/d/${row.doc_id}`)}` : open;
  const subject = `${who} shared “${title}” with you`;
  const lines =
    row.kind === 'invited'
      ? [
          `${who} invited you to ${can} “${title}” in ELUM Write.`,
          `Create a free account with this email address (${row.to_email}) to open it. Once you confirm the address, the document is waiting for you.`,
        ]
      : [`${who} shared “${title}” with you. You can ${can} it in ELUM Write.`];
  const button = row.kind === 'invited' ? 'Create your account' : 'Open the document';
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f8;font-family:Manrope,Helvetica,Arial,sans-serif;color:#141a2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a84d17;font-weight:600">ELUM Write</td></tr>
<tr><td style="padding-top:12px;font-size:22px;line-height:30px">${escape(subject)}</td></tr>
${lines.map((l) => `<tr><td style="padding-top:12px;font-size:15px;line-height:24px;color:#5a6178">${escape(l)}</td></tr>`).join('')}
<tr><td style="padding-top:24px"><a href="${escape(link)}" style="display:inline-block;background:#3b5bd6;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">${button}</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;line-height:18px;color:#5a6178">You received this because ${escape(row.sender?.email ?? 'an ELUM Write user')} shared with ${escape(row.to_email)}. Built by people. Runs without AI.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${subject}\n\n${lines.join('\n\n')}\n\n${button}: ${link}\n`;
  return { subject, html, text };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Not allowed', { status: 401 });
  }
  const brevoKey = Deno.env.get('BREVO_API_KEY');
  const from = Deno.env.get('SHARE_EMAIL_FROM');
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
  if (!brevoKey || !from || !appUrl) {
    // Not configured yet: leave the queue as it is.
    return Response.json({ sent: 0, waiting: 'Set BREVO_API_KEY, SHARE_EMAIL_FROM and APP_URL to send emails.' });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await db
    .from('share_emails')
    .select(
      `id, doc_id, kind, to_email, role, attempts,
       document:documents(title),
       sender:profiles!share_emails_sent_by_fkey(name, email),
       recipient:profiles!share_emails_to_user_fkey(name, account_type)`,
    )
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(BATCH)
    .returns<Row[]>();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const sender = parseSender(from);
  let sent = 0;
  let skipped = 0;
  for (const row of data ?? []) {
    // Type accounts will get shares in their ELUM inbox, which is not built yet.
    if (row.recipient?.account_type === 'type') {
      skipped++;
      continue;
    }
    const { subject, html, text } = compose(row, appUrl);
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: row.to_email, ...(row.recipient?.name ? { name: row.recipient.name } : {}) }],
        subject,
        htmlContent: html,
        textContent: text,
        tags: ['write-share', row.kind],
      }),
    });
    if (response.ok) {
      sent++;
      await db.from('share_emails').update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq('id', row.id);
    } else {
      const detail = (await response.text()).slice(0, 500);
      await db.from('share_emails').update({ attempts: row.attempts + 1, last_error: `${response.status} ${detail}` }).eq('id', row.id);
    }
  }
  return Response.json({ sent, skipped, failed: (data?.length ?? 0) - sent - skipped });
});
