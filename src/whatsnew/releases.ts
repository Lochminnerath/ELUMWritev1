/**
 * What changed in Write, newest first. Add a release at the top whenever an update ships: people
 * see it once, the next time they open Write, and can read every release again from the account
 * menu (What's new). Give each release a new id; the date is shown as written.
 */

export interface Release {
  /** Unique and never reused, such as 2026-10-18. */
  id: string;
  date: string;
  title: string;
  items: string[];
}

export const RELEASES: Release[] = [
  {
    id: '2026-10-18',
    date: '18 October 2026',
    title: "Write is ready for everyone",
    items: [
      "Create your account with your email, or with a new ELUM Type address, right from Write.",
      "Every account gets a profile, so people see your name when you share and comment.",
      "Clearer messages when signing up or confirming your email goes wrong, with a button to send the email again.",
      "One ELUM account works in Write, Type, Make and ELUM Account.",
      "This What’s new panel, so you always know what changed.",
    ],
  },
];

/** The releases someone has not seen yet, given the last one they saw. New visitors see the latest. */
export function unseenReleases(releases: Release[], lastSeen: string | null): Release[] {
  if (!releases.length) return [];
  const at = lastSeen ? releases.findIndex((r) => r.id === lastSeen) : -1;
  return at === -1 ? releases.slice(0, 1) : releases.slice(0, at);
}
