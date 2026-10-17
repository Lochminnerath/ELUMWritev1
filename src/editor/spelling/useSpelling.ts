import type { Editor } from '@tiptap/core';
import { useEffect, useState } from 'react';
import { MAX_DICTIONARY_WORDS } from '../../api';
import { usePreferences } from '../../preferences/PreferencesProvider';
import { SpellChecker } from './checker';

/** One spell checker for the editor's lifetime. */
export function useSpellChecker(): SpellChecker {
  const [checker] = useState(() => new SpellChecker());
  useEffect(() => () => checker.destroy(), [checker]);
  return checker;
}

/** Keeps the checker in step with the account's spelling settings and dictionary. */
export function useSpelling(editor: Editor | null, checker: SpellChecker, editable: boolean) {
  const { preferences, update } = usePreferences();
  const on = editable && preferences.spellcheck;

  useEffect(() => {
    if (!editor) return;
    editor.storage.spellcheck.enabled = on;
    checker.setPersonal(preferences.dictionary);
    if (on) checker.setLanguage(preferences.spellLanguage);
    checker.refresh();
  }, [editor, checker, on, preferences.spellLanguage, preferences.dictionary]);

  return {
    on,
    language: preferences.spellLanguage,
    dictionary: preferences.dictionary,
    setOn: (spellcheck: boolean) => update({ spellcheck }),
    setLanguage: (spellLanguage: typeof preferences.spellLanguage) => update({ spellLanguage }),
    addWord: (word: string) => update((p) => ({ dictionary: [word, ...p.dictionary.filter((w) => w !== word)].slice(0, MAX_DICTIONARY_WORDS) })),
    removeWord: (word: string) => update((p) => ({ dictionary: p.dictionary.filter((w) => w !== word) })),
    ignore: (word: string) => checker.ignore(word),
    suggest: (word: string) => checker.suggest(word),
  };
}

export type Spelling = ReturnType<typeof useSpelling>;

/** Replaces a misspelled word, keeping its formatting. */
export function replaceWord(editor: Editor, from: number, to: number, text: string) {
  editor.chain().focus().command(({ tr }) => {
    tr.insertText(text, from, to);
    return true;
  }).run();
}
