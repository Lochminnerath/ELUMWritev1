export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** Turns "Mod+Shift+X" into "⌘⇧X" on a Mac and "Ctrl+Shift+X" elsewhere. */
export function keyLabel(combo: string): string {
  if (isMac) {
    return combo
      .replace(/Mod\+?/g, '⌘')
      .replace(/Ctrl\+?/g, '⌃')
      .replace(/Alt\+?/g, '⌥')
      .replace(/Shift\+?/g, '⇧');
  }
  return combo.replace(/Mod/g, 'Ctrl');
}

/** True when the event has the platform's main modifier (Cmd on Mac, Ctrl elsewhere). */
export const hasMod = (e: { metaKey: boolean; ctrlKey: boolean }) => (isMac ? e.metaKey : e.ctrlKey);

export interface ShortcutGroup {
  title: string;
  items: { label: string; keys: string }[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Text',
    items: [
      { label: 'Bold', keys: 'Mod+B' },
      { label: 'Italic', keys: 'Mod+I' },
      { label: 'Underline', keys: 'Mod+U' },
      { label: 'Strikethrough', keys: 'Mod+Shift+S' },
      { label: 'Highlight', keys: 'Mod+Shift+H' },
      { label: 'Superscript', keys: 'Mod+.' },
      { label: 'Subscript', keys: 'Mod+,' },
      { label: 'Change case', keys: 'Shift+F3' },
      { label: 'Clear formatting', keys: 'Mod+\\' },
    ],
  },
  {
    title: 'Paragraphs',
    items: [
      { label: 'Normal text', keys: 'Mod+Alt+0' },
      { label: 'Title', keys: 'Mod+Alt+1' },
      { label: 'Heading 1 to 3', keys: 'Mod+Alt+2 … 4' },
      { label: 'Align left, centre, right', keys: 'Mod+Shift+L / E / R' },
      { label: 'Justify', keys: 'Mod+Shift+J' },
      { label: 'Bulleted list', keys: 'Mod+Shift+8' },
      { label: 'Numbered list', keys: 'Mod+Shift+7' },
      { label: 'Checklist', keys: 'Mod+Shift+9' },
      { label: 'Indent and outdent', keys: 'Mod+] / Mod+[' },
      { label: 'Insert a tab', keys: 'Tab' },
    ],
  },
  {
    title: 'Document',
    items: [
      { label: 'Add a comment', keys: 'Mod+Alt+M' },
      { label: 'Insert or edit a link', keys: 'Mod+K' },
      { label: 'Open a link', keys: 'Mod+Click' },
      { label: 'Word count', keys: 'Mod+Shift+C' },
      { label: 'Undo', keys: 'Mod+Z' },
      { label: 'Redo', keys: 'Mod+Shift+Z' },
      { label: 'Print', keys: 'Mod+P' },
      { label: 'Keyboard shortcuts', keys: 'Mod+/' },
    ],
  },
];
