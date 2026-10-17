import type { SpellLanguage } from '../../api';
import type { SpellRequest, SpellResponse } from './protocol';

type Listener = () => void;

/**
 * Talks to the spelling worker and remembers answers, so each distinct word is
 * checked once. The editor asks `status(word)` synchronously while drawing.
 */
export class SpellChecker {
  private worker: Worker | null = null;
  private lang: SpellLanguage | null = null;
  private personal = new Set<string>();
  private ignored = new Set<string>();
  /** true = spelled right, false = wrong. Missing = not asked yet. */
  private results = new Map<string, boolean>();
  private pending = new Set<string>();
  private nextId = 1;
  private waiting = new Map<number, (r: SpellResponse) => void>();
  private listeners = new Set<Listener>();
  ready = false;

  private send(message: SpellRequest) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./spell.worker.ts', import.meta.url), { type: 'module', name: 'elum-spelling' });
      this.worker.onmessage = (e: MessageEvent<SpellResponse>) => this.receive(e.data);
    }
    this.worker.postMessage(message);
  }

  private receive(msg: SpellResponse) {
    if (msg.type === 'ready') {
      if (msg.lang !== this.lang) return;
      this.ready = true;
      this.emit();
    } else if ((msg.type === 'checked' || msg.type === 'suggestions' || msg.type === 'error') && msg.id !== undefined) {
      this.waiting.get(msg.id)?.(msg);
      this.waiting.delete(msg.id);
    }
  }

  private request(message: SpellRequest & { id: number }): Promise<SpellResponse> {
    return new Promise((resolve) => {
      this.waiting.set(message.id, resolve);
      this.send(message);
    });
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Loads a dictionary. Does nothing if it is already the one in use. */
  setLanguage(lang: SpellLanguage) {
    if (lang === this.lang) return;
    this.lang = lang;
    this.ready = false;
    this.results.clear();
    this.pending.clear();
    this.send({ type: 'init', lang, words: [...this.personal] });
    this.emit();
  }

  setPersonal(words: string[]) {
    const next = new Set(words);
    if (next.size === this.personal.size && words.every((w) => this.personal.has(w))) return;
    this.personal = next;
    // Words that left the dictionary need checking again.
    this.results.forEach((ok, w) => ok && !next.has(w) && this.results.delete(w));
    if (this.lang) this.send({ type: 'personal', words });
    this.emit();
  }

  /** Hides a word for the rest of this visit. */
  ignore(word: string) {
    this.ignored.add(word);
    this.emit();
  }

  /** 'ok', 'wrong', or 'unknown' when the worker has not answered yet. */
  status(word: string): 'ok' | 'wrong' | 'unknown' {
    if (this.personal.has(word) || this.personal.has(word.toLowerCase()) || this.ignored.has(word)) return 'ok';
    const r = this.results.get(word);
    return r === undefined ? 'unknown' : r ? 'ok' : 'wrong';
  }

  /** Checks words not seen before; resolves true if any answer arrived. */
  async check(words: Iterable<string>): Promise<boolean> {
    if (!this.lang) return false;
    const fresh = [...new Set(words)].filter((w) => !this.results.has(w) && !this.pending.has(w));
    if (!fresh.length) return false;
    const lang = this.lang;
    fresh.forEach((w) => this.pending.add(w));
    const msg = await this.request({ type: 'check', id: this.nextId++, words: fresh });
    fresh.forEach((w) => this.pending.delete(w));
    if (msg.type !== 'checked' || lang !== this.lang) return false;
    const wrong = new Set(msg.wrong);
    fresh.forEach((w) => this.results.set(w, !wrong.has(w)));
    return true;
  }

  async suggest(word: string): Promise<string[]> {
    const msg = await this.request({ type: 'suggest', id: this.nextId++, word });
    return msg.type === 'suggestions' ? msg.suggestions : [];
  }

  /** Asks the editor to redraw, for example after spell check is turned on or off. */
  refresh() {
    this.emit();
  }

  /** Stops the worker. Using the checker again starts a new one. */
  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.lang = null;
    this.ready = false;
    this.results.clear();
    this.pending.clear();
    this.waiting.forEach((resolve) => resolve({ type: 'error', message: 'Spell check stopped.' }));
    this.waiting.clear();
  }
}
