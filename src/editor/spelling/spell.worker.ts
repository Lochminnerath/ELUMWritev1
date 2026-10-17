/// <reference lib="webworker" />
// Spell checking off the main thread, with Hunspell dictionaries (nspell).
import NSpell from 'nspell';
import gbAff from '@dictionaries/en-GB/index.aff?url';
import gbDic from '@dictionaries/en-GB/index.dic?url';
import usAff from '@dictionaries/en-US/index.aff?url';
import usDic from '@dictionaries/en-US/index.dic?url';
import type { SpellRequest, SpellResponse } from './protocol';
import { rankSuggestions } from './rank';

const FILES = { 'en-US': [usAff, usDic], 'en-GB': [gbAff, gbDic] } as const;

// Everyday words of writing on screen that the dictionaries lack.
const EXTRA_WORDS = ['strikethrough', 'commenter', 'commenters', 'checklist', 'checklists', 'autosave', 'hashtag', 'emoji', 'emojis', 'inbox', 'signup', 'login', 'logout', 'username', 'dropdown', 'screenshot', 'screenshots', 'webpage', 'website', 'websites', 'online', 'offline', 'email', 'emails', 'emailed'];

let speller: NSpell | null = null;
let ready: Promise<void> | null = null;
let personal = new Set<string>();

const post = (message: SpellResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);

async function load(lang: keyof typeof FILES, words: string[]) {
  const [aff, dic] = await Promise.all(FILES[lang].map((url) => fetch(url).then((r) => r.text())));
  speller = new NSpell(aff, dic);
  EXTRA_WORDS.forEach((w) => speller!.add(w));
  personal = new Set();
  words.forEach((w) => addWord(w));
}

function addWord(word: string) {
  if (!speller || personal.has(word)) return;
  personal.add(word);
  speller.add(word);
}

self.onmessage = async (event: MessageEvent<SpellRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      ready = load(msg.lang, msg.words);
      await ready;
      post({ type: 'ready', lang: msg.lang });
      return;
    }
    await ready;
    if (!speller) throw new Error('The dictionary is not loaded.');
    if (msg.type === 'check') {
      const s = speller;
      post({ type: 'checked', id: msg.id, wrong: msg.words.filter((w) => !s.correct(w)) });
    } else if (msg.type === 'suggest') {
      post({ type: 'suggestions', id: msg.id, word: msg.word, suggestions: rankSuggestions(msg.word, speller.suggest(msg.word)) });
    } else if (msg.type === 'personal') {
      // Replace the personal list: remove words that went, add new ones.
      const next = new Set(msg.words);
      personal.forEach((w) => {
        if (!next.has(w)) {
          speller!.remove(w);
          personal.delete(w);
        }
      });
      msg.words.forEach((w) => addWord(w));
      post({ type: 'personal-updated' });
    }
  } catch (e) {
    post({ type: 'error', id: 'id' in msg ? msg.id : undefined, message: e instanceof Error ? e.message : String(e) });
  }
};
