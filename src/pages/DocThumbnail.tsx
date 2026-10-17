import type { PreviewBlock } from '../api';

/** A miniature page drawn from the first blocks of a document. */
export function DocThumbnail({ blocks }: { blocks: PreviewBlock[] }) {
  return (
    <div className="thumb" aria-hidden="true">
      <div className="thumb__page">
        {blocks.length === 0 && <div className="thumb__blank" />}
        {blocks.map((b, i) => {
          switch (b.kind) {
            case 'heading':
              return (
                <div key={i} className={`thumb__h thumb__h--${Math.min(b.level ?? 1, 3)}`}>
                  {b.text}
                </div>
              );
            case 'image':
              return <div key={i} className="thumb__img" />;
            case 'rule':
              return <hr key={i} className="thumb__rule" />;
            case 'list':
              return (
                <div key={i} className="thumb__p thumb__li">
                  {b.text}
                </div>
              );
            case 'quote':
              return (
                <div key={i} className="thumb__p thumb__quote">
                  {b.text}
                </div>
              );
            default:
              return (
                <div key={i} className="thumb__p">
                  {b.text || ' '}
                </div>
              );
          }
        })}
      </div>
    </div>
  );
}
