import type { SpellLanguage } from '../../api';

export type SpellRequest =
  | { type: 'init'; lang: SpellLanguage; words: string[] }
  | { type: 'check'; id: number; words: string[] }
  | { type: 'suggest'; id: number; word: string }
  | { type: 'personal'; words: string[] };

export type SpellResponse =
  | { type: 'ready'; lang: SpellLanguage }
  | { type: 'checked'; id: number; wrong: string[] }
  | { type: 'suggestions'; id: number; word: string; suggestions: string[] }
  | { type: 'personal-updated' }
  | { type: 'error'; id?: number; message: string };
