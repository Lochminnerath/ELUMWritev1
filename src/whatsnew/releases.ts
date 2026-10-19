import type { Art } from './scenes';

/**
 * What changed in Write, newest first. Add a release at the top whenever an update ships: people
 * get a short animated tour of it the next time they open Write, and can replay every release
 * from the account menu (What's new). Give each release a new id; the date is shown as written.
 *
 * Each feature is one step of the tour. `art` picks its animated picture (see scenes.tsx):
 * mark, share, devices, layers, check or spark.
 */

export interface Feature {
  title: string;
  text: string;
  art: Art;
}

export interface Release {
  /** Unique and never reused, such as 2026-10-18. */
  id: string;
  date: string;
  title: string;
  /** One or two sentences under the title on the opening step. */
  intro: string;
  features: Feature[];
}

export const APP_NAME = 'Write';

export const RELEASES: Release[] = [
  {
    id: '2026-10-19',
    date: '19 October 2026',
    title: "A fresh coat for Write",
    intro: "Small touches that make Write feel like part of the ELUM family.",
    features: [
      {
        title: "A symbol for sharing",
        text: "Share now has its own ELUM symbol: two people, and the part you share between them.",
        art: 'share',
      },
      {
        title: "The right icon, everywhere",
        text: "Browsers now show the Write icon in your tabs and bookmarks, matching Type, Make and ELUM Account.",
        art: 'mark',
      },
      {
        title: "Updates, told properly",
        text: "This tour. You will see one like it after each update, and can replay them any time from your account menu.",
        art: 'spark',
      },
    ],
  },
  {
    id: '2026-10-18',
    date: '18 October 2026',
    title: "Write is ready for everyone",
    intro: "Your documents, saved to your ELUM account and shared with the people you work with.",
    features: [
      {
        title: "Your own ELUM Type address",
        text: "Create your account with your email, or with a new ELUM Type address, right from Write.",
        art: 'check',
      },
      {
        title: "A face for every account",
        text: "Every account gets a profile, so people see your name when you share and comment.",
        art: 'share',
      },
      {
        title: "One account, every app",
        text: "The same ELUM account works in Write, Type, Make and ELUM Account, on every device you sign in to.",
        art: 'devices',
      },
      {
        title: "Clearer when things go wrong",
        text: "Signing up or confirming your email now says what happened, with a button to send the email again.",
        art: 'check',
      },
    ],
  },
];

/** The releases someone has not seen yet, given the last one they saw. New visitors see the latest. */
export function unseenReleases(releases: Release[], lastSeen: string | null): Release[] {
  if (!releases.length) return [];
  const at = lastSeen ? releases.findIndex((r) => r.id === lastSeen) : -1;
  return at === -1 ? releases.slice(0, 1) : releases.slice(0, at);
}

export interface Step {
  key: string;
  eyebrow: string;
  title: string;
  text: string;
  art: Art;
}

/** The tour for some releases: each opens with its title, then one step per feature. */
export function tourSteps(releases: Release[]): Step[] {
  return releases.flatMap((r) => [
    { key: `${r.id}:intro`, eyebrow: `New in ${APP_NAME} · ${r.date}`, title: r.title, text: r.intro, art: 'mark' as const },
    ...r.features.map((f, i) => ({ key: `${r.id}:${i}`, eyebrow: r.title, title: f.title, text: f.text, art: f.art })),
  ]);
}
