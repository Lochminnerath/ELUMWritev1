import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { formatReference, type CitationStyle, type Person, type Source, type SourceKind } from './citations';

const KINDS: { value: SourceKind; label: string }[] = [
  { value: 'book', label: 'Book' },
  { value: 'article', label: 'Journal article' },
  { value: 'website', label: 'Web page' },
];

type Field = keyof Omit<Source, 'id' | 'kind' | 'authors'>;

const FIELDS: Record<SourceKind, { key: Field; label: string; hint?: string; wide?: boolean }[]> = {
  book: [
    { key: 'title', label: 'Title', wide: true },
    { key: 'publisher', label: 'Publisher' },
    { key: 'place', label: 'City', hint: 'Chicago, Harvard, IEEE' },
    { key: 'year', label: 'Year' },
    { key: 'doi', label: 'DOI' },
  ],
  article: [
    { key: 'title', label: 'Article title', wide: true },
    { key: 'container', label: 'Journal', wide: true },
    { key: 'volume', label: 'Volume' },
    { key: 'issue', label: 'Issue' },
    { key: 'pages', label: 'Pages', hint: '45–67' },
    { key: 'year', label: 'Year' },
    { key: 'doi', label: 'DOI', hint: '10.1000/xyz123' },
    { key: 'url', label: 'Link', hint: 'If there is no DOI' },
  ],
  website: [
    { key: 'title', label: 'Page title', wide: true },
    { key: 'container', label: 'Website name' },
    { key: 'url', label: 'Link', wide: true },
    { key: 'year', label: 'Year published' },
    { key: 'month', label: 'Month', hint: '1–12' },
    { key: 'day', label: 'Day' },
    { key: 'accessed', label: 'Date you read it', hint: 'YYYY-MM-DD' },
  ],
};

const today = () => new Date().toISOString().slice(0, 10);
const blank = (kind: SourceKind = 'book'): Source => ({
  id: crypto.randomUUID(),
  kind,
  authors: [{ given: '', family: '' }],
  title: '',
  ...(kind === 'website' ? { accessed: today() } : {}),
});

/** Adds or edits a source, with a preview in the document's style. */
export function SourceDialog({
  open,
  initial,
  style,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Source | null;
  style: CitationStyle;
  onClose: () => void;
  onSave: (source: Source) => void;
}) {
  const [src, setSrc] = useState<Source>(() => initial ?? blank());
  useEffect(() => {
    if (open) setSrc(initial ? { ...initial, authors: initial.authors.length ? initial.authors : [{ given: '', family: '' }] } : blank());
  }, [open, initial]);

  const set = (patch: Partial<Source>) => setSrc((s) => ({ ...s, ...patch }));
  const setAuthor = (k: number, patch: Partial<Person>) => set({ authors: src.authors.map((a, i) => (i === k ? { ...a, ...patch } : a)) });
  const cleaned = (): Source => ({ ...src, authors: src.authors.filter((a) => a.family.trim() || a.given.trim()) });
  const preview = formatReference(style, cleaned(), 1);
  const valid = src.title.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Edit source' : 'Add a source'}
      description="Write titles the way they should appear. The entry updates as you type."
      width={620}
      footer={
        <>
          <button type="button" className="elum-btn elum-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="elum-btn elum-btn--primary"
            disabled={!valid}
            onClick={() => {
              onSave(cleaned());
              onClose();
            }}
          >
            {initial ? 'Save source' : 'Add source'}
          </button>
        </>
      }
    >
      <div className="source-form">
        <div className="chip-row" role="group" aria-label="Kind of source">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className="chip"
              aria-pressed={src.kind === k.value}
              onClick={() => set({ kind: k.value, ...(k.value === 'website' && !src.accessed ? { accessed: today() } : {}) })}
            >
              {k.label}
            </button>
          ))}
        </div>

        <fieldset className="source-form__authors">
          <legend className="field-label">Authors</legend>
          {src.authors.map((a, k) => (
            <div key={k} className="source-form__author">
              <input className="input input--sm" placeholder="First names" aria-label={`Author ${k + 1} first names`} value={a.given} onChange={(e) => setAuthor(k, { given: e.target.value })} />
              <input className="input input--sm" placeholder="Surname" aria-label={`Author ${k + 1} surname`} value={a.family} onChange={(e) => setAuthor(k, { family: e.target.value })} />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove author ${k + 1}`}
                disabled={src.authors.length === 1}
                onClick={() => set({ authors: src.authors.filter((_, i) => i !== k) })}
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
          ))}
          <button type="button" className="elum-btn elum-btn--quiet elum-btn--sm" onClick={() => set({ authors: [...src.authors, { given: '', family: '' }] })}>
            <Plus size={16} strokeWidth={2} /> Add author
          </button>
        </fieldset>

        <div className="source-form__grid">
          {FIELDS[src.kind].map((f) => (
            <label key={f.key} className="field" data-wide={f.wide || undefined}>
              <span className="field-label">{f.label}</span>
              <input className="input input--sm" value={(src[f.key] as string | undefined) ?? ''} placeholder={f.hint} onChange={(e) => set({ [f.key]: e.target.value })} />
            </label>
          ))}
        </div>

        <div className="source-form__preview" aria-live="polite">
          <span className="page-settings__label">Preview</span>
          <p>{preview.length ? preview.map((r, k) => (r.italic ? <em key={k}>{r.text}</em> : <span key={k}>{r.text}</span>)) : 'Fill in the title to see the entry.'}</p>
        </div>
      </div>
    </Dialog>
  );
}
