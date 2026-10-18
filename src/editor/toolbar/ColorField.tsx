import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clamp, hexToHsv, hsvToHex, normalizeHex, type Hsv } from './colorMath';

interface ColorFieldProps {
  value: string;
  onChange: (hex: string) => void;
}

/** A colour area, a hue slider and a hex field, drawn by Write rather than the device. */
export function ColorField({ value, onChange }: ColorFieldProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 25, s: 0.7, v: 0.96 });
  const [text, setText] = useState(value.replace('#', ''));

  // Follow outside changes (picking a saved colour) without losing the hue of greys.
  useEffect(() => {
    if (normalizeHex(value) === hsvToHex(hsv)) return;
    const next = hexToHsv(value);
    if (next) {
      setHsv((old) => ({ ...next, h: next.s === 0 ? old.h : next.h }));
      setText(value.replace('#', ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setText(hex.slice(1));
    onChange(hex);
  };

  const drag = (apply: (x: number, y: number) => void) => (e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    e.preventDefault();
    el.focus();
    el.setPointerCapture(e.pointerId);
    const move = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      apply(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height));
    };
    move(e);
    const onMove = (ev: globalThis.PointerEvent) => move(ev);
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const areaKeys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    commit({ ...hsv, s: clamp(hsv.s + m[0]), v: clamp(hsv.v + m[1]) });
  };
  const hueKeys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 30 : 5;
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : 0;
    if (!d) return;
    e.preventDefault();
    commit({ ...hsv, h: (hsv.h + d + 360) % 360 });
  };

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const current = hsvToHex(hsv);

  return (
    <div className="color-field">
      <div
        className="color-field__area"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onPointerDown={drag((x, y) => commit({ ...hsv, s: x, v: 1 - y }))}
        onKeyDown={areaKeys}
      >
        <span className="color-field__thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
      </div>
      <div
        className="color-field__hue"
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onPointerDown={drag((x) => commit({ ...hsv, h: x * 359.9 }))}
        onKeyDown={hueKeys}
      >
        <span className="color-field__thumb color-field__thumb--hue" style={{ left: `${(hsv.h / 360) * 100}%`, background: pure }} />
      </div>
      <label className="color-field__hex">
        <span className="color-field__preview" style={{ background: current }} />
        <span className="muted">#</span>
        <input
          value={text}
          maxLength={7}
          spellCheck={false}
          aria-label="Hex colour"
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9a-f#]/gi, '');
            setText(raw.replace('#', ''));
            const hex = /^#?([0-9a-f]{6})$/i.test(raw) ? normalizeHex(raw) : null;
            const next = hex && hexToHsv(hex);
            if (hex && next) {
              setHsv(next);
              onChange(hex);
            }
          }}
          onBlur={() => setText(current.slice(1))}
        />
      </label>
    </div>
  );
}
