// The ratchet for the `localStorage` exit: the native build must not touch it at all, and a browser
// build reaches it through exactly one backend. Every file still on the baseline below is a wave
// that has not landed yet; anything not on it and not allowed is a new dependency on the webview
// profile, and that is what this test refuses.
//
// The baseline only shrinks. Each wave moves its file to the prefs API and strikes its line; a line
// that no longer matches is stale, and the second test reports it instead of letting the list rot.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/**
 * Who may reach `localStorage`, and why. All three are browser-only paths, each for a reason:
 * the backend `prefs.ts` picks when there is no Tauri, the items index falls back to it on a web
 * build that has no disk, and the headless runtime installs its own shim.
 */
const ALLOWLIST = new Set([
  'src/lib/storage/prefsBackend.browser.ts',
  'src/lib/storage/index.ts',
  'src/node/env.ts',
]);

/**
 * What the migration has not converted yet, one line per wave: the file is struck from the list
 * when its last `localStorage` use goes. Never add here — new code reads `getPref` from `prefs.ts`.
 */
const BASELINE = [
  'src/components/Feed/composer/useComposerDraft.ts',
  'src/components/Logs/LogViewer.tsx',
  'src/lib/logger/logger.ts',
  'src/lib/platform/encryptedLocalStore.ts',
  'src/lib/platform/secretStore.ts',
  'src/lib/storage/readJson.ts',
  'src/lib/storage/settingsStore.ts',
  'src/lib/storage/usage.ts',
  'src/lib/sync/applyBundle.ts',
  'src/lib/sync/localBookkeeping.ts',
  'src/lib/sync/outbox/outbox.ts',
  'src/lib/sync/pushBundle.ts',
  'src/lib/sync/syncConfig.ts',
  'src/lib/sync/syncEngine.ts',
];

/**
 * Prose about the exit is everywhere — docblocks explain what used to live there. Only code counts,
 * so comments go before the match does. `//` in a url or a scheme survives, which is the one
 * heuristic this needs.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/** `localStorage.getItem`, `localStorage[key]`, `Object.keys(localStorage)` — all the same sin. */
const USES_LOCAL_STORAGE = /\blocalStorage\b/;

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else files.push(relative(ROOT, path).split(sep).join('/'));
  }
  return files;
}

function read(file) {
  return stripComments(readFileSync(join(ROOT, file), 'utf8'));
}

const files = sourceFiles(SRC);
const referencing = files.filter((file) => USES_LOCAL_STORAGE.test(read(file)));

test('localStorage: nothing outside the browser backend and the baseline', () => {
  const offenders = referencing.filter((file) => !ALLOWLIST.has(file) && !BASELINE.includes(file));
  assert.deepEqual(
    offenders,
    [],
    'use getPref/setPref from src/lib/storage/prefs.ts — localStorage is a browser-only backend now',
  );
});

test('localStorage: the baseline is sorted, and every line still earns its place', () => {
  assert.deepEqual(BASELINE, [...BASELINE].sort(), 'the baseline is sorted by path');
  const stale = BASELINE.filter((file) => !referencing.includes(file));
  assert.deepEqual(stale, [], 'these files no longer touch localStorage: strike them from the baseline');
});

test('localStorage: the browser backend is imported from prefs.ts only', () => {
  const importers = files
    .filter((file) => !ALLOWLIST.has(file))
    .filter((file) => /prefsBackend\.browser/.test(read(file)));
  assert.deepEqual(
    importers,
    ['src/lib/storage/prefs.ts'],
    "only prefs.ts picks the backend; every other import drags localStorage into both builds",
  );
});
