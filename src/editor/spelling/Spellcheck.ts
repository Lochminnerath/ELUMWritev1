import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { SpellChecker } from './checker';
import { findWords, type SpellWord } from './words';

export const spellKey = new PluginKey<DecorationSet>('spellcheck');

export interface SpellcheckOptions {
  checker: SpellChecker | null;
}

export interface SpellcheckStorage {
  enabled: boolean;
  /** The misspelled words in the document right now, in order. */
  issues: SpellWord[];
}

const TYPING_DELAY = 350;

declare module '@tiptap/core' {
  interface Storage {
    spellcheck: SpellcheckStorage;
  }
}

/**
 * Underlines misspelled words. The words come from `findWords`, the answers from
 * the spelling worker; the word being typed is left alone until it is finished.
 */
export const Spellcheck = Extension.create<SpellcheckOptions, SpellcheckStorage>({
  name: 'spellcheck',

  addOptions() {
    return { checker: null };
  },

  addStorage() {
    return { enabled: false, issues: [] };
  },

  addProseMirrorPlugins() {
    const checker = this.options.checker;
    const storage = this.storage;
    if (!checker) return [];

    let cachedDoc: PMNode | null = null;
    let cachedWords: SpellWord[] = [];
    const wordsOf = (doc: PMNode) => {
      if (doc !== cachedDoc) {
        cachedDoc = doc;
        cachedWords = findWords(doc);
      }
      return cachedWords;
    };

    const build = (state: EditorState): DecorationSet => {
      if (!storage.enabled) {
        storage.issues = [];
        return DecorationSet.empty;
      }
      const { empty, head } = state.selection;
      const issues = wordsOf(state.doc).filter((w) => checker.status(w.word) === 'wrong' && !(empty && head === w.to));
      storage.issues = issues;
      return DecorationSet.create(
        state.doc,
        issues.map((w) => Decoration.inline(w.from, w.to, { class: 'spell-error', 'data-spell-word': w.word }, { spell: true })),
      );
    };

    return [
      new Plugin<DecorationSet>({
        key: spellKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => (tr.getMeta(spellKey) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc),
        },
        props: {
          decorations: (state) => spellKey.getState(state),
        },
        view: (view) => {
          let timer: number | undefined;
          let destroyed = false;
          const redraw = () => {
            if (destroyed) return;
            view.dispatch(view.state.tr.setMeta(spellKey, build(view.state)).setMeta('addToHistory', false));
          };
          const run = async () => {
            if (destroyed) return;
            if (storage.enabled && checker.ready) {
              const words = wordsOf(view.state.doc).map((w) => w.word);
              await checker.check(words);
            }
            redraw();
          };
          const schedule = (delay: number) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => void run(), delay);
          };
          const unsubscribe = checker.subscribe(() => schedule(0));
          schedule(0);
          return {
            update: (v, prev) => {
              if (!v.state.doc.eq(prev.doc)) schedule(TYPING_DELAY);
              else if (!v.state.selection.eq(prev.selection) && storage.enabled) {
                // Moving away from a word just typed reveals whether it is spelled right.
                const before = prev.selection.head;
                if (wordsOf(v.state.doc).some((w) => w.to === before)) schedule(0);
              }
            },
            destroy: () => {
              destroyed = true;
              window.clearTimeout(timer);
              unsubscribe();
            },
          };
        },
      }),
    ];
  },
});
