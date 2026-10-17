/** Where the session token lives in the browser. Both API clients share it. */
const KEY = 'elum.session';

// Used when storage is blocked (some private modes): the session lasts until the tab closes.
let memory: string | null = null;

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY) ?? memory;
    } catch {
      return memory;
    }
  },
  set(token: string) {
    memory = token;
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // Kept in memory only.
    }
  },
  clear() {
    memory = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing stored.
    }
  },
};
