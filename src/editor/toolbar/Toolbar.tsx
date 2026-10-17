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
  ZOOMS,
} from '../format';
import { keyLabel } from '../keys';
import { TEXT_CASES } from '../textCase';
import { ColorPicker } from './ColorPicker';
import { FontPicker } from './FontPicker';
import { FontSizeControl } from './FontSizeControl';
import { LinkPopover } from './LinkPopover';
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
  zoom: number;
  onZoom: (zoom: number) => void;
  onInsertImage: () => void;
  onComment: () => void;
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
}

export function Toolbar({ editor, zoom, onZoom, onInsertImage, onComment, linkOpen, onLinkOpenChange }: ToolbarProps) {
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
        label="Zoom"
        items={ZOOMS.map((z) => ({ label: `${z}%`, checked: z === zoom, onSelect: () => onZoom(z) }))}
        trigger={(props) => (
          <DropButton label="Zoom" {...props}>
            <span className="tb-select__value kbd">{zoom}%</span>
          </DropButton>
        )}
      />
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
      <FontPicker editor={editor} value={s.fontFamily} />
      <span className="divider" />
      <FontSizeControl editor={editor} size={currentFontSize(s)} />
      <span className="divider" />
      <div className="toolbar__group">
        <ToolButton label="Bold" keys="Mod+B" icon={Bold} active={s.bold} onClick={() => run().toggleBold().run()} />
        <ToolButton label="Italic" keys="Mod+I" icon={Italic} active={s.italic} onClick={() => run().toggleItalic().run()} />
        <ToolButton label="Underline" keys="Mod+U" icon={Underline} active={s.underline} onClick={() => run().toggleUnderline().run()} />
        <ToolButton label="Strikethrough" keys="Mod+Shift+S" icon={Strikethrough} active={s.strike} onClick={() => run().toggleStrike().run()} />
        <ColorPicker editor={editor} kind="text" value={s.color} />
        <ColorPicker editor={editor} kind="highlight" value={s.highlight} />
        <Menu
          label="Change case"
          items={[
            ...TEXT_CASES.map((c) => ({ label: c.label, onSelect: () => run().setTextCase(c.value).run() })),
            'separator' as const,
            { label: 'Cycle case', shortcut: keyLabel('Shift+F3'), onSelect: () => run().cycleTextCase().run() },
          ]}
          trigger={(props) => (
            <button type="button" className="icon-btn" aria-label="Change case" data-tip="Change case" onMouseDown={keep} {...props}>
              <CaseSensitive {...ICON} />
            </button>
          )}
        />
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
        <ToolButton label="Bulleted list" keys="Mod+Shift+8" icon={List} active={s.bulletList} onClick={() => run().toggleBulletList().run()} />
        <ToolButton label="Numbered list" keys="Mod+Shift+7" icon={ListOrdered} active={s.orderedList} onClick={() => run().toggleOrderedList().run()} />
        <ToolButton label="Checklist" keys="Mod+Shift+9" icon={ListTodo} active={s.taskList} onClick={() => run().toggleTaskList().run()} />
      </div>
      <span className="divider" />
      <div className="toolbar__group">
        <ToolButton label="Decrease indent" keys="Mod+[" icon={IndentDecrease} onClick={() => shiftIndent(editor, -1)} />
        <ToolButton label="Increase indent" keys="Mod+]" icon={IndentIncrease} onClick={() => shiftIndent(editor, 1)} />
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
