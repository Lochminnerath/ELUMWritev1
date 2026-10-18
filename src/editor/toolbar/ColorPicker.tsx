import type { Editor } from '@tiptap/core';
import { Baseline, Check, Highlighter, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { MAX_COLORS } from '../../api';
import { Popover } from '../../components/Popover';
import { usePreferences } from '../../preferences/PreferencesProvider';
import { keyLabel } from '../keys';
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../format';
import { ColorField } from './ColorField';

const keep = (e: { preventDefault: () => void }) => e.preventDefault();

interface ColorPickerProps {
  editor: Editor;
  kind: 'text' | 'highlight';
  value: string | null;
}

/**
 * Text colour or highlight: the brand swatches, the person's own colours (saved
 * with their account, so they appear on every device), and a custom colour picker.
 */
export function ColorPicker({ editor, kind, value }: ColorPickerProps) {
  const isText = kind === 'text';
  const label = isText ? 'Text colour' : 'Highlight';
  const rows = isText ? TEXT_COLORS : HIGHLIGHT_COLORS;
  const { preferences, update } = usePreferences();
  const [custom, setCustom] = useState<string | null>(null);

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
  const remember = (color: string) =>
    update((p) => ({ colors: [color, ...p.colors.filter((c) => c !== color)].slice(0, MAX_COLORS) }));
  const forget = (color: string) => update((p) => ({ colors: p.colors.filter((c) => c !== color) }));

  const swatch = (color: string, name: string, close: () => void) => {
    const selected = value?.toLowerCase() === color;
    return (
      <button
        key={color}
        type="button"
        className="swatch"
        style={{ background: color }}
        aria-label={name}
        aria-pressed={selected}
        title={name}
        onMouseDown={keep}
        onClick={() => {
          apply(color);
          close();
        }}
      >
        {selected && <Check size={14} strokeWidth={2.5} />}
      </button>
    );
  };

  return (
    <Popover
      label={label}
      restoreFocus={false}
      className="color-picker"
      onOpenChange={(open) => !open && setCustom(null)}
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
            {rows.flat().map((s) => swatch(s.value, s.name, close))}
          </div>
          <div className="color-picker__section">
            <span className="color-picker__heading">Your colours</span>
            <div className="color-picker__grid" role="group" aria-label="Your colours">
              {preferences.colors.map((c) => swatch(c, `Your colour ${c}`, close))}
              <button
                type="button"
                className="swatch swatch--add"
                aria-label="Custom colour"
                aria-expanded={custom !== null}
                title="Custom colour"
                onMouseDown={keep}
                onClick={() => setCustom((c) => (c === null ? (value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : isText ? '#c2410c' : '#ffd8a8') : null))}
              >
                <Plus size={14} strokeWidth={2} />
              </button>
            </div>
            {preferences.colors.length === 0 && custom === null && (
              <p className="color-picker__hint muted">Colours you make are saved to your account, on every device.</p>
            )}
          </div>
          {custom !== null && (
            <div className="color-picker__custom">
              <ColorField value={custom} onChange={setCustom} />
              <div className="color-picker__custom-actions">
                {preferences.colors.includes(custom) && (
                  <button type="button" className="elum-btn elum-btn--quiet elum-btn--sm" onMouseDown={keep} onClick={() => forget(custom)}>
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  className="elum-btn elum-btn--primary elum-btn--sm"
                  onMouseDown={keep}
                  onClick={() => {
                    remember(custom);
                    apply(custom);
                    close();
                  }}
                >
                  Use colour
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
