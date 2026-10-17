import { describe, expect, it } from 'vitest';
import { AUTH_TEMPLATES, commentEmail, inviteEmail, shareEmail } from './email';

const o = { assetBase: 'https://write.example/' };
const share = {
  senderName: 'Ada <b>Okafor</b>',
  senderEmail: 'ada@example.com',
  docTitle: 'Plans & <script>alert(1)</script>',
  role: 'editor' as const,
  toEmail: 'sam@example.org',
  url: 'https://write.example/d/1?a=1&b=2',
};

describe('emails', () => {
  it('escapes everything people can type', () => {
    const { html, subject, text } = shareEmail(share, o);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Okafor');
    expect(html).toContain('Plans &amp; &lt;script&gt;');
    expect(html).toContain('href="https://write.example/d/1?a=1&amp;b=2"');
    // Subjects and plain text are not HTML, so they stay as typed.
    expect(subject).toBe('Ada <b>Okafor</b> shared “Plans & <script>alert(1)</script>” with you');
    expect(text).toContain('Open the document: https://write.example/d/1?a=1&b=2');
  });

  it('loads brand images from the app', () => {
    expect(shareEmail(share, o).html).toContain('src="https://write.example/brand/email/write-lockup.png"');
  });

  it('says what each role can do', () => {
    expect(inviteEmail({ ...share, role: 'viewer' }, o).text).toContain('invited you to view');
    expect(inviteEmail(share, o).text).toContain('Create your account: ');
  });

  it('quotes comments', () => {
    const email = commentEmail(
      { authorName: 'Jonah', docTitle: 'Notes', comment: 'Two\nlines', isReply: true, url: 'https://x/d/1', toEmail: 'a@b.co' },
      o,
    );
    expect(email.subject).toBe('Jonah replied in “Notes”');
    expect(email.text).toContain('> Two\n> lines');
  });

  it('keeps Supabase placeholders intact in the Auth templates', () => {
    for (const build of Object.values(AUTH_TEMPLATES)) {
      const { html } = build();
      expect(html).toContain('{{ .SiteURL }}/brand/email/write-lockup.png');
      expect(html).toMatch(/\{\{ \.(ConfirmationURL|Token) \}\}/);
    }
  });
});
