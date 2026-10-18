import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowUpDown,
  Bold,
  CaseSensitive,
  ChevronDown,
  Code,
  Ellipsis,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  MessageSquarePlus,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Menu, type MenuEntry } from '../../components/Menu';
import {
  BLOCK_STYLES,
  clearFormatting,
  currentFontSize,
  DEFAULT_LINE_SPACING,
  LETTER_SPACINGS,
  LINE_SPACINGS,
  PARAGRAPH_SPACES,
  setBlockStyle,
  shiftIndent,
  useFormatState,
} from '../format';
import { keyLabel } from '../keys';
import { TEXT_CASES } from '../textCase';
import { ColorPicker } from './ColorPicker';
import { FontPicker } from './FontPicker';
import { FontSizeControl } from './FontSizeControl';
import { LinkPopover } from './LinkPopover';
import type { CitationStyle } from '../academic/citations';
import './toolbar.css';

const ICON = { size: 18, strokeWidth: 1.75 };
const keep = (e: { preventDefault: () => void }) => e.preventDefault();

interface ButtonProps {
  label: string;
  keys?: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function ToolButton({ label, keys, icon: Icon, onClick, active, disabled }: ButtonProps) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      aria-pressed={active}
      data-tip={keys ? `${label} (${keyLabel(keys)})` : label}
      disabled={disabled}
      onMouseDown={keep}
      onClick={onClick}
    >
      <Icon {...ICON} />
    </button>
  );
}

function DropButton({ label, children, ...props }: { label: string; children: ReactNode } & Record<string, unknown>) {
  return (
    <button type="button" className="tb-select" aria-label={label} data-tip={label} onMouseDown={keep} {...props}>
      {children}
      <ChevronDown size={14} strokeWidth={1.75} />
    </button>
  );
}

const ALIGNS = [
  { value: 'left', label: 'Left', icon: AlignLeft, keys: 'Mod+Shift+L' },
  { value: 'center', label: 'Centre', icon: AlignCenter, keys: 'Mod+Shift+E' },
  { value: 'right', label: 'Right', icon: AlignRight, keys: 'Mod+Shift+R' },
  { value: 'justify', label: 'Justify', icon: AlignJustify, keys: 'Mod+Shift+J' },
] as const;

interface ToolbarProps {
  editor: Editor;
  /** The document's academic style, which sets its own default font and size. */
  academic?: CitationStyle | null;
  onInsertImage: () => void;
  onComment: () => void;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
}

export function Toolbar({ editor, academic = null, onInsertImage, onComment, linkOpen, onLinkOpenChange }: ToolbarProps) {
  const s = useFormatState(editor);
  const run = () => editor.chain().focus();
  const align = ALIGNS.find((a) => a.value === s.align) ?? ALIGNS[0];
  const blockLabel = BLOCK_STYLES.find((b) => b.value === s.blockStyle)?.label ?? 'Normal text';
  const lineHeight = s.lineHeight ?? DEFAULT_LINE_SPACING;

  const spacingItems: MenuEntry[] = [
    { heading: 'Line spacing' },
    ...LINE_SPACINGS.map((l) => ({
      label: l.label,
      checked: lineHeight === l.value,
      onSelect: () => run().setLineSpacing(l.value === DEFAULT_LINE_SPACING ? null : l.value).run(),
    })),
    'separator',
    {
      label: 'Space before paragraph',
      hint: `${s.spaceBefore ?? 0} pt`,
      items: PARAGRAPH_SPACES.map((pt) => ({
        label: pt ? `${pt} pt` : 'None',
        checked: (s.spaceBefore ?? 0) === pt,
        onSelect: () => run().setSpaceBefore(pt || null).run(),
      })),
    },
    {
      label: 'Space after paragraph',
      hint: s.spaceAfter === null ? 'Default' : `${s.spaceAfter} pt`,
      items: [
        { label: 'Default', checked: s.spaceAfter === null, onSelect: () => run().setSpaceAfter(null).run() },
        ...PARAGRAPH_SPACES.map((pt) => ({
          label: pt ? `${pt} pt` : 'None',
          checked: s.spaceAfter === pt,
          onSelect: () => run().setSpaceAfter(pt).run(),
        })),
      ],
    },
    {
      label: 'First line',
      hint: s.textIndent === 'first' ? 'Indented' : s.textIndent === 'hanging' ? 'Hanging' : s.textIndent === 'none' ? 'Flush' : 'Default',
      items: [
        { label: 'Default for this document', checked: s.textIndent === null, onSelect: () => run().setTextIndent(null).run() },
        { label: 'Indent first line', checked: s.textIndent === 'first', onSelect: () => run().setTextIndent('first').run() },
        { label: 'Hanging indent', checked: s.textIndent === 'hanging', onSelect: () => run().setTextIndent('hanging').run() },
        { label: 'No indent', checked: s.textIndent === 'none', onSelect: () => run().setTextIndent('none').run() },
      ],
    },
    {
      label: 'Letter spacing',
      hint: LETTER_SPACINGS.find((l) => l.value === s.letterSpacing)?.label ?? s.letterSpacing ?? 'Normal',
      items: LETTER_SPACINGS.map((l) => ({
        label: l.label,
        checked: s.letterSpacing === l.value,
        labelStyle: { letterSpacing: l.value ?? undefined },
        onSelect: () => (l.value ? run().setLetterSpacing(l.value).run() : run().unsetLetterSpacing().run()),
      })),
    },
  ];

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting" aria-orientation="horizontal">
      <div className="toolbar__group">
        <ToolButton label="Undo" keys="Mod+Z" icon={Undo2} disabled={!s.canUndo} onClick={() => run().undo().run()} />
        <ToolButton label="Redo" keys="Mod+Shift+Z" icon={Redo2} disabled={!s.canRedo} onClick={() => run().redo().run()} />
      </div>
      <span className="divider" />
      <Menu
        label="Paragraph style"
        className="style-menu"
        items={BLOCK_STYLES.map((b, i) => ({
          label: b.label,
          checked: s.blockStyle === b.value,
          shortcut: keyLabel(`Mod+Alt+${i}`),
          labelStyle: STYLE_PREVIEW[b.value],
          onSelect: () => setBlockStyle(editor, b.value),
        }))}
        trigger={(props) => (
          <DropButton label="Paragraph style" {...props}>
            <span className="tb-select__value tb-select__value--style">{blockLabel}</span>
          </DropButton>
        )}
      />
      <span className="divider" />
      <FontPicker editor={editor} value={s.fontFamily} fallback={academic ? '"Times New Roman", Times, serif' : undefined} />
      <span className="divider" />
      <FontSizeControl editor={editor} size={academic && !s.fontSize ? (academic === 'ieee' ? (s.blockStyle === 'h1' ? 24 : 10) : 12) : currentFontSize(s)} />
      <span className="divider" />
      <div className="toolbar__group">
        <ToolButton label="Bold" keys="Mod+B" icon={Bold} active={s.bold} onClick={() => run().toggleBold().run()} />
        <ToolButton label="Italic" keys="Mod+I" icon={Italic} active={s.italic} onClick={() => run().toggleItalic().run()} />
        <ToolButton label="Underline" keys="Mod+U" icon={Underline} active={s.underline} onClick={() => run().toggleUnderline().run()} />
        <Menu
          label="More text styles"
          items={[
            { label: 'Strikethrough', icon: <Strikethrough size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+Shift+S'), checked: s.strike, onSelect: () => run().toggleStrike().run() },
            { label: 'Superscript', icon: <Superscript size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+.'), checked: editor.isActive('superscript'), onSelect: () => run().toggleSuperscript().run() },
            { label: 'Subscript', icon: <Subscript size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+,'), checked: editor.isActive('subscript'), onSelect: () => run().toggleSubscript().run() },
            { label: 'Code', icon: <Code size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+E'), checked: editor.isActive('code'), onSelect: () => run().toggleCode().run() },
            'separator',
            {
              label: 'Change case',
              icon: <CaseSensitive size={16} strokeWidth={1.75} />,
              items: [
                ...TEXT_CASES.map((c) => ({ label: c.label, onSelect: () => run().setTextCase(c.value).run() })),
                'separator' as const,
                { label: 'Cycle case', shortcut: keyLabel('Shift+F3'), onSelect: () => run().cycleTextCase().run() },
              ],
            },
          ]}
          trigger={(props) => (
            <button type="button" className="icon-btn" aria-label="More text styles" data-tip="More text styles" onMouseDown={keep} {...props}>
              <Ellipsis {...ICON} />
            </button>
          )}
        />
        <ColorPicker editor={editor} kind="text" value={s.color} />
        <ColorPicker editor={editor} kind="highlight" value={s.highlight} />
      </div>
      <span className="divider" />
      <div className="toolbar__group">
        <LinkPopover editor={editor} active={s.link} href={s.href} empty={s.empty} open={linkOpen} onOpenChange={onLinkOpenChange} />
        <ToolButton label="Add comment" keys="Mod+Alt+M" icon={MessageSquarePlus} onClick={onComment} />
        <ToolButton label="Insert image" icon={ImagePlus} onClick={onInsertImage} />
      </div>
      <span className="divider" />
      <div className="toolbar__group">
        <Menu
          label="Align"
          items={ALIGNS.map((a) => ({
            label: a.label,
            icon: <a.icon size={16} strokeWidth={1.75} />,
            checked: s.align === a.value,
            shortcut: keyLabel(a.keys),
            onSelect: () => run().setTextAlign(a.value).run(),
          }))}
          trigger={(props) => (
            <DropButton label="Align" {...props}>
              <align.icon {...ICON} />
            </DropButton>
          )}
        />
        <Menu
          label="Line and paragraph spacing"
          items={spacingItems}
          trigger={(props) => (
            <button type="button" className="icon-btn" aria-label="Line and paragraph spacing" data-tip="Spacing" onMouseDown={keep} {...props}>
              <ArrowUpDown {...ICON} />
            </button>
          )}
        />
      </div>
      <span className="divider" />
      <div className="toolbar__group">
        <Menu
          label="Lists and indent"
          items={[
            { label: 'Bulleted list', icon: <List size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+Shift+8'), checked: s.bulletList, onSelect: () => run().toggleBulletList().run() },
            { label: 'Numbered list', icon: <ListOrdered size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+Shift+7'), checked: s.orderedList, onSelect: () => run().toggleOrderedList().run() },
            { label: 'Checklist', icon: <ListTodo size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+Shift+9'), checked: s.taskList, onSelect: () => run().toggleTaskList().run() },
            'separator',
            { label: 'Increase indent', icon: <IndentIncrease size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+]'), onSelect: () => shiftIndent(editor, 1) },
            { label: 'Decrease indent', icon: <IndentDecrease size={16} strokeWidth={1.75} />, shortcut: keyLabel('Mod+['), onSelect: () => shiftIndent(editor, -1) },
          ]}
          trigger={(props) => {
            const ListIcon = s.orderedList ? ListOrdered : s.taskList ? ListTodo : List;
            return (
              <DropButton label="Lists and indent" aria-pressed={s.bulletList || s.orderedList || s.taskList} {...props}>
                <ListIcon {...ICON} />
              </DropButton>
            );
          }}
        />
      </div>
      <span className="divider" />
      <div className="toolbar__group">
        <ToolButton label="Clear formatting" keys="Mod+\" icon={RemoveFormatting} onClick={() => clearFormatting(editor)} />
      </div>
    </div>
  );
}

/** Menu labels drawn in each paragraph style. */
const STYLE_PREVIEW: Record<string, CSSProperties> = {
  p: {},
  h1: { fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 22, lineHeight: '28px' },
  h2: { fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 18, lineHeight: '24px' },
  h3: { fontWeight: 600, fontSize: 15 },
  h4: { fontWeight: 600, fontSize: 14, color: 'var(--ink-muted)' },
};
