import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  BookOpenCheck,
  CalendarDays,
  FileStack,
  GraduationCap,
  Check,
  ImagePlus,
  Keyboard,
  Link2,
  ListTodo,
  MessageSquarePlus,
  Minus,
  PanelLeft,
  SlidersHorizontal,
  SpellCheck2,
  TextQuote,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SpellLanguage } from '../api';
import { countDocument } from './exporters';
import { ZOOMS } from './format';
import type { PageMode } from './pageMode';
import { replaceWord, type Spelling } from './spelling/useSpelling';

export type PanelId = 'outline' | 'insert' | 'styles' | 'spelling' | 'page';

export const PANELS: { id: PanelId; label: string; icon: LucideIcon; editOnly?: boolean }[] = [
  { id: 'outline', label: 'Outline', icon: PanelLeft },
  { id: 'insert', label: 'Insert', icon: ImagePlus, editOnly: true },
  { id: 'styles', label: 'Styles and citations', icon: GraduationCap, editOnly: true },
  { id: 'spelling', label: 'Spelling', icon: SpellCheck2, editOnly: true },
  { id: 'page', label: 'Page and view', icon: SlidersHorizontal },
];

const ICON = { size: 18, strokeWidth: 1.75 };

/** The slim column of tools down the left of a document. */
export function Rail({
  active,
  onSelect,
  editable,
  spellingCount,
  onShortcuts,
}: {
  active: PanelId | null;
  onSelect: (id: PanelId | null) => void;
  editable: boolean;
  spellingCount: number;
  onShortcuts: () => void;
}) {
  return (
    <nav className="rail" aria-label="Document tools">
      {PANELS.filter((p) => editable || !p.editOnly).map((p) => (
        <button
          key={p.id}
          type="button"
          className="rail__btn"
          aria-label={p.label}
          aria-pressed={active === p.id}
          data-tip={p.label}
          data-tip-placement="right"
          onClick={() => onSelect(active === p.id ? null : p.id)}
        >
          <p.icon {...ICON} />
          {p.id === 'spelling' && spellingCount > 0 && <span className="rail__badge">{spellingCount > 99 ? '99+' : spellingCount}</span>}
        </button>
      ))}
      <span className="rail__spacer" />
      <button type="button" className="rail__btn" aria-label="Keyboard shortcuts" data-tip="Keyboard shortcuts" data-tip-placement="right" onClick={onShortcuts}>
        <Keyboard {...ICON} />
      </button>
    </nav>
  );
}

export function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="side-panel" aria-label={title}>
      <header className="side-panel__head">
        <h2 className="side-panel__title">{title}</h2>
        <button type="button" className="icon-btn icon-btn--round" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <X size={16} strokeWidth={1.75} />
        </button>
      </header>
      <div className="side-panel__body">{children}</div>
    </aside>
  );
}

// ------------------------------------------------------------------ outline

interface Heading {
  level: number;
  text: string;
  pos: number;
}

export function OutlinePanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const list: Heading[] = [];
      e.state.doc.forEach((node, pos) => {
        if (node.type.name === 'heading' && node.textContent.trim()) list.push({ level: node.attrs.level as number, text: node.textContent, pos });
      });
      return list;
    },
    equalityFn: (a, b) => !!a && !!b && a.length === b.length && a.every((h, i) => h.text === b[i].text && h.level === b[i].level && h.pos === b[i].pos),
  });
  const cursor = useEditorState({ editor, selector: ({ editor: e }) => e.state.selection.from });
  const current = [...headings].reverse().find((h) => h.pos <= cursor);

  return (
    <PanelShell title="Outline" onClose={onClose}>
      {headings.length === 0 ? (
        <p className="side-panel__empty muted">Headings you add appear here, so you can jump between sections.</p>
      ) : (
        <ol className="outline">
          {headings.map((h) => (
            <li key={h.pos}>
              <button
                type="button"
                className="outline__item"
                data-level={h.level}
                aria-current={current?.pos === h.pos ? 'location' : undefined}
                onClick={() => {
                  editor.chain().focus().setTextSelection(h.pos + 1).run();
                  editor.view.domAtPos(h.pos + 1).node.parentElement?.closest('h1,h2,h3,h4')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
              >
                {h.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </PanelShell>
  );
}

// ------------------------------------------------------------------- insert

export function InsertPanel({
  editor,
  onClose,
  onImage,
  onLink,
  onComment,
}: {
  editor: Editor;
  onClose: () => void;
  onImage: () => void;
  onLink: () => void;
  onComment: () => void;
}) {
  const run = () => editor.chain().focus();
  const items: { label: string; hint: string; icon: LucideIcon; onClick: () => void }[] = [
    { label: 'Image', hint: 'From your computer', icon: ImagePlus, onClick: onImage },
    { label: 'Link', hint: 'To a web page', icon: Link2, onClick: onLink },
    { label: 'Comment', hint: 'On the selected text', icon: MessageSquarePlus, onClick: onComment },
    { label: 'Checklist', hint: 'Tick things off', icon: ListTodo, onClick: () => run().toggleTaskList().run() },
    { label: 'Quote', hint: 'Set text apart', icon: TextQuote, onClick: () => run().toggleBlockquote().run() },
    { label: 'Line', hint: 'Divide sections', icon: Minus, onClick: () => run().setHorizontalRule().run() },
    { label: 'Page break', hint: 'Start a new page', icon: FileStack, onClick: () => run().setPageBreak().run() },
    {
      label: "Today's date",
      hint: new Date().toLocaleDateString(undefined, { dateStyle: 'medium' }),
      icon: CalendarDays,
      onClick: () => run().insertContent(new Date().toLocaleDateString(undefined, { dateStyle: 'long' })).run(),
    },
  ];
  return (
    <PanelShell title="Insert" onClose={onClose}>
      <div className="insert-grid">
        {items.map((it) => (
          <button key={it.label} type="button" className="insert-tile" onMouseDown={(e) => e.preventDefault()} onClick={it.onClick}>
            <it.icon size={20} strokeWidth={1.75} />
            <span className="insert-tile__label">{it.label}</span>
            <span className="insert-tile__hint">{it.hint}</span>
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

// ----------------------------------------------------------------- spelling

const LANGUAGES: { value: SpellLanguage; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
];

export function SpellingPanel({ editor, spelling, onClose }: { editor: Editor; spelling: Spelling; onClose: () => void }) {
  const issues = useEditorState({
    editor,
    selector: ({ editor: e }) => e.storage.spellcheck.issues,
    equalityFn: (a, b) => a === b,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [showWords, setShowWords] = useState(false);

  // Unique words, in the order they first appear.
  const groups = new Map<string, { word: string; count: number; first: { from: number; to: number } }>();
  for (const w of issues) {
    const g = groups.get(w.word);
    if (g) g.count++;
    else groups.set(w.word, { word: w.word, count: 1, first: w });
  }
  const list = [...groups.values()];

  useEffect(() => {
    if (!open || suggestions[open]) return;
    let live = true;
    spelling.suggest(open).then((s) => live && setSuggestions((all) => ({ ...all, [open]: s })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const focusWord = (word: string) => {
    const hit = editor.storage.spellcheck.issues.find((w) => w.word === word);
    if (!hit) return;
    editor.chain().focus().setTextSelection({ from: hit.from, to: hit.to }).scrollIntoView().run();
  };

  return (
    <PanelShell title="Spelling" onClose={onClose}>
      <div className="spell-settings">
        <label className="switch-row">
          <span>Check spelling</span>
          <input type="checkbox" role="switch" className="switch" checked={spelling.on} onChange={(e) => spelling.setOn(e.target.checked)} />
        </label>
        <label className="switch-row">
          <span>Dictionary</span>
          <select className="select select--sm" value={spelling.language} onChange={(e) => spelling.setLanguage(e.target.value as SpellLanguage)}>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {spelling.on &&
        (list.length === 0 ? (
          <p className="side-panel__empty muted">
            <BookOpenCheck size={18} strokeWidth={1.75} /> No spelling mistakes found.
          </p>
        ) : (
          <ul className="spell-list" aria-label="Spelling mistakes">
            {list.map((g) => (
              <li key={g.word} className="spell-item" data-open={open === g.word || undefined}>
                <button
                  type="button"
                  className="spell-item__word"
                  aria-expanded={open === g.word}
                  onClick={() => {
                    setOpen(open === g.word ? null : g.word);
                    focusWord(g.word);
                  }}
                >
                  <span className="spell-item__text">{g.word}</span>
                  {g.count > 1 && <span className="spell-item__count">{g.count}</span>}
                </button>
                {open === g.word && (
                  <div className="spell-item__body">
                    {!suggestions[g.word] ? (
                      <p className="muted spell-item__note">Finding suggestions</p>
                    ) : suggestions[g.word].length ? (
                      <div className="spell-menu__suggestions">
                        {suggestions[g.word].map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="spell-chip"
                            onClick={() => {
                              const hit = editor.storage.spellcheck.issues.find((w) => w.word === g.word);
                              if (hit) replaceWord(editor, hit.from, hit.to, s);
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="muted spell-item__note">No suggestions</p>
                    )}
                    <div className="spell-item__actions">
                      <button type="button" className="elum-btn elum-btn--quiet elum-btn--sm" onClick={() => spelling.addWord(g.word)}>
                        Add to dictionary
                      </button>
                      <button type="button" className="elum-btn elum-btn--quiet elum-btn--sm" onClick={() => spelling.ignore(g.word)}>
                        Ignore
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}

      <section className="spell-dictionary">
        <button type="button" className="spell-dictionary__toggle" aria-expanded={showWords} onClick={() => setShowWords(!showWords)}>
          Your dictionary <span className="muted">{spelling.dictionary.length}</span>
        </button>
        {showWords &&
          (spelling.dictionary.length ? (
            <ul className="spell-dictionary__words">
              {spelling.dictionary.map((w) => (
                <li key={w}>
                  <span>{w}</span>
                  <button type="button" className="icon-btn" aria-label={`Remove ${w}`} onClick={() => spelling.removeWord(w)}>
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted spell-item__note">Words you add are saved to your account and work on every device.</p>
          ))}
      </section>
    </PanelShell>
  );
}

// --------------------------------------------------------------------- page

export function PagePanel({
  editor,
  onClose,
  zoom,
  setZoom,
  pageMode,
  setPageMode,
  commentsOpen,
  canComment,
  toggleComments,
}: {
  editor: Editor;
  onClose: () => void;
  zoom: number;
  setZoom: (z: number) => void;
  pageMode: PageMode;
  setPageMode: (m: PageMode) => void;
  commentsOpen: boolean;
  canComment: boolean;
  toggleComments: () => void;
}) {
  const counts = useEditorState({ editor, selector: ({ editor: e }) => countDocument(e) });
  const fmt = (n: number) => n.toLocaleString();
  return (
    <PanelShell title="Page and view" onClose={onClose}>
      <div className="page-settings">
        <span className="page-settings__label">Zoom</span>
        <div className="chip-row" role="group" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button key={z} type="button" className="chip" aria-pressed={zoom === z} onClick={() => setZoom(z)}>
              {z}%
            </button>
          ))}
        </div>
        <span className="page-settings__label">Page</span>
        <div className="chip-row" role="group" aria-label="Page colour">
          <button type="button" className="chip" aria-pressed={pageMode === 'theme'} onClick={() => setPageMode('theme')}>
            Match light or dark
          </button>
          <button type="button" className="chip" aria-pressed={pageMode === 'paper'} onClick={() => setPageMode('paper')}>
            White paper
          </button>
        </div>
        {canComment && (
          <label className="switch-row">
            <span>Show comments</span>
            <input type="checkbox" role="switch" className="switch" checked={commentsOpen} onChange={toggleComments} />
          </label>
        )}
        <span className="page-settings__label">{counts.selection ? 'Selected text' : 'This document'}</span>
        <dl className="counts counts--compact">
          <div>
            <dt>Words</dt>
            <dd className="mono">{fmt(counts.counts.words)}</dd>
          </div>
          <div>
            <dt>Characters</dt>
            <dd className="mono">{fmt(counts.counts.characters)}</dd>
          </div>
          <div>
            <dt>Without spaces</dt>
            <dd className="mono">{fmt(counts.counts.charactersNoSpaces)}</dd>
          </div>
          <div>
            <dt>Paragraphs</dt>
            <dd className="mono">{fmt(counts.counts.paragraphs)}</dd>
          </div>
        </dl>
        <p className="muted page-settings__note">
          <Check size={14} strokeWidth={2} /> Zoom and page colour are remembered on this device.
        </p>
      </div>
    </PanelShell>
  );
}
