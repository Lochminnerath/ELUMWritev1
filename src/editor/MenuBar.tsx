import type { Editor } from '@tiptap/core';
import {
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Keyboard,
  Link2,
  ListTodo,
  LogOut,
  MessageSquarePlus,
  Minus,
  PenLine,
  Printer,
  Share2,
  TextQuote,
  Trash2,
  Type,
} from 'lucide-react';
import { useState } from 'react';
import type { Role } from '../api';
import { canComment as roleCanComment, canEdit as roleCanEdit } from '../api/roles';
import { Menu, type MenuEntry } from '../components/Menu';
import {
  BLOCK_STYLES,
  clearFormatting,
  DEFAULT_LINE_SPACING,
  LETTER_SPACINGS,
  LINE_SPACINGS,
  PARAGRAPH_SPACES,
  setBlockStyle,
  shiftIndent,
  ZOOMS,
} from './format';
import { keyLabel } from './keys';
import { TEXT_CASES } from './textCase';

const ICON = { size: 16, strokeWidth: 1.75 };

export type PageMode = 'theme' | 'paper';

export interface MenuActions {
  newDocument: () => void;
  openDocuments: () => void;
  duplicate: () => void;
  share: () => void;
  downloadHtml: () => void;
  downloadText: () => void;
  print: () => void;
  rename: () => void;
  remove: () => void;
  insertImage: () => void;
  insertLink: () => void;
  addComment: () => void;
  wordCount: () => void;
  shortcuts: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  commentsOpen: boolean;
  toggleComments: () => void;
  pageMode: PageMode;
  setPageMode: (m: PageMode) => void;
}

export function MenuBar({ editor, role, actions }: { editor: Editor; role: Role; actions: MenuActions }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const editable = roleCanEdit(role);
  const commentable = roleCanComment(role);
  const run = () => editor.chain().focus();

  const file = (): MenuEntry[] => [
    { label: 'New document', icon: <FilePlus2 {...ICON} />, onSelect: actions.newDocument },
    { label: 'Open your documents', icon: <FolderOpen {...ICON} />, onSelect: actions.openDocuments },
    { label: 'Make a copy', icon: <Copy {...ICON} />, onSelect: actions.duplicate },
    'separator',
    { label: 'Share', icon: <Share2 {...ICON} />, onSelect: actions.share },
    {
      label: 'Download',
      icon: <Download {...ICON} />,
      items: [
        { label: 'Web page (.html)', onSelect: actions.downloadHtml },
        { label: 'Plain text (.txt)', onSelect: actions.downloadText },
        { label: 'PDF (through Print)', onSelect: actions.print },
      ],
    },
    { label: 'Print', icon: <Printer {...ICON} />, shortcut: keyLabel('Mod+P'), onSelect: actions.print },
    'separator',
    { label: 'Rename', icon: <PenLine {...ICON} />, disabled: !editable, onSelect: actions.rename },
    role === 'owner'
      ? { label: 'Delete', icon: <Trash2 {...ICON} />, danger: true, onSelect: actions.remove }
      : { label: 'Remove from my documents', icon: <LogOut {...ICON} />, onSelect: actions.remove },
  ];

  const edit = (): MenuEntry[] => [
    { label: 'Undo', shortcut: keyLabel('Mod+Z'), disabled: !editable || !editor.can().undo(), onSelect: () => run().undo().run() },
    { label: 'Redo', shortcut: keyLabel('Mod+Shift+Z'), disabled: !editable || !editor.can().redo(), onSelect: () => run().redo().run() },
    'separator',
    { label: 'Select all', shortcut: keyLabel('Mod+A'), onSelect: () => run().selectAll().run() },
  ];

  const view = (): MenuEntry[] => [
    { label: 'Zoom', hint: `${actions.zoom}%`, items: ZOOMS.map((z) => ({ label: `${z}%`, checked: actions.zoom === z, onSelect: () => actions.setZoom(z) })) },
    {
      label: 'Page colour',
      items: [
        { label: 'Match light or dark mode', checked: actions.pageMode === 'theme', onSelect: () => actions.setPageMode('theme') },
        { label: 'Always white paper', checked: actions.pageMode === 'paper', onSelect: () => actions.setPageMode('paper') },
      ],
    },
    { label: 'Show comments', checked: actions.commentsOpen, disabled: !commentable, onSelect: actions.toggleComments },
  ];

  const insert = (): MenuEntry[] => [
    { label: 'Image from your computer', icon: <ImagePlus {...ICON} />, disabled: !editable, onSelect: actions.insertImage },
    { label: 'Link', icon: <Link2 {...ICON} />, shortcut: keyLabel('Mod+K'), disabled: !editable, onSelect: actions.insertLink },
    { label: 'Comment', icon: <MessageSquarePlus {...ICON} />, shortcut: keyLabel('Mod+Alt+M'), disabled: !commentable, onSelect: actions.addComment },
    'separator',
    { label: 'Horizontal line', icon: <Minus {...ICON} />, disabled: !editable, onSelect: () => run().setHorizontalRule().run() },
    { label: 'Checklist', icon: <ListTodo {...ICON} />, disabled: !editable, onSelect: () => run().toggleTaskList().run() },
    { label: 'Quote', icon: <TextQuote {...ICON} />, disabled: !editable, onSelect: () => run().toggleBlockquote().run() },
    {
      label: "Today's date",
      icon: <Type {...ICON} />,
      disabled: !editable,
      onSelect: () => run().insertContent(new Date().toLocaleDateString(undefined, { dateStyle: 'long' })).run(),
    },
  ];

  const format = (): MenuEntry[] => {
    const block = editor.state.selection.$from.parent;
    const textStyle = editor.getAttributes('textStyle');
    const lineHeight = (block.attrs.lineHeight as string | null) ?? DEFAULT_LINE_SPACING;
    return [
      {
        label: 'Text',
        items: [
          { label: 'Bold', shortcut: keyLabel('Mod+B'), checked: editor.isActive('bold'), onSelect: () => run().toggleBold().run() },
          { label: 'Italic', shortcut: keyLabel('Mod+I'), checked: editor.isActive('italic'), onSelect: () => run().toggleItalic().run() },
          { label: 'Underline', shortcut: keyLabel('Mod+U'), checked: editor.isActive('underline'), onSelect: () => run().toggleUnderline().run() },
          { label: 'Strikethrough', shortcut: keyLabel('Mod+Shift+S'), checked: editor.isActive('strike'), onSelect: () => run().toggleStrike().run() },
          { label: 'Superscript', shortcut: keyLabel('Mod+.'), checked: editor.isActive('superscript'), onSelect: () => run().toggleSuperscript().run() },
          { label: 'Subscript', shortcut: keyLabel('Mod+,'), checked: editor.isActive('subscript'), onSelect: () => run().toggleSubscript().run() },
          { label: 'Code', shortcut: keyLabel('Mod+E'), checked: editor.isActive('code'), onSelect: () => run().toggleCode().run() },
        ],
      },
      {
        label: 'Change case',
        items: [
          ...TEXT_CASES.map((c) => ({ label: c.label, onSelect: () => run().setTextCase(c.value).run() })),
          'separator' as const,
          { label: 'Cycle case', shortcut: keyLabel('Shift+F3'), onSelect: () => run().cycleTextCase().run() },
        ],
      },
      {
        label: 'Paragraph style',
        items: BLOCK_STYLES.map((b, i) => ({
          label: b.label,
          shortcut: keyLabel(`Mod+Alt+${i}`),
          checked: b.value === 'p' ? block.type.name === 'paragraph' : block.type.name === 'heading' && `h${block.attrs.level}` === b.value,
          onSelect: () => setBlockStyle(editor, b.value),
        })),
      },
      {
        label: 'Align',
        items: (
          [
            ['left', 'Left', 'Mod+Shift+L'],
            ['center', 'Centre', 'Mod+Shift+E'],
            ['right', 'Right', 'Mod+Shift+R'],
            ['justify', 'Justify', 'Mod+Shift+J'],
          ] as const
        ).map(([value, label, keys]) => ({
          label,
          shortcut: keyLabel(keys),
          checked: ((block.attrs.textAlign as string | null) ?? 'left') === value,
          onSelect: () => run().setTextAlign(value).run(),
        })),
      },
      {
        label: 'Line spacing',
        items: LINE_SPACINGS.map((l) => ({
          label: l.label,
          checked: lineHeight === l.value,
          onSelect: () => run().setLineSpacing(l.value === DEFAULT_LINE_SPACING ? null : l.value).run(),
        })),
      },
      {
        label: 'Paragraph spacing',
        items: [
          { heading: 'Before' },
          ...PARAGRAPH_SPACES.map((pt) => ({
            label: pt ? `${pt} pt` : 'None',
            checked: ((block.attrs.spaceBefore as number | null) ?? 0) === pt,
            onSelect: () => run().setSpaceBefore(pt || null).run(),
          })),
          { heading: 'After' },
          { label: 'Default', checked: block.attrs.spaceAfter == null, onSelect: () => run().setSpaceAfter(null).run() },
          ...PARAGRAPH_SPACES.map((pt) => ({
            label: pt ? `${pt} pt` : 'None',
            checked: block.attrs.spaceAfter === pt,
            onSelect: () => run().setSpaceAfter(pt).run(),
          })),
        ],
      },
      {
        label: 'Letter spacing',
        items: LETTER_SPACINGS.map((l) => ({
          label: l.label,
          checked: ((textStyle.letterSpacing as string | undefined) ?? null) === l.value,
          labelStyle: { letterSpacing: l.value ?? undefined },
          onSelect: () => (l.value ? run().setLetterSpacing(l.value).run() : run().unsetLetterSpacing().run()),
        })),
      },
      'separator',
      { label: 'Increase indent', shortcut: keyLabel('Mod+]'), onSelect: () => shiftIndent(editor, 1) },
      { label: 'Decrease indent', shortcut: keyLabel('Mod+['), onSelect: () => shiftIndent(editor, -1) },
      {
        label: 'Lists',
        items: [
          { label: 'Bulleted list', shortcut: keyLabel('Mod+Shift+8'), checked: editor.isActive('bulletList'), onSelect: () => run().toggleBulletList().run() },
          { label: 'Numbered list', shortcut: keyLabel('Mod+Shift+7'), checked: editor.isActive('orderedList'), onSelect: () => run().toggleOrderedList().run() },
          { label: 'Checklist', shortcut: keyLabel('Mod+Shift+9'), checked: editor.isActive('taskList'), onSelect: () => run().toggleTaskList().run() },
        ],
      },
      'separator',
      { label: 'Clear formatting', shortcut: keyLabel('Mod+\\'), onSelect: () => clearFormatting(editor) },
    ];
  };

  const tools = (): MenuEntry[] => [{ label: 'Word count', shortcut: keyLabel('Mod+Shift+C'), onSelect: actions.wordCount }];
  const help = (): MenuEntry[] => [
    { label: 'Keyboard shortcuts', icon: <Keyboard {...ICON} />, shortcut: keyLabel('Mod+/'), onSelect: actions.shortcuts },
  ];

  const menus: { label: string; items: () => MenuEntry[] }[] = [
    { label: 'File', items: file },
    { label: 'Edit', items: edit },
    { label: 'View', items: view },
    { label: 'Insert', items: insert },
    ...(editable ? [{ label: 'Format', items: format }] : []),
    { label: 'Tools', items: tools },
    { label: 'Help', items: help },
  ];

  return (
    <nav className="menubar" aria-label="Document menu">
      {menus.map((m, i) => (
        <Menu
          key={m.label}
          label={m.label}
          items={m.items}
          open={openIndex === i}
          onOpenChange={(o) => setOpenIndex(o ? i : null)}
          trigger={(props) => (
            <button
              type="button"
              className="menubar__item"
              {...props}
              onPointerEnter={() => openIndex !== null && openIndex !== i && setOpenIndex(i)}
            >
              {m.label}
            </button>
          )}
        />
      ))}
    </nav>
  );
}
