import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';

/** Paragraph styles, in menu order. Title is the document's h1. */
export const BLOCK_STYLES = [
  { value: 'p', label: 'Normal text', defaultSize: 12 },
  { value: 'h1', label: 'Title', defaultSize: 28 },
  { value: 'h2', label: 'Heading 1', defaultSize: 18 },
  { value: 'h3', label: 'Heading 2', defaultSize: 14 },
  { value: 'h4', label: 'Heading 3', defaultSize: 12 },
] as const;

export type BlockStyle = (typeof BLOCK_STYLES)[number]['value'];

export function setBlockStyle(editor: Editor, style: BlockStyle) {
  const chain = editor.chain().focus();
  if (style === 'p') chain.setParagraph().run();
  else chain.setHeading({ level: Number(style.slice(1)) as 1 | 2 | 3 | 4 }).run();
}

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];

export const LINE_SPACINGS = [
  { value: '1', label: 'Single' },
  { value: '1.15', label: '1.15' },
  { value: '1.5', label: '1.5' },
  { value: '2', label: 'Double' },
];
/** Line spacing when none is set, matching the stylesheet. */
export const DEFAULT_LINE_SPACING = '1.5';

export const PARAGRAPH_SPACES = [0, 6, 12, 18, 24];

export const LETTER_SPACINGS = [
  { value: '-0.02em', label: 'Tight' },
  { value: null, label: 'Normal' },
  { value: '0.05em', label: 'Wide' },
  { value: '0.1em', label: 'Wider' },
  { value: '0.2em', label: 'Widest' },
];

export interface Swatch {
  name: string;
  value: string;
}

export const TEXT_COLORS: Swatch[][] = [
  [
    { name: 'Black', value: '#000000' },
    { name: 'Ink', value: '#141a2e' },
    { name: 'Dark grey', value: '#434343' },
    { name: 'Grey', value: '#666666' },
    { name: 'Mid grey', value: '#999999' },
    { name: 'Light grey', value: '#cccccc' },
    { name: 'White', value: '#ffffff' },
  ],
  [
    { name: 'Deep blue', value: '#3b5bd6' },
    { name: 'Deep apricot', value: '#a84d17' },
    { name: 'Deep mint', value: '#187a5f' },
    { name: 'Deep violet', value: '#604590' },
    { name: 'Deep rose', value: '#a8335f' },
    { name: 'Deep gold', value: '#7f5c00' },
    { name: 'Deep red', value: '#b42318' },
  ],
  [
    { name: 'Blue', value: '#7093f8' },
    { name: 'Apricot', value: '#f59a52' },
    { name: 'Mint', value: '#3fc4a0' },
    { name: 'Violet', value: '#9b84ee' },
    { name: 'Rose', value: '#ec7fa9' },
    { name: 'Gold', value: '#e9b949' },
    { name: 'Red', value: '#e5484d' },
  ],
];

export const HIGHLIGHT_COLORS: Swatch[][] = [
  [
    { name: 'Yellow', value: '#fff3a3' },
    { name: 'Apricot', value: '#fde2c8' },
    { name: 'Mint', value: '#c8f0e3' },
    { name: 'Blue', value: '#dbe4fe' },
    { name: 'Violet', value: '#e6defc' },
    { name: 'Rose', value: '#fbd7e6' },
    { name: 'Grey', value: '#e2e5ee' },
  ],
  [
    { name: 'Bright yellow', value: '#ffe066' },
    { name: 'Bright apricot', value: '#f8b98a' },
    { name: 'Bright mint', value: '#8ee3c8' },
    { name: 'Bright blue', value: '#a9bdfc' },
    { name: 'Bright violet', value: '#c6b6f7' },
    { name: 'Bright rose', value: '#f5a9c6' },
    { name: 'Gold', value: '#f2d06b' },
  ],
];

export const ZOOMS = [50, 75, 90, 100, 125, 150, 200];

/** Removes text formatting but keeps links and comment anchors. */
export function clearFormatting(editor: Editor) {
  const keep = new Set(['link', 'comment']);
  const chain = editor.chain().focus();
  Object.keys(editor.schema.marks)
    .filter((name) => !keep.has(name))
    .forEach((name) => chain.unsetMark(name, { extendEmptyMarkRange: true }));
  chain.run();
}

/** Adds https:// when there is no scheme, and only allows web, email and phone links. */
export function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return `https://${value}`;
}

/** The live formatting at the cursor, for toolbars and menus. */
export function useFormatState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const textStyle = e.getAttributes('textStyle');
      const { $from, empty } = e.state.selection;
      const block = $from.parent;
      const blockStyle: BlockStyle = block.type.name === 'heading' ? (`h${block.attrs.level}` as BlockStyle) : 'p';
      return {
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        superscript: e.isActive('superscript'),
        subscript: e.isActive('subscript'),
        code: e.isActive('code'),
        blockStyle,
        align: (block.attrs.textAlign as string | null) ?? 'left',
        fontFamily: (textStyle.fontFamily as string | undefined) ?? null,
        fontSize: (textStyle.fontSize as string | undefined) ?? null,
        color: (textStyle.color as string | undefined) ?? null,
        letterSpacing: (textStyle.letterSpacing as string | undefined) ?? null,
        highlight: e.isActive('highlight') ? ((e.getAttributes('highlight').color as string | undefined) ?? '#fff3a3') : null,
        lineHeight: (block.attrs.lineHeight as string | null) ?? null,
        spaceBefore: (block.attrs.spaceBefore as number | null) ?? null,
        spaceAfter: (block.attrs.spaceAfter as number | null) ?? null,
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        taskList: e.isActive('taskList'),
        blockquote: e.isActive('blockquote'),
        link: e.isActive('link'),
        href: (e.getAttributes('link').href as string | undefined) ?? null,
        empty,
        inList: e.isActive('listItem') || e.isActive('taskItem'),
      };
    },
  });
}

export type FormatState = ReturnType<typeof useFormatState>;

/** Indent or outdent, nesting list items when in a list. */
export function shiftIndent(editor: Editor, direction: 1 | -1) {
  const item = editor.isActive('taskItem') ? 'taskItem' : editor.isActive('listItem') ? 'listItem' : null;
  const chain = editor.chain().focus();
  if (item) {
    if (direction > 0) chain.sinkListItem(item).run();
    else chain.liftListItem(item).run();
  } else if (direction > 0) chain.indent().run();
  else chain.outdent().run();
}

/** Current font size in points, falling back to the paragraph style's default. */
export function currentFontSize(state: FormatState): number {
  if (state.fontSize) {
    const n = parseFloat(state.fontSize);
    if (state.fontSize.endsWith('px')) return Math.round(n * 0.75 * 10) / 10;
    return n;
  }
  return BLOCK_STYLES.find((s) => s.value === state.blockStyle)?.defaultSize ?? 12;
}
