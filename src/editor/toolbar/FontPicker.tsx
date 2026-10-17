import type { Editor } from '@tiptap/core';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '../../components/Popover';
import { CATEGORY_LABEL, DEFAULT_FONT, findFont, FONTS, fontLabel, loadFonts, type FontCategory, type FontDef } from '../fonts';

const BRAND = new Set(['manrope', 'sora', 'ibm-plex-mono']);
const CATEGORY_ORDER: FontCategory[] = ['sans', 'serif', 'display', 'mono', 'handwriting'];

interface Group {
  label: string;
  fonts: FontDef[];
}

function groupFonts(fonts: FontDef[]): Group[] {
  const groups: Group[] = [
    { label: 'ELUM fonts', fonts: fonts.filter((f) => f.collection === 'elum') },
    { label: 'Brand', fonts: fonts.filter((f) => f.collection !== 'elum' && BRAND.has(f.id)) },
  ];
  const rest = fonts.filter((f) => f.collection !== 'elum' && !BRAND.has(f.id));
  for (const category of CATEGORY_ORDER) {
    groups.push({ label: CATEGORY_LABEL[category], fonts: rest.filter((f) => f.source.kind !== 'system' && f.category === category) });
  }
  groups.push({ label: 'On your computer', fonts: rest.filter((f) => f.source.kind === 'system') });
  return groups.filter((g) => g.fonts.length);
}

const keep = (e: { preventDefault: () => void }) => e.preventDefault();

/** `fallback` is the font text has when none is chosen (an academic style's Times New Roman). */
export function FontPicker({ editor, value, fallback }: { editor: Editor; value: string | null; fallback?: string }) {
  const current = value ?? fallback ?? DEFAULT_FONT.stack;
  return (
    <Popover
      label="Font"
      className="font-picker"
      restoreFocus={false}
      onOpenChange={(open) => open && loadFonts()}
      trigger={(props) => (
        <button type="button" className="tb-select tb-select--font" data-tip="Font" onMouseDown={keep} {...props}>
          <span className="tb-select__value" style={{ fontFamily: current }}>
            {fontLabel(value ?? fallback ?? null)}
          </span>
          <ChevronDown size={14} strokeWidth={1.75} />
        </button>
      )}
    >
      {(close) => (
        <FontList
          selected={findFont(current)?.id ?? null}
          onChoose={(font) => {
            close();
            const chain = editor.chain().focus();
            if (!font || font.id === DEFAULT_FONT.id) chain.unsetFontFamily().run();
            else chain.setFontFamily(font.stack).run();
          }}
        />
      )}
    </Popover>
  );
}

function FontList({ selected, onChoose }: { selected: string | null; onChoose: (font: FontDef | null) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groupFonts(q ? FONTS.filter((f) => f.name.toLowerCase().includes(q)) : FONTS);
  }, [query]);
  const flat = groups.flatMap((g) => g.fonts);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let index = -1;
  return (
    <>
      <div className="font-picker__search">
        <Search size={16} strokeWidth={1.75} aria-hidden="true" />
        <input
          data-autofocus
          value={query}
          placeholder="Search fonts"
          aria-label="Search fonts"
          role="combobox"
          aria-expanded="true"
          aria-controls="font-list"
          aria-activedescendant={flat[active] ? `font-${flat[active].id}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(flat.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (flat[active]) onChoose(flat[active]);
            }
          }}
        />
      </div>
      <div id="font-list" ref={listRef} role="listbox" aria-label="Fonts" className="font-picker__list">
        {flat.length === 0 && <p className="font-picker__empty muted">No fonts match “{query}”.</p>}
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <div className="menu__heading">{group.label}</div>
            {group.fonts.map((font) => {
              index++;
              const i = index;
              return (
                <div
                  key={font.id}
                  id={`font-${font.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected === font.id}
                  className="menu__item"
                  data-active={active === i}
                  onPointerEnter={() => setActive(i)}
                  onMouseDown={keep}
                  onClick={() => onChoose(font)}
                >
                  <span className="menu__check">{selected === font.id && <Check size={16} strokeWidth={2} />}</span>
                  <span className="menu__label font-picker__name" style={{ fontFamily: font.stack }}>
                    {font.name}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
