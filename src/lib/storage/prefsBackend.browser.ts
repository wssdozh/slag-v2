/**
 * Browser settings: `localStorage`, the same keys and the same strings that were there before.
 *
 * This file is the browser build and the Playwright e2e run, and nothing else. A native build never
 * imports it — `prefs.ts` picks a backend at init — which is why the one allowed `localStorage.` in
 * `src/` lives here and why `scripts/no-localstorage.test.mjs` keeps the rest of the tree clean.
 *
 * There is no snapshot to load: the profile is the live store here, so a key is read when it is
 * asked for (`read`) and the whole profile is listed when the storage panel or a one-off legacy
 * scan asks (`entries`). That keeps a seed written by the e2e run, or by another tab, visible
 * without a second copy of the settings in memory.
 */
import type { PrefsBackend } from './prefs';

export const prefsBackend: PrefsBackend = {
  async load() {
    return {};
  },

  async save(changes) {
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  },

  read(key) {
    return localStorage.getItem(key);
  },

  entries() {
    const pairs: [string, string][] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key === null) continue;
      const value = localStorage.getItem(key);
      if (value !== null) pairs.push([key, value]);
    }
    return pairs;
  },
};
