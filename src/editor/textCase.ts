export type TextCase = 'lower' | 'upper' | 'title' | 'sentence';

export const TEXT_CASES: { value: TextCase; label: string }[] = [
  { value: 'sentence', label: 'Sentence case' },
  { value: 'lower', label: 'lowercase' },
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'title', label: 'Title Case' },
];

const LETTER = /\p{L}/u;
const WORD_BREAK = /[\s\-–—/([{“"‘«]/u;
const SENTENCE_END = /[.!?]/;

/** State carried from one piece of text to the next within a paragraph. */
export interface CaseState {
  wordStart: boolean;
  sentenceStart: boolean;
  /** A full stop was seen; the next whitespace starts a sentence. */
  pendingSentence: boolean;
}

/** The state at a point in a paragraph, given the text before it. */
export function caseStateAfter(before: string): CaseState {
  const state: CaseState = { wordStart: true, sentenceStart: true, pendingSentence: false };
  for (const ch of before) step(state, ch);
  return state;
}

function step(state: CaseState, ch: string) {
  if (LETTER.test(ch) || /\d/.test(ch)) {
    state.wordStart = false;
    state.sentenceStart = false;
    state.pendingSentence = false;
  } else if (SENTENCE_END.test(ch)) {
    state.pendingSentence = true;
    state.wordStart = true;
  } else if (/\s/.test(ch)) {
    state.wordStart = true;
    if (state.pendingSentence) state.sentenceStart = true;
  } else if (WORD_BREAK.test(ch)) {
    state.wordStart = true;
  }
}

/**
 * Changes the case of `text`, continuing from `state`. The result always has
 * the same length as the input, so document positions stay valid; letters
 * whose case form has another length (like ß) are left as they are.
 */
export function changeCase(text: string, mode: TextCase, state: CaseState = caseStateAfter('')): string {
  let out = '';
  for (const ch of text) {
    let next: string;
    switch (mode) {
      case 'upper':
        next = ch.toUpperCase();
        break;
      case 'lower':
        next = ch.toLowerCase();
        break;
      case 'title':
        next = state.wordStart ? ch.toUpperCase() : ch.toLowerCase();
        break;
      case 'sentence':
        next = state.sentenceStart && LETTER.test(ch) ? ch.toUpperCase() : ch.toLowerCase();
        break;
    }
    out += next.length === ch.length ? next : ch;
    step(state, ch);
  }
  return out;
}

/** Shift+F3 order, as in word processors: lowercase → UPPERCASE → Title Case → lowercase. */
export function nextCase(text: string): TextCase {
  if (text === changeCase(text, 'upper') && text !== changeCase(text, 'lower')) return 'title';
  if (text === changeCase(text, 'title') && text !== changeCase(text, 'lower')) return 'lower';
  return 'upper';
}
