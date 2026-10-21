import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, ImageOff } from 'lucide-react';
import { DeleteIcon } from '../components/icons/ElumIcons';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ElumImageOptions, ImageAlign, ImageAttrs, ImageWrap } from './extensions/ElumImage';

const MIN_WIDTH = 32;
const ICON = { size: 16, strokeWidth: 1.75 };

const WRAPS: { value: ImageWrap; label: string; hint: string }[] = [
  { value: 'inline', label: 'In line', hint: 'Sits on the line with the text' },
  { value: 'wrap', label: 'Wrap', hint: 'Text flows around the image' },
  { value: 'break', label: 'Break', hint: 'Image on its own line' },
];

const SIZES = [
  { label: '25%', ratio: 0.25 },
  { label: '50%', ratio: 0.5 },
  { label: '100%', ratio: 1 },
];

type Corner = 'nw' | 'ne' | 'sw' | 'se';

const keep = (e: { preventDefault: () => void }) => e.preventDefault();

export function ImageView({ node, updateAttributes, selected, editor, extension, deleteNode, getPos }: ReactNodeViewProps<HTMLSpanElement>) {
  const attrs = node.attrs as ImageAttrs;
  const { resolveSrc } = extension.options as ElumImageOptions;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [editingAlt, setEditingAlt] = useState(false);
  const [alt, setAlt] = useState(attrs.alt ?? '');
  const frameRef = useRef<HTMLSpanElement>(null);
  const canEdit = editor.isEditable && editor.storage.permissions?.canEdit !== false;

  useEffect(() => {
    let alive = true;
    setFailed(false);
    resolveSrc(attrs.src)
      .then((resolved) => alive && setUrl(resolved))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [attrs.src, resolveSrc]);

  useEffect(() => {
    if (!selected) setEditingAlt(false);
  }, [selected]);

  /** Changes the image and keeps it selected, so its toolbar stays open. */
  const update = (changes: Partial<ImageAttrs>) => {
    updateAttributes(changes);
    const pos = getPos();
    if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
  };

  /** Usable line width in CSS pixels. */
  const contentWidth = () => parseFloat(getComputedStyle(editor.view.dom).width) || 624;

  const startResize = (corner: Corner) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    e.preventDefault();
    e.stopPropagation();
    const cssWidth = parseFloat(getComputedStyle(frame).width);
    // Screen pixels per CSS pixel, which accounts for page zoom.
    const scale = frame.getBoundingClientRect().width / cssWidth || 1;
    const max = contentWidth();
    const startX = e.clientX;
    const direction = corner === 'ne' || corner === 'se' ? 1 : -1;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let latest = cssWidth;

    const onMove = (ev: PointerEvent) => {
      latest = Math.round(Math.min(max, Math.max(MIN_WIDTH, cssWidth + ((ev.clientX - startX) / scale) * direction)));
      setLiveWidth(latest);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      setLiveWidth(null);
      if (Math.abs(latest - cssWidth) >= 1) update({ width: latest });
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  };

  const setWrap = (wrap: ImageWrap) => {
    // Wrapped images float left or right; there is no centred float.
    const align: ImageAlign = wrap === 'wrap' && attrs.align === 'center' ? 'left' : attrs.align;
    update({ wrap, align });
  };

  const width = liveWidth ?? attrs.width;
  const showControls = selected && canEdit;

  return (
    <NodeViewWrapper as="span" className="image" data-selected={selected || undefined}>
      <span ref={frameRef} className="image__frame" style={{ width: width ? `${width}px` : undefined }}>
        {failed ? (
          <span className="image__missing" role="img" aria-label={attrs.alt || 'Image unavailable'}>
            <ImageOff size={20} strokeWidth={1.75} />
            Image unavailable
          </span>
        ) : url ? (
          <img src={url} alt={attrs.alt ?? ''} draggable={false} data-drag-handle />
        ) : (
          <span className="image__loading" aria-label="Loading image" />
        )}

        {showControls &&
          (['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
            <span
              key={corner}
              className={`image-handle image-handle--${corner}`}
              onPointerDown={startResize(corner)}
              aria-hidden="true"
            />
          ))}
        {liveWidth && <span className="image__size kbd">{liveWidth} px</span>}
      </span>

      {showControls && (
        <span className="image-toolbar" contentEditable={false} onMouseDown={keep} role="toolbar" aria-label="Image options">
          {editingAlt ? (
            <form
              className="image-toolbar__alt"
              onSubmit={(e) => {
                e.preventDefault();
                update({ alt: alt.trim() || null });
                setEditingAlt(false);
                editor.commands.focus();
              }}
            >
              <input
                className="input input--sm"
                value={alt}
                autoFocus
                placeholder="Describe the image"
                aria-label="Alt text"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => setAlt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingAlt(false);
                    editor.commands.focus();
                  }
                }}
              />
              <button type="submit" className="elum-btn elum-btn--primary elum-btn--sm">
                Save
              </button>
            </form>
          ) : (
            <>
              <span className="image-toolbar__group" role="group" aria-label="Text wrapping">
                {WRAPS.map((w) => (
                  <button
                    key={w.value}
                    type="button"
                    className="image-toolbar__text"
                    aria-pressed={attrs.wrap === w.value}
                    data-tip={w.hint}
                    onClick={() => setWrap(w.value)}
                  >
                    {w.label}
                  </button>
                ))}
              </span>
              {attrs.wrap !== 'inline' && (
                <span className="image-toolbar__group" role="group" aria-label="Position">
                  {(
                    [
                      ['left', AlignLeft, 'Left'],
                      ['center', AlignCenter, 'Centre'],
                      ['right', AlignRight, 'Right'],
                    ] as const
                  )
                    .filter(([value]) => attrs.wrap === 'break' || value !== 'center')
                    .map(([value, Icon, label]) => (
                      <button
                        key={value}
                        type="button"
                        className="icon-btn"
                        aria-label={label}
                        data-tip={label}
                        aria-pressed={attrs.align === value}
                        onClick={() => update({ align: value })}
                      >
                        <Icon {...ICON} />
                      </button>
                    ))}
                </span>
              )}
              <span className="image-toolbar__group" role="group" aria-label="Size">
                {SIZES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="image-toolbar__text"
                    data-tip={`${s.label} of the line`}
                    onClick={() => update({ width: Math.round(contentWidth() * s.ratio) })}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
              <span className="image-toolbar__group">
                <button
                  type="button"
                  className="image-toolbar__text"
                  data-tip="Describe the image for screen readers"
                  onClick={() => {
                    setAlt(attrs.alt ?? '');
                    setEditingAlt(true);
                  }}
                >
                  Alt text
                </button>
                <button type="button" className="icon-btn" aria-label="Delete image" data-tip="Delete" onClick={() => deleteNode()}>
                  <DeleteIcon {...ICON} />
                </button>
              </span>
            </>
          )}
        </span>
      )}
    </NodeViewWrapper>
  );
}
