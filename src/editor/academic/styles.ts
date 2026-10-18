import type { DocNode } from '../../api';
import type { CitationStyle } from './citations';

/** Details for a paper's opening: heading block, title page, or title lines. */
export interface FrontMatter {
  name: string;
  instructor: string;
  course: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** School and department, for APA title pages. */
  affiliation: string;
}

export interface AcademicStyle {
  id: CitationStyle;
  label: string;
  edition: string;
  summary: string;
  /** Heading over the list of sources. */
  listTitle: string;
  /** Whether the list is ordered by author (else by number, IEEE). */
  alphabetical: boolean;
  /** Header text, before the page number. `surname` = the writer's surname (MLA). */
  header: 'surname' | 'none';
  /** Which front-matter fields the setup form asks for. */
  fields: (keyof FrontMatter)[];
  /** Whether the list of sources starts on a new page. */
  listOnNewPage: boolean;
  /** Bold, centred list title (APA, Chicago) rather than plain (MLA). */
  listTitleBold: boolean;
}

export const ACADEMIC_STYLES: AcademicStyle[] = [
  {
    id: 'mla',
    label: 'MLA',
    edition: '9th edition',
    summary: 'Times New Roman 12 pt, double spaced, 1 inch margins, your surname and the page number top right, a heading block, and Works Cited.',
    listTitle: 'Works Cited',
    alphabetical: true,
    header: 'surname',
    fields: ['name', 'instructor', 'course', 'date', 'title'],
    listOnNewPage: true,
    listTitleBold: false,
  },
  {
    id: 'apa',
    label: 'APA',
    edition: '7th edition, student paper',
    summary: 'Times New Roman 12 pt, double spaced, page numbers top right, a title page, bold headings, and References.',
    listTitle: 'References',
    alphabetical: true,
    header: 'none',
    fields: ['title', 'name', 'affiliation', 'course', 'instructor', 'date'],
    listOnNewPage: true,
    listTitleBold: true,
  },
  {
    id: 'chicago',
    label: 'Chicago',
    edition: '17th edition, author-date',
    summary: 'Times New Roman 12 pt, double spaced, page numbers top right, a title page, and References.',
    listTitle: 'References',
    alphabetical: true,
    header: 'none',
    fields: ['title', 'name', 'course', 'instructor', 'date'],
    listOnNewPage: true,
    listTitleBold: true,
  },
  {
    id: 'harvard',
    label: 'Harvard',
    edition: 'Cite Them Right',
    summary: 'Times New Roman 12 pt, 1.5 spaced, page numbers, a centred title, author-date citations, and a Reference list.',
    listTitle: 'Reference list',
    alphabetical: true,
    header: 'none',
    fields: ['title', 'name', 'course', 'date'],
    listOnNewPage: false,
    listTitleBold: true,
  },
  {
    id: 'ieee',
    label: 'IEEE',
    edition: 'Reference guide 2023',
    summary: 'Times New Roman, single spaced, justified, numbered citations like [1], and numbered References in the order cited.',
    listTitle: 'References',
    alphabetical: false,
    header: 'none',
    fields: ['title', 'name', 'affiliation', 'date'],
    listOnNewPage: false,
    listTitleBold: true,
  },
];

export const findStyle = (id: unknown) => ACADEMIC_STYLES.find((s) => s.id === id) ?? null;

const FONT = '"Times New Roman", Times, "Liberation Serif", serif';

/**
 * The look of each style, as CSS under `scope` (the editor's page or an exported
 * article). Paragraph settings people choose themselves still win, because they
 * are written on the paragraph.
 */
export function academicCss(scope: (style: CitationStyle) => string): string {
  const base = (id: CitationStyle, lineHeight: string, indent: string) => `
${scope(id)} { font-family: ${FONT}; font-size: 12pt; line-height: ${lineHeight}; }
${scope(id)} p { margin: 0; text-indent: ${indent}; }
${scope(id)} li > p { text-indent: 0; }
${scope(id)} h1, ${scope(id)} h2, ${scope(id)} h3, ${scope(id)} h4 { font-family: ${FONT}; font-size: 12pt; line-height: ${lineHeight}; letter-spacing: 0; color: inherit; margin: 0; }
${scope(id)} ul, ${scope(id)} ol, ${scope(id)} blockquote { margin: 0; }
${scope(id)} blockquote { border: 0; padding-left: 0.5in; color: inherit; }`;
  return [
    base('mla', '2', '0.5in'),
    `${scope('mla')} h1, ${scope('mla')} h2, ${scope('mla')} h3, ${scope('mla')} h4 { font-weight: 700; }`,
    base('apa', '2', '0.5in'),
    `${scope('apa')} h1 { font-weight: 700; text-align: center; }
${scope('apa')} h2 { font-weight: 700; }
${scope('apa')} h3 { font-weight: 700; font-style: italic; }
${scope('apa')} h4 { font-weight: 700; padding-left: 0.5in; }`,
    base('chicago', '2', '0.5in'),
    `${scope('chicago')} h1 { font-weight: 700; text-align: center; }
${scope('chicago')} h2 { font-weight: 700; }
${scope('chicago')} h3 { font-style: italic; font-weight: 400; }`,
    base('harvard', '1.5', '0'),
    `${scope('harvard')} p { margin-bottom: 12pt; }
${scope('harvard')} h1, ${scope('harvard')} h2, ${scope('harvard')} h3 { font-weight: 700; margin: 12pt 0 6pt; }`,
    base('ieee', '1.15', '0.125in'),
    `${scope('ieee')} { font-size: 10pt; text-align: justify; }
${scope('ieee')} h1 { font-size: 24pt; text-align: center; font-weight: 400; line-height: 1.2; margin-bottom: 6pt; }
${scope('ieee')} h2 { font-variant: small-caps; text-align: center; font-weight: 400; margin: 10pt 0 4pt; }
${scope('ieee')} h3 { font-style: italic; font-weight: 400; margin: 6pt 0 2pt; }
${scope('ieee')} p[data-citation] { text-indent: 0; padding-left: 0; font-size: 8pt; text-align: left; }`,
  ].join('\n');
}

// ------------------------------------------------------------- front matter

const text = (t: string, marks?: DocNode['marks']): DocNode => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const para = (attrs: Record<string, unknown>, content?: string, marks?: DocNode['marks']): DocNode => ({
  type: 'paragraph',
  attrs,
  ...(content ? { content: [text(content, marks)] } : {}),
});
const BOLD = [{ type: 'bold' }];
const flush = { textIndent: 'none' };
const centred = { textIndent: 'none', textAlign: 'center' };

export function formatDate(style: CitationStyle, iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  // MLA and Harvard write day month year; the others month day, year.
  return style === 'mla' || style === 'harvard' ? `${d.getDate()} ${month} ${d.getFullYear()}` : `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Surname for the MLA header: the last word of the writer's name. */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? '';
}

/** The opening a style asks for, as document blocks to place at the top. */
export function frontMatter(style: CitationStyle, f: FrontMatter): DocNode[] {
  const date = formatDate(style, f.date);
  const title = f.title.trim() || 'Title of your paper';
  const lines = (values: string[], attrs: Record<string, unknown>) => values.filter((v) => v.trim()).map((v) => para(attrs, v.trim()));
  switch (style) {
    case 'mla':
      return [...lines([f.name, f.instructor, f.course, date], flush), para(centred, title)];
    case 'apa':
      // Title page: title a few lines down, bold; then the writer's details; then the title again on page 2.
      return [
        para(centred),
        para(centred),
        para(centred),
        para(centred, title, BOLD),
        para(centred),
        ...lines([f.name, f.affiliation, f.course, f.instructor, date], centred),
        { type: 'pageBreak' },
        para(centred, title, BOLD),
      ];
    case 'chicago':
      return [
        para(centred),
        para(centred),
        para(centred),
        para(centred, title),
        para(centred),
        para(centred),
        ...lines([f.name, f.course, f.instructor, date], centred),
        { type: 'pageBreak' },
      ];
    case 'harvard':
      return [para(centred, title, BOLD), ...lines([f.name, f.course, date], centred), para(flush)];
    case 'ieee':
      return [{ type: 'heading', attrs: { level: 1, textIndent: 'none' }, content: [text(title)] }, ...lines([f.name, f.affiliation, date], centred), para(flush)];
  }
}
