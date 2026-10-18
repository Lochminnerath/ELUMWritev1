import { Node } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import type { CitationStyle, Source } from './citations';

/**
 * Settings that belong to the whole document, stored on the document node:
 * the academic style, the header text, page numbers and the sources it cites.
 */
export interface DocSettings {
  docStyle: CitationStyle | null;
  /** Text before the page number in the header (the surname, in MLA). */
  header: string | null;
  pageNumbers: boolean;
  sources: Source[];
}

export const DEFAULT_DOC_SETTINGS: DocSettings = { docStyle: null, header: null, pageNumbers: false, sources: [] };

// Every default is null, so documents without settings stay exactly as they were stored
// (unset attributes are ignored when comparing documents; see api/content.ts).
export const ElumDocument = Document.extend({
  addAttributes() {
    return {
      docStyle: { default: null },
      header: { default: null },
      pageNumbers: { default: null },
      sources: { default: null },
    };
  },
});

/** The attributes to store for these settings: unset values become null. */
export function docAttrs(settings: Partial<DocSettings>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('docStyle' in settings) out.docStyle = settings.docStyle ?? null;
  if ('header' in settings) out.header = settings.header?.trim() ? settings.header.trim() : null;
  if ('pageNumbers' in settings) out.pageNumbers = settings.pageNumbers ? true : null;
  if ('sources' in settings) out.sources = settings.sources?.length ? settings.sources : null;
  return out;
}

/** Reads the document's settings, filling in defaults. */
export function docSettings(attrs: Record<string, unknown>): DocSettings {
  return {
    docStyle: (attrs.docStyle as CitationStyle | null) ?? null,
    header: typeof attrs.header === 'string' ? attrs.header : null,
    pageNumbers: attrs.pageNumbers === true,
    sources: Array.isArray(attrs.sources) ? (attrs.sources as Source[]) : [],
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

/** Starts a new page when printed. On screen it shows as a labelled line. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      // Set on the break in front of a works cited or reference list, so it moves with the list.
      citation: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-citation'),
        renderHTML: (attrs) => (attrs.citation ? { 'data-citation': attrs.citation } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-page-break': '', class: 'page-break' }];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: 'paragraph' }]).run(),
    };
  },

  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() };
  },
});

/** Marks a paragraph as part of the generated list of sources (`list` for its title, else the source id). */
export const LIST_TITLE = 'list';
