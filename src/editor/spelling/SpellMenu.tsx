import type { Editor } from '@tiptap/core';
import { BookPlus, EyeOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPosition, useOutsidePress } from '../../components/Popover';
import { replaceWord, type Spelling } from './useSpelling';

interface Target {
  word: string;
  from: number;
  to: number;
}

/** Suggestions for a misspelled word, opened by right-clicking it (or a long press). */
export function SpellMenu({ editor, spelling }: { editor: Editor; spelling: Spelling }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setTarget(null), []);

  useEffect(() => {
    const dom = editor.view.dom;
    const onContext = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('.spell-error');
      if (!el) return;
      const start = editor.view.posAtDOM(el, 0);
      const issue = editor.storage.spellcheck.issues.find((w) => start >= w.from && start < w.to);
      if (!issue) return;
      e.preventDefault();
      editor.chain().setTextSelection({ from: issue.from, to: issue.to }).run();
      setTarget(issue);
    };
    dom.addEventListener('contextmenu', onContext);
    return () => dom.removeEventListener('contextmenu', onContext);
  }, [editor]);

  useEffect(() => {
    if (!target) return;
    let live = true;
    setSuggestions(null);
    spelling.suggest(target.word).then((s) => live && setSuggestions(s));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onChange = () => close();
    window.addEventListener('keydown', onKey);
    editor.on('update', onChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      editor.off('update', onChange);
    };
  }, [target, editor, close]);

  const anchor = useCallback(() => {
    if (!target) return null;
    try {
      const a = editor.view.coordsAtPos(target.from);
      const b = editor.view.coordsAtPos(target.to);
      return new DOMRect(a.left, a.top, Math.max(1, b.right - a.left), a.bottom - a.top);
    } catch {
      return null;
    }
  }, [editor, target]);
  const style = useFloatingPosition(!!target, anchor, panel, 'bottom-start');
  useOutsidePress(!!target, () => [panel.current], close);

  if (!target) return null;
  const choose = (text: string) => {
    replaceWord(editor, target.from, target.to, text);
    close();
  };

  return createPortal(
    <div ref={panel} className="spell-menu" role="menu" aria-label={`Spelling: ${target.word}`} style={style}>
      <div className="spell-menu__word">{target.word}</div>
      {suggestions === null ? (
        <p className="spell-menu__note muted">Finding suggestions</p>
      ) : suggestions.length ? (
        <div className="spell-menu__suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" role="menuitem" className="spell-chip" onClick={() => choose(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : (
        <p className="spell-menu__note muted">No suggestions</p>
      )}
      <div className="spell-menu__actions">
        <button
          type="button"
          role="menuitem"
          className="menu__item"
          onClick={() => {
            spelling.addWord(target.word);
            close();
          }}
        >
          <BookPlus size={16} strokeWidth={1.75} /> Add to your dictionary
        </button>
        <button
          type="button"
          role="menuitem"
          className="menu__item"
          onClick={() => {
            spelling.ignore(target.word);
            close();
          }}
        >
          <EyeOff size={16} strokeWidth={1.75} /> Ignore for now
        </button>
      </div>
    </div>,
    document.body,
  );
}
