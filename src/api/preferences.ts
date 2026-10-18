/**
 * Settings that follow a person to every device: their own colours and their
 * spelling dictionary. Stored with the account, never only in this browser.
 */
export type SpellLanguage = 'en-US' | 'en-GB';

export interface Preferences {
  /** Custom text and highlight colours, newest first, as #rrggbb. */
  colors: string[];
  /** Words added to the personal dictionary, lowercase as typed. */
  dictionary: string[];
  spellcheck: boolean;
  spellLanguage: SpellLanguage;
}

export const MAX_COLORS = 14;
export const MAX_DICTIONARY_WORDS = 5000;
export const MAX_WORD_LENGTH = 64;

/** UK spelling for people whose browser asks for British, Irish, Australian and similar English. */
function defaultSpellLanguage(): SpellLanguage {
  const langs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  const english = langs.find((l) => /^en\b/i.test(l)) ?? '';
  return /^en-(gb|ie|au|nz|za|in)\b/i.test(english) ? 'en-GB' : 'en-US';
}

export const DEFAULT_PREFERENCES: Preferences = {
  colors: [],
  dictionary: [],
  spellcheck: true,
  spellLanguage: defaultSpellLanguage(),
};

const HEX = /^#[0-9a-f]{6}$/;

/** Cleans whatever was stored (or sent) into a valid Preferences value. */
export function normalizePreferences(input: unknown): Preferences {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const colors = Array.isArray(raw.colors)
    ? [...new Set(raw.colors.filter((c): c is string => typeof c === 'string').map((c) => c.toLowerCase()).filter((c) => HEX.test(c)))].slice(0, MAX_COLORS)
    : DEFAULT_PREFERENCES.colors;
  const dictionary = Array.isArray(raw.dictionary)
    ? [
        ...new Set(
          raw.dictionary
            .filter((w): w is string => typeof w === 'string')
            .map((w) => w.trim())
            .filter((w) => w && w.length <= MAX_WORD_LENGTH && !/\s/.test(w)),
        ),
      ].slice(0, MAX_DICTIONARY_WORDS)
    : DEFAULT_PREFERENCES.dictionary;
  return {
    colors,
    dictionary,
    spellcheck: typeof raw.spellcheck === 'boolean' ? raw.spellcheck : DEFAULT_PREFERENCES.spellcheck,
    spellLanguage: raw.spellLanguage === 'en-GB' || raw.spellLanguage === 'en-US' ? raw.spellLanguage : DEFAULT_PREFERENCES.spellLanguage,
  };
}

/** Applies a change on top of the current preferences. */
export function mergePreferences(current: Preferences, patch: Partial<Preferences>): Preferences {
  return normalizePreferences({ ...current, ...patch });
}

/** Keeps only the settings a change mentions, each cleaned. */
export function cleanPreferencesPatch(patch: Partial<Preferences>): Partial<Preferences> {
  const clean = normalizePreferences({ ...DEFAULT_PREFERENCES, ...patch });
  const out: Partial<Preferences> = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
    if (key in patch) (out as Record<string, unknown>)[key] = clean[key];
  }
  return out;
}
