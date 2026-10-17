import type { Editor } from '@tiptap/core';
import { Baseline, Check, Highlighter, Pipette, X } from 'lucide-react';
import { Popover } from '../../components/Popover';
import { keyLabel } from '../keys';
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../format';

const keep = (e: { preventDefault: () => void }) => e.preventDefault();

interface ColorPickerProps {
  editor: Editor;
  kind: 'text' | 'highlight';
  value: string | null;
}

/** Text colour or highlight: a swatch grid plus any custom colour. */
export function ColorPicker({ editor, kind, value }: ColorPickerProps) {
  const isText = kind === 'text';
  const label = isText ? 'Text colour' : 'Highlight';
  const rows = isText ? TEXT_COLORS : HIGHLIGHT_COLORS;

  const apply = (color: string) => {
    const chain = editor.chain().focus();
    if (isText) chain.setColor(color).run();
    else chain.setHighlight({ color }).run();
  };
  const reset = () => {
    const chain = editor.chain().focus();
    if (isText) chain.unsetColor().run();
    else chain.unsetHighlight().run();
  };

  return (
    <Popover
      label={label}
      restoreFocus={false}
      className="color-picker"
      trigger={(props) => (
        <button
          type="button"
          className="icon-btn color-trigger"
          aria-label={label}
          data-tip={isText ? label : `${label} (${keyLabel('Mod+Shift+H')})`}
          onMouseDown={keep}
          {...props}
        >
          {isText ? <Baseline size={18} strokeWidth={1.75} /> : <Highlighter size={18} strokeWidth={1.75} />}
          <span className="color-trigger__bar" style={{ background: value ?? (isText ? 'var(--ink)' : 'transparent') }} />
        </button>
      )}
    >
      {(close) => (
        <div className="color-picker__body">
          <button
            type="button"
            className="color-picker__reset"
            onMouseDown={keep}
            onClick={() => {
              reset();
              close();
            }}
          >
            {isText ? <span className="color-picker__auto" /> : <X size={16} strokeWidth={1.75} />}
            {isText ? 'Automatic' : 'No highlight'}
          </button>
          <div className="color-picker__grid" role="group" aria-label={`${label} swatches`}>
            {rows.flat().map((swatch) => {
              const selected = value?.toLowerCase() === swatch.value;
              return (
                <button
                  key={swatch.value}
                  type="button"
                  className="swatch"
                  style={{ background: swatch.value }}
                  aria-label={swatch.name}
                  aria-pressed={selected}
                  title={swatch.name}
                  onMouseDown={keep}
                  onClick={() => {
                    apply(swatch.value);
                    close();
                  }}
                >
                  {selected && <Check size={14} strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
          <label className="color-picker__custom">
            <Pipette size={16} strokeWidth={1.75} aria-hidden="true" />
            Custom colour
            <input
              type="color"
              value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : isText ? '#141a2e' : '#fff3a3'}
              onChange={(e) => apply(e.target.value)}
            />
          </label>
        </div>
      )}
    </Popover>
  );
}
