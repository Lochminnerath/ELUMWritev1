# ELUM Write emails

Every email Write sends comes from one layout in
`supabase/functions/_shared/email.ts`, so they read as one family and a design
change happens in one place.

## Design

- **Shape.** The Write lockup on a soft `surface-glass` ground, then one white
  card (16px radius, hairline border), then a quiet footer. 560px wide, single
  column, reflows on phones.
- **One idea per email.** A small apricot label (the product colour, as the
  brand book asks), a title in Sora, one or two short paragraphs, and at most
  one button.
- **The button** is the brand's `action` blue pill. Under it, the same link in
  full for clients that block buttons.
- **Documents** appear as a small card with the Write document logo, the title
  and what you can do ("You can comment · from Ada Okafor").
- **Comments** appear as a quote with the apricot rule used for comments in the app.
- **Codes** are large, spaced, in IBM Plex Mono on `elum-mist`.
- **Footer:** the ELUM mark, "Built by people. Runs without AI.", and one line
  saying exactly why this person got this email.
- **Dark mode:** clients that support it get the dark surfaces, the reversed
  lockup and lighter link colours. Others get the light version, which is
  designed to stand alone.
- **Voice:** short, plain, warm, "we" to "you", sentence case, no emoji, no
  urgency tricks. Every email says what happened, what you can do, and why you
  got it.
- **Every email has a plain-text version.** Images are decorative (empty alt
  text) except the lockup, so the email makes sense with images off.

## The emails

| Email | When | Sent by | Status |
| --- | --- | --- | --- |
| Confirm your email | Sign-up | Supabase Auth (`supabase/templates/confirmation.html`) | Ready: paste into Supabase |
| Reset your password | "Forgot password" | Supabase Auth (`recovery.html`) | Ready. The app has no reset screen yet |
| Confirm your new email | Email change | Supabase Auth (`email_change.html`) | Ready. The app has no email-change screen yet |
| Confirm it is you (code) | Sensitive changes | Supabase Auth (`reauthentication.html`) | Ready |
| Shared with you | Someone with an account is given access | `send-share-emails` function via Brevo | Ready: needs Brevo key and schedule |
| You are invited | Sharing with an address that has no account | `send-share-emails` function via Brevo | Ready: needs Brevo key and schedule |
| New comment or reply | Someone comments on your document or replies to you | Template ready (`commentEmail`) | Not wired up yet: needs a queue trigger and email preferences |

Type accounts get none of the product emails above by email: their shares
and comments will arrive in the Type inbox.

## Put the Auth emails into Supabase

`npm run emails` writes the four Auth templates to `supabase/templates/`.
In the Supabase dashboard, open Authentication, then Emails, and for each one paste the file's
contents into the body and use this subject:

| Template in Supabase | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirmation.html` | Confirm your email for ELUM Write |
| Reset password | `recovery.html` | Reset your ELUM Write password |
| Change email address | `email_change.html` | Confirm your new email for ELUM Write |
| Reauthentication | `reauthentication.html` | Your ELUM Write confirmation code |

The templates load their images from `{{ .SiteURL }}/brand/email/`, so set the
Site URL (Authentication, then URL configuration) to where Write is hosted.

Once Brevo is connected as Supabase's SMTP server (Authentication, then
Emails, then SMTP settings), these go out through Brevo too, and the two-a-day
testing limit goes away.

## Review the design

`npm run emails:preview` writes every email with sample data to
`email-previews/` (not committed). Open them in a browser, with the app's dev
server running so the images load.

## Next for comment emails

1. A trigger on `comments` and `comment_replies` that queues an email for the
   document's owner and the thread's participants, except the author.
2. A per-person setting: every comment, a daily summary, or none, plus a
   one-click unsubscribe link in the footer (required for this kind of email).
3. Grouping, so ten comments in a minute become one email.
