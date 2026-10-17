import type { Editor } from '@tiptap/core';
import { Minus, Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPosition, useOutsidePress } from '../../components/Popover';
import { FONT_SIZES } from '../format';

const MIN = 1;
const MAX = 400;
const keep = (e: { preventDefault: () => void }) => e.preventDefault();

/** Font size in points: minus, a typeable field with common sizes, plus. */
export function FontSizeControl({ editor, size }: { editor: Editor; size: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const style = useFloatingPosition(open, inputRef, listRef, 'bottom-start');
  const inside = useCallback(() => [inputRef.current, listRef.current], []);
  const close = useCallback(() => setOpen(false), []);
  useOutsidePress(open, inside, close);

  const apply = (value: number) => {
    if (!Number.isFinite(value)) return;
    const pt = Math.min(MAX, Math.max(MIN, Math.round(value * 2) / 2));
    setDraft(null);
    setOpen(false);
    editor.chain().focus().setFontSize(`${pt}pt`).run();
  };

  const bigger = FONT_SIZES.find((s) => s > size) ?? size + 1;
  const smaller = [...FONT_SIZES].reverse().find((s) => s < size) ?? Math.max(MIN, size - 1);

  return (
    <div className="font-size">
      <button type="button" className="icon-btn" aria-label="Smaller text" data-tip="Smaller text" onMouseDown={keep} onClick={() => apply(smaller)}>
        <Minus size={16} strokeWidth={1.75} />
      </button>
      <input
        ref={inputRef}
        className="font-size__input"
        value={draft ?? String(size)}
        inputMode="decimal"
        aria-label="Font size in points"
        role="combobox"
        aria-expanded={open}
        aria-controls="font-size-list"
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setDraft(null);
          setOpen(false);
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply(parseFloat(draft ?? String(size)));
          } else if (e.key === 'Escape') {
            setDraft(null);
            setOpen(false);
            editor.commands.focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            apply(bigger);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            apply(smaller);
          }
        }}
      />
      <button type="button" className="icon-btn" aria-label="Bigger text" data-tip="Bigger text" onMouseDown={keep} onClick={() => apply(bigger)}>
        <Plus size={16} strokeWidth={1.75} />
      </button>
      {open &&
        createPortal(
          <div ref={listRef} id="font-size-list" role="listbox" aria-label="Font sizes" className="floating-panel size-list" style={style}>
            {FONT_SIZES.map((s) => (
              <div
                key={s}
                role="option"
                aria-selected={s === size}
                className="menu__item size-list__item"
                data-active={s === size}
                onMouseDown={(e) => {
                  e.preventDefault();
                  apply(s);
                }}
              >
                {s}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
