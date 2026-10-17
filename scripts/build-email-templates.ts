/**
 * Writes the Supabase Auth email templates into supabase/templates from the shared
 * email layout. With `--preview <dir> <app url>`, also writes every email with
 * sample data, for reviewing the design in a browser.
 *
 *   npm run emails             # Auth templates
 *   npm run emails:preview     # plus previews in email-previews/
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_TEMPLATES, commentEmail, inviteEmail, shareEmail } from '../supabase/functions/_shared/email.ts';

const root = join(import.meta.dirname, '..');
const out = join(root, 'supabase', 'templates');
mkdirSync(out, { recursive: true });

const subjects: string[] = [];
for (const [name, build] of Object.entries(AUTH_TEMPLATES)) {
  const email = build();
  writeFileSync(join(out, `${name}.html`), email.html);
  subjects.push(`${name}: ${email.subject}`);
}
writeFileSync(join(out, 'subjects.txt'), `${subjects.join('\n')}\n`);
console.log(`Wrote ${subjects.length} Auth templates to supabase/templates`);

const flag = process.argv.indexOf('--preview');
if (flag > -1) {
  const dir = join(root, process.argv[flag + 1] ?? 'email-previews');
  const app = (process.argv[flag + 2] ?? 'http://localhost:5173').replace(/\/+$/, '');
  mkdirSync(dir, { recursive: true });
  const o = { assetBase: app };
  const share = {
    senderName: 'Ada Okafor',
    senderEmail: 'ada@example.com',
    docTitle: 'Spring field notes',
    role: 'commenter' as const,
    toEmail: 'sam@example.org',
    url: `${app}/d/example`,
  };
  const samples = {
    'share': shareEmail(share, o),
    'invite': inviteEmail({ ...share, toEmail: 'pat@outlook.com', url: `${app}/signup?next=%2Fd%2Fexample` }, o),
    'comment': commentEmail(
      {
        authorName: 'Jonah Reyes',
        docTitle: 'Spring field notes',
        quote: 'The river rose two feet overnight.',
        comment: 'Should we add the gauge readings here? I have them from Tuesday.',
        isReply: false,
        url: `${app}/d/example`,
        toEmail: 'sam@example.org',
      },
      o,
    ),
  };
  const fill = (html: string) =>
    html
      .replaceAll('{{ .SiteURL }}', app)
      .replaceAll('{{ .ConfirmationURL }}', `${app}/auth/confirm?token=example`)
      .replaceAll('{{ .Token }}', '482915')
      .replaceAll('{{ .NewEmail }}', 'sam.new@example.org')
      .replaceAll('{{ .Email }}', 'sam@example.org');
  for (const [name, build] of Object.entries(AUTH_TEMPLATES)) writeFileSync(join(dir, `auth-${name}.html`), fill(build().html));
  for (const [name, email] of Object.entries(samples)) writeFileSync(join(dir, `${name}.html`), email.html);
  console.log(`Wrote previews to ${dir}`);
}
