import { Extension } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';

/** Paragraph-level formatting: line spacing, space before and after, indent, and first-line indent. */

/**
 * `first`: the first line starts half an inch in (body text in MLA, APA and Chicago).
 * `hanging`: every line but the first starts half an inch in (works cited and reference lists).
 * `none`: no first-line indent, even where the document's style adds one.
 */
export type TextIndent = 'first' | 'hanging' | 'none';
export const TEXT_INDENTS: TextIndent[] = ['first', 'hanging', 'none'];

const TEXT_INDENT_STYLE: Record<TextIndent, string> = {
  first: 'text-indent: 0.5in',
  hanging: 'padding-left: 0.5in; text-indent: -0.5in',
  none: 'text-indent: 0',
};

export const MAX_INDENT = 8;
/** Each indent step is half an inch, as in most word processors. */
export const INDENT_STEP_IN = 0.5;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      /** Line height as a multiple, such as "1.15". `null` returns to the default. */
      setLineSpacing: (value: string | null) => ReturnType;
      /** Space before the paragraph, in points. */
      setSpaceBefore: (points: number | null) => ReturnType;
      /** Space after the paragraph, in points. */
      setSpaceAfter: (points: number | null) => ReturnType;
      indent: () => ReturnType;
      outdent: () => ReturnType;
      /** First-line or hanging indent, or `none` to switch off an academic style's indent. */
      setTextIndent: (value: TextIndent | null) => ReturnType;
    };
  }
}

function parsePoints(value: string): number | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return null;
  if (value.endsWith('px')) return Math.round(n * 0.75);
  return n;
}

export const ParagraphFormat = Extension.create<{ types: string[] }>({
  name: 'paragraphFormat',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight || null,
            renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
          },
          spaceBefore: {
            default: null,
            parseHTML: (el) => parsePoints(el.style.marginTop),
            renderHTML: (attrs) => (attrs.spaceBefore != null ? { style: `margin-top: ${attrs.spaceBefore}pt` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => parsePoints(el.style.marginBottom),
            renderHTML: (attrs) => (attrs.spaceAfter != null ? { style: `margin-bottom: ${attrs.spaceAfter}pt` } : {}),
          },
          // Paragraphs Write generates for a works cited or reference list (see academic/).
          citation: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-citation'),
            renderHTML: (attrs) => (attrs.citation ? { 'data-citation': attrs.citation } : {}),
          },
          textIndent: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute('data-text-indent');
              return TEXT_INDENTS.includes(v as TextIndent) ? v : null;
            },
            renderHTML: (attrs) =>
              attrs.textIndent ? { 'data-text-indent': attrs.textIndent, style: TEXT_INDENT_STYLE[attrs.textIndent as TextIndent] } : {},
          },
          indent: {
            default: null,
            parseHTML: (el) => {
              const n = parseInt(el.getAttribute('data-indent') ?? '', 10);
              return n > 0 ? Math.min(n, MAX_INDENT) : null;
            },
            renderHTML: (attrs) =>
              attrs.indent ? { 'data-indent': attrs.indent, style: `margin-left: ${attrs.indent * INDENT_STEP_IN}in` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    const types = this.options.types;

    const setAttr =
      (name: string, value: unknown) =>
      ({ commands }: { commands: { updateAttributes: (type: string, attrs: Record<string, unknown>) => boolean } }) =>
        types.map((type) => commands.updateAttributes(type, { [name]: value })).some(Boolean);

    /** Changes the indent of every paragraph and heading in the selection. */
    const shiftIndent =
      (delta: number) =>
      ({ tr, dispatch }: { tr: Transaction; dispatch?: (tr: Transaction) => void }) => {
        const { from, to } = tr.selection;
        let changed = false;
        tr.doc.nodesBetween(from, to, (node, pos) => {
          if (!types.includes(node.type.name)) return true;
          const current = (node.attrs.indent as number | null) ?? 0;
          const next = Math.max(0, Math.min(MAX_INDENT, current + delta));
          if (next !== current) {
            changed = true;
            if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next || null });
          }
          return false;
        });
        return changed;
      };

    return {
      setLineSpacing: (value) => setAttr('lineHeight', value),
      setSpaceBefore: (points) => setAttr('spaceBefore', points),
      setSpaceAfter: (points) => setAttr('spaceAfter', points),
      indent: () => shiftIndent(1),
      outdent: () => shiftIndent(-1),
      setTextIndent: (value) => setAttr('textIndent', value),
    };
  },
});
