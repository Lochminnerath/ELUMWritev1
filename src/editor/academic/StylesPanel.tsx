import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Check, Plus, Quote } from 'lucide-react';
import { NewIcon, RenameIcon } from '../../components/icons/ElumIcons';
import { DeleteIcon } from '../../components/icons/ElumIcons';
import { useState } from 'react';
import { useUser } from '../../auth/AuthProvider';
import { PanelShell } from '../SidePanels';
import { docSettings } from './AcademicDocument';
import { applyStyle, citeSource, insertFrontMatter, orderedSources, updateSettings } from './apply';
import { formatReference, type Source } from './citations';
import { SourceDialog } from './SourceDialog';
import { ACADEMIC_STYLES, findStyle, type FrontMatter } from './styles';

const FIELD_LABELS: Record<keyof FrontMatter, string> = {
  name: 'Your name',
  instructor: 'Instructor',
  course: 'Course',
  date: 'Date',
  title: 'Title',
  affiliation: 'School and department',
};

/** Academic formats (MLA, APA and more), the header, and the sources a paper cites. */
export function StylesPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const me = useUser();
  const settings = useEditorState({ editor, selector: ({ editor: e }) => docSettings(e.state.doc.attrs) });
  const style = findStyle(settings.docStyle);
  const [front, setFront] = useState<FrontMatter>({
    name: me.name,
    instructor: '',
    course: '',
    date: new Date().toISOString().slice(0, 10),
    title: '',
    affiliation: '',
  });
  const [setupOpen, setSetupOpen] = useState(false);
  const [editing, setEditing] = useState<Source | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pages, setPages] = useState<Record<string, string>>({});

  const saveSource = (source: Source) => {
    const exists = settings.sources.some((s) => s.id === source.id);
    updateSettings(editor, { sources: exists ? settings.sources.map((s) => (s.id === source.id ? source : s)) : [...settings.sources, source] });
  };

  return (
    <PanelShell title="Styles and citations" onClose={onClose}>
      <div className="styles-panel">
        <span className="page-settings__label">Format</span>
        <div className="style-list" role="radiogroup" aria-label="Document format">
          <button type="button" role="radio" className="style-card" aria-checked={!style} onClick={() => applyStyle(editor, null)}>
            <span className="style-card__name">Write</span>
            <span className="style-card__summary">Your own fonts and spacing.</span>
          </button>
          {ACADEMIC_STYLES.map((s) => (
            <button key={s.id} type="button" role="radio" className="style-card" aria-checked={style?.id === s.id} onClick={() => applyStyle(editor, s.id, me.name)}>
              <span className="style-card__name">
                {s.label} <span className="style-card__edition">{s.edition}</span>
                {style?.id === s.id && <Check size={14} strokeWidth={2.5} />}
              </span>
              {style?.id === s.id && <span className="style-card__summary">{s.summary}</span>}
            </button>
          ))}
        </div>

        {style && (
          <>
            <button type="button" className="styles-panel__toggle" aria-expanded={setupOpen} onClick={() => setSetupOpen(!setupOpen)}>
              <NewIcon size={16} strokeWidth={1.75} /> Set up the first page
            </button>
            {setupOpen && (
              <form
                className="styles-panel__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  insertFrontMatter(editor, style.id, front);
                  setSetupOpen(false);
                }}
              >
                {style.fields.map((f) => (
                  <label key={f} className="field">
                    <span className="field-label">{FIELD_LABELS[f]}</span>
                    <input
                      className="input input--sm"
                      type={f === 'date' ? 'date' : 'text'}
                      value={front[f]}
                      onChange={(e) => setFront((v) => ({ ...v, [f]: e.target.value }))}
                    />
                  </label>
                ))}
                <button type="submit" className="elum-btn elum-btn--primary elum-btn--sm">
                  Add to the top
                </button>
              </form>
            )}

            <span className="page-settings__label">Header</span>
            <label className="switch-row">
              <span>Page numbers</span>
              <input type="checkbox" role="switch" className="switch" checked={settings.pageNumbers} onChange={(e) => updateSettings(editor, { pageNumbers: e.target.checked })} />
            </label>
            <label className="field">
              <span className="field-label">{style.header === 'surname' ? 'Your surname, before the page number' : 'Text before the page number'}</span>
              <input
                className="input input--sm"
                value={settings.header ?? ''}
                placeholder={style.header === 'surname' ? 'Rivera' : 'Optional'}
                onChange={(e) => updateSettings(editor, { header: e.target.value }, false)}
              />
            </label>
          </>
        )}

        <span className="page-settings__label">Sources</span>
        {settings.sources.length === 0 ? (
          <p className="side-panel__empty muted">
            Add the books, articles and web pages you use. Write formats them in {style ? style.label : 'MLA'}, builds your{' '}
            {style ? style.listTitle : 'Works Cited'}, and cites them in your text.
          </p>
        ) : (
          <ul className="source-list">
            {orderedSources(style?.id ?? 'mla', settings.sources).map((s) => {
              const n = settings.sources.indexOf(s) + 1;
              return (
                <li key={s.id} className="source-item">
                  <p className="source-item__entry">
                    {formatReference(style?.id ?? 'mla', s, n).map((r, k) => (r.italic ? <em key={k}>{r.text}</em> : <span key={k}>{r.text}</span>))}
                  </p>
                  <div className="source-item__actions">
                    <input
                      className="input input--sm source-item__page"
                      placeholder="Page"
                      aria-label={`Page for ${s.title}`}
                      value={pages[s.id] ?? ''}
                      onChange={(e) => setPages((p) => ({ ...p, [s.id]: e.target.value }))}
                    />
                    <button type="button" className="elum-btn elum-btn--secondary elum-btn--sm" onMouseDown={(e) => e.preventDefault()} onClick={() => citeSource(editor, s, pages[s.id])}>
                      <Quote size={14} strokeWidth={2} /> Cite
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Edit ${s.title}`}
                      onClick={() => {
                        setEditing(s);
                        setDialogOpen(true);
                      }}
                    >
                      <RenameIcon size={16} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${s.title}`}
                      onClick={() => updateSettings(editor, { sources: settings.sources.filter((x) => x.id !== s.id) })}
                    >
                      <DeleteIcon size={16} strokeWidth={1.75} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="elum-btn elum-btn--secondary elum-btn--sm styles-panel__add"
          onClick={() => {
            if (!style) applyStyle(editor, 'mla', me.name);
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={16} strokeWidth={2} /> Add a source
        </button>
        {settings.sources.length > 0 && <p className="muted page-settings__note">Your {style?.listTitle ?? 'list'} is built from these sources and updates on its own. Change an entry by editing its source.</p>}
      </div>
      <SourceDialog open={dialogOpen} initial={editing} style={style?.id ?? 'mla'} onClose={() => setDialogOpen(false)} onSave={saveSource} />
    </PanelShell>
  );
}
