/**
 * Browser settings: `localStorage`, the same keys and the same strings that were there before.
 *
 * This file is the browser build and the Playwright e2e run, and nothing else. A native build never
 * imports it — `prefs.ts` picks a backend at init — which is why the one allowed `localStorage.` in
 * `src/` lives here and why `scripts/no-localstorage.test.mjs` keeps the rest of the tree clean.
 */
import type { PrefsBackend } from './prefs';

export const prefsBackend: PrefsBackend = {
  async load() {
    const snapshot: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === null) continue;
      const value = localStorage.getItem(key);
      if (value !== null) snapshot[key] = value;
    }
    return snapshot;
  },

  async save(changes) {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  },
};
