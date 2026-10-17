/**
 * Sources and how each academic style cites them. Pure functions: the editor
 * turns the runs into text with italics.
 */
export type CitationStyle = 'mla' | 'apa' | 'chicago' | 'harvard' | 'ieee';
export type SourceKind = 'book' | 'article' | 'website';

export interface Person {
  given: string;
  family: string;
}

export interface Source {
  id: string;
  kind: SourceKind;
  authors: Person[];
  title: string;
  /** Journal name for articles, site name for websites. */
  container?: string;
  publisher?: string;
  place?: string;
  year?: string;
  /** 1–12, for websites and dated articles. */
  month?: string;
  day?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  /** When a web page was read, as YYYY-MM-DD. */
  accessed?: string;
}

/** A piece of a formatted citation. */
export interface Run {
  text: string;
  italic?: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** MLA abbreviates months longer than four letters. */
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const IEEE_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];

const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim();
const initials = (given: string) =>
  clean(given)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((n) => `${n[0].toUpperCase()}.`)
    .join(' ');
const endsWithStop = (s: string) => /[.?!]$/.test(s);
/** Adds a full stop unless the text already ends in one (titles ending in ? or !). */
const stop = (s: string) => (endsWithStop(s) ? s : `${s}.`);
const pages = (p?: string) => clean(p).replace(/\s*-+\s*/g, '–');
const doiUrl = (doi?: string) => {
  const d = clean(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return d ? `https://doi.org/${d}` : '';
};
const monthIndex = (m?: string) => {
  const n = parseInt(clean(m), 10);
  return n >= 1 && n <= 12 ? n - 1 : -1;
};
function accessedParts(iso?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
  return m ? { year: m[1], month: parseInt(m[2], 10) - 1, day: String(parseInt(m[3], 10)) } : null;
}

/** Joins runs, dropping empty ones. */
function runs(...parts: (Run | string | false | null | undefined)[]): Run[] {
  return parts
    .filter((p): p is Run | string => !!p && (typeof p === 'string' ? p.length > 0 : p.text.length > 0))
    .map((p) => (typeof p === 'string' ? { text: p } : p));
}
const i = (text: string): Run => ({ text, italic: true });
/** An italic title followed by a roman full stop (none if the title ends in ? or !). */
const iStop = (text: string): Run[] => [i(text), { text: endsWithStop(text) ? '' : '.' }];

/** Merges neighbouring runs with the same styling and tidies spaces. */
export function tidy(list: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of list) {
    const last = out[out.length - 1];
    if (last && !!last.italic === !!r.italic) last.text += r.text;
    else out.push({ ...r });
  }
  return out.map((r) => ({ ...r, text: r.text.replace(/ {2,}/g, ' ') })).filter((r) => r.text);
}

export const plain = (list: Run[]) => list.map((r) => r.text).join('');

// ------------------------------------------------------------------ authors

function mlaAuthors(a: Person[]): string {
  if (!a.length) return '';
  const first = `${clean(a[0].family)}, ${clean(a[0].given)}`.replace(/, $/, '');
  if (a.length === 1) return first;
  if (a.length === 2) return `${first}, and ${clean(a[1].given)} ${clean(a[1].family)}`.trim();
  return `${first}, et al`;
}

function apaName(p: Person) {
  const ini = initials(p.given);
  return ini ? `${clean(p.family)}, ${ini}` : clean(p.family);
}
function apaAuthors(a: Person[]): string {
  if (!a.length) return '';
  if (a.length === 1) return apaName(a[0]);
  if (a.length <= 20) return `${a.slice(0, -1).map(apaName).join(', ')}, & ${apaName(a[a.length - 1])}`;
  return `${a.slice(0, 19).map(apaName).join(', ')}, . . . ${apaName(a[a.length - 1])}`;
}

function chicagoAuthors(a: Person[]): string {
  if (!a.length) return '';
  const first = `${clean(a[0].family)}, ${clean(a[0].given)}`.replace(/, $/, '');
  const rest = a.slice(1).map((p) => `${clean(p.given)} ${clean(p.family)}`.trim());
  if (!rest.length) return first;
  if (a.length > 10) return `${first}, et al`;
  return `${[first, ...rest.slice(0, -1)].join(', ')}, and ${rest[rest.length - 1]}`;
}

function harvardName(p: Person) {
  const ini = initials(p.given).replace(/ /g, '');
  return ini ? `${clean(p.family)}, ${ini}` : clean(p.family);
}
function harvardAuthors(a: Person[]): string {
  if (!a.length) return '';
  if (a.length >= 4) return `${harvardName(a[0])} et al.`;
  if (a.length === 1) return harvardName(a[0]);
  return `${a.slice(0, -1).map(harvardName).join(', ')} and ${harvardName(a[a.length - 1])}`;
}

function ieeeName(p: Person) {
  return `${initials(p.given)} ${clean(p.family)}`.trim();
}
function ieeeAuthors(a: Person[]): string {
  if (!a.length) return '';
  if (a.length > 6) return `${ieeeName(a[0])} et al.`;
  if (a.length === 1) return ieeeName(a[0]);
  if (a.length === 2) return `${ieeeName(a[0])} and ${ieeeName(a[1])}`;
  return `${a.slice(0, -1).map(ieeeName).join(', ')}, and ${ieeeName(a[a.length - 1])}`;
}

// ------------------------------------------------------------- references

function mla(s: Source): Run[] {
  const author = mlaAuthors(s.authors);
  const lead = author ? `${stop(author)} ` : '';
  const title = clean(s.title);
  const m = monthIndex(s.month);
  const pub = [clean(s.day), m >= 0 ? MLA_MONTHS[m] : '', clean(s.year)].filter(Boolean).join(' ');
  const link = doiUrl(s.doi) || clean(s.url).replace(/^https?:\/\//, '');
  const acc = accessedParts(s.accessed);
  if (s.kind === 'book') {
    return runs(lead, ...iStop(title), ' ', [clean(s.publisher), clean(s.year)].filter(Boolean).join(', '), clean(s.publisher) || clean(s.year) ? '.' : '');
  }
  if (s.kind === 'article') {
    const tail = [
      clean(s.volume) && `vol. ${clean(s.volume)}`,
      clean(s.issue) && `no. ${clean(s.issue)}`,
      pub,
      pages(s.pages) && `pp. ${pages(s.pages)}`,
      link,
    ].filter(Boolean);
    return runs(lead, `“${stop(title)}” `, i(clean(s.container)), tail.length ? `, ${tail.join(', ')}.` : '.');
  }
  const tail = [pub, link].filter(Boolean);
  return runs(
    lead,
    `“${stop(title)}” `,
    i(clean(s.container)),
    tail.length ? `${clean(s.container) ? ', ' : ''}${tail.join(', ')}.` : clean(s.container) ? '.' : '',
    acc && ` Accessed ${acc.day} ${MLA_MONTHS[acc.month]} ${acc.year}.`,
  );
}

function apa(s: Source): Run[] {
  const author = apaAuthors(s.authors);
  const m = monthIndex(s.month);
  const date = clean(s.year) ? (s.kind === 'website' && m >= 0 ? `${clean(s.year)}, ${MONTHS[m]}${clean(s.day) ? ` ${clean(s.day)}` : ''}` : clean(s.year)) : 'n.d.';
  const title = clean(s.title);
  const link = doiUrl(s.doi) || clean(s.url);
  // Without an author, the title moves to the front.
  if (!author) {
    const lead = s.kind === 'article' ? `${stop(title)} ` : '';
    const head = s.kind === 'article' ? runs(lead, `(${date}). `) : runs(...iStop(title), ` (${date}). `);
    return runs(...head, ...apaRest(s, true), link && ` ${link}`);
  }
  return runs(`${stop(author)} (${date}). `, ...apaRest(s, false), link && ` ${link}`);
}
function apaRest(s: Source, titleUsed: boolean): Run[] {
  const title = clean(s.title);
  if (s.kind === 'book') return runs(...(titleUsed ? [] : iStop(title)), !titleUsed && ' ', clean(s.publisher) && stop(clean(s.publisher)));
  if (s.kind === 'article') {
    const vol = clean(s.volume);
    return runs(
      !titleUsed && `${stop(title)} `,
      i(`${clean(s.container)}${vol ? `, ${vol}` : ''}`),
      clean(s.issue) && `(${clean(s.issue)})`,
      pages(s.pages) ? `, ${pages(s.pages)}.` : '.',
    );
  }
  return runs(...(titleUsed ? [] : iStop(title)), clean(s.container) && ` ${stop(clean(s.container))}`);
}

function chicago(s: Source): Run[] {
  const author = chicagoAuthors(s.authors);
  const title = clean(s.title);
  const year = clean(s.year) || 'n.d.';
  const lead = author ? `${stop(author)} ${year}. ` : '';
  const link = doiUrl(s.doi) || clean(s.url);
  if (s.kind === 'book') {
    const pub = [clean(s.place), clean(s.publisher)].filter(Boolean).join(': ');
    return runs(lead, ...iStop(title), author ? '' : ` ${year}.`, pub && ` ${stop(pub)}`, link && ` ${link}.`);
  }
  if (s.kind === 'article') {
    return runs(
      lead,
      `“${stop(title)}” `,
      author ? '' : `${year}. `,
      i(clean(s.container)),
      clean(s.volume) && ` ${clean(s.volume)}`,
      clean(s.issue) && ` (${clean(s.issue)})`,
      pages(s.pages) ? `: ${pages(s.pages)}.` : '.',
      link && ` ${link}.`,
    );
  }
  const m = monthIndex(s.month);
  const pub = m >= 0 ? `${MONTHS[m]}${clean(s.day) ? ` ${clean(s.day)}` : ''}, ${clean(s.year)}` : '';
  const acc = accessedParts(s.accessed);
  return runs(
    lead,
    `“${stop(title)}” `,
    author ? '' : `${year}. `,
    clean(s.container) && `${stop(clean(s.container))} `,
    pub ? `${pub}. ` : acc ? `Accessed ${MONTHS[acc.month]} ${acc.day}, ${acc.year}. ` : '',
    link && `${link}.`,
  );
}

function harvard(s: Source): Run[] {
  const author = harvardAuthors(s.authors);
  const year = clean(s.year) || 'no date';
  const title = clean(s.title);
  const lead = author ? `${author} (${year}) ` : '';
  const acc = accessedParts(s.accessed);
  if (s.kind === 'book') {
    const pub = [clean(s.place), clean(s.publisher)].filter(Boolean).join(': ');
    return runs(lead, ...iStop(title), author ? '' : ` (${year})`, pub && ` ${stop(pub)}`);
  }
  if (s.kind === 'article') {
    const vol = [clean(s.volume), clean(s.issue) && `(${clean(s.issue)})`].filter(Boolean).join('');
    const tail = [vol, pages(s.pages) && `pp. ${pages(s.pages)}`].filter(Boolean).join(', ');
    return runs(
      lead,
      `‘${title}’, `,
      author ? '' : `(${year}) `,
      i(clean(s.container)),
      tail ? `, ${tail}.` : '.',
      clean(s.doi) && ` doi: ${doiUrl(s.doi).replace('https://doi.org/', '')}.`,
      !clean(s.doi) && clean(s.url) && ` Available at: ${clean(s.url)}${acc ? ` (Accessed: ${acc.day} ${MONTHS[acc.month]} ${acc.year})` : ''}.`,
    );
  }
  return runs(
    lead,
    ...iStop(title),
    author ? '' : ` (${year})`,
    clean(s.url) && ` Available at: ${clean(s.url)}`,
    acc ? ` (Accessed: ${acc.day} ${MONTHS[acc.month]} ${acc.year}).` : clean(s.url) ? '.' : '',
  );
}

function ieee(s: Source, n: number): Run[] {
  const author = ieeeAuthors(s.authors);
  const lead = `[${n}] ${author ? `${author}, ` : ''}`;
  const title = clean(s.title);
  if (s.kind === 'book') {
    const pub = [clean(s.place), clean(s.publisher)].filter(Boolean).join(': ');
    return runs(lead, i(title), '. ', [pub, clean(s.year)].filter(Boolean).join(', '), '.');
  }
  const m = monthIndex(s.month);
  if (s.kind === 'article') {
    const parts = [
      clean(s.volume) && `vol. ${clean(s.volume)}`,
      clean(s.issue) && `no. ${clean(s.issue)}`,
      pages(s.pages) && `pp. ${pages(s.pages)}`,
      [m >= 0 ? IEEE_MONTHS[m] : '', clean(s.year)].filter(Boolean).join(' '),
      clean(s.doi) && `doi: ${doiUrl(s.doi).replace('https://doi.org/', '')}`,
    ].filter(Boolean);
    return runs(lead, `“${title},” `, i(clean(s.container)), parts.length ? `, ${parts.join(', ')}.` : '.');
  }
  const acc = accessedParts(s.accessed);
  return runs(
    lead,
    `“${title},” `,
    clean(s.container) && `${clean(s.container)}. `,
    acc && `Accessed: ${IEEE_MONTHS[acc.month]} ${acc.day}, ${acc.year}. `,
    clean(s.url) && `[Online]. Available: ${clean(s.url)}`,
  );
}

/** The full entry for a works cited or reference list. `n` is the source's number (IEEE). */
export function formatReference(style: CitationStyle, source: Source, n = 1): Run[] {
  const r = style === 'mla' ? mla(source) : style === 'apa' ? apa(source) : style === 'chicago' ? chicago(source) : style === 'harvard' ? harvard(source) : ieee(source, n);
  return tidy(r);
}

// ---------------------------------------------------------------- in text

function shortTitle(s: Source) {
  const words = clean(s.title).split(' ');
  return words.length > 4 ? `${words.slice(0, 4).join(' ')}` : clean(s.title);
}

/** The citation that goes in the text, such as (Rivera 42) or [3]. */
export function formatInText(style: CitationStyle, source: Source, page = '', n = 1): string {
  const a = source.authors;
  const p = clean(page);
  const fam = (k: number) => clean(a[k]?.family);
  if (style === 'ieee') return `[${n}]`;
  if (style === 'mla') {
    const who = !a.length ? `“${shortTitle(source)}”` : a.length === 1 ? fam(0) : a.length === 2 ? `${fam(0)} and ${fam(1)}` : `${fam(0)} et al.`;
    return `(${[who, pages(p)].filter(Boolean).join(' ')})`;
  }
  const year = clean(source.year) || (style === 'harvard' ? 'no date' : 'n.d.');
  if (style === 'apa') {
    const who = !a.length ? shortTitle(source) : a.length === 1 ? fam(0) : a.length === 2 ? `${fam(0)} & ${fam(1)}` : `${fam(0)} et al.`;
    const loc = p ? `, ${/[-–,]/.test(p) ? 'pp.' : 'p.'} ${pages(p)}` : '';
    return `(${who}, ${year}${loc})`;
  }
  if (style === 'chicago') {
    const who = !a.length ? `“${shortTitle(source)}”` : a.length === 1 ? fam(0) : a.length === 2 ? `${fam(0)} and ${fam(1)}` : a.length === 3 ? `${fam(0)}, ${fam(1)}, and ${fam(2)}` : `${fam(0)} et al.`;
    return `(${who} ${year}${p ? `, ${pages(p)}` : ''})`;
  }
  const who = !a.length ? shortTitle(source) : a.length === 1 ? fam(0) : a.length <= 3 ? `${a.slice(0, -1).map((_, k) => fam(k)).join(', ')} and ${fam(a.length - 1)}` : `${fam(0)} et al.`;
  return `(${who}, ${year}${p ? `, ${/[-–,]/.test(p) ? 'pp.' : 'p.'} ${pages(p)}` : ''})`;
}

/** Sort key for author-ordered lists: first author's family name, else the title. */
export function sortKey(s: Source): string {
  const name = s.authors[0] ? `${clean(s.authors[0].family)} ${clean(s.authors[0].given)}` : clean(s.title).replace(/^(the|a|an)\s+/i, '');
  return `${name} ${clean(s.year)}`.toLowerCase();
}
