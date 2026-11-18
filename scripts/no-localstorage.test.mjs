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

/** The one file allowed to reach `localStorage`: the browser build's backend, and nothing else. */
const ALLOWLIST = new Set(['src/lib/storage/prefsBackend.browser.ts']);

/**
 * What the migration has not converted yet, one line per wave: the file is struck from the list
 * when its last `localStorage.` goes. Never add here — new code reads `getPref` from `prefs.ts`.
 */
const BASELINE = [
  'src/components/Feed/Composer.tsx',
  'src/components/Feed/FeedColumnResizer.tsx',
  'src/components/Feed/composer/useComposerDraft.ts',
  'src/components/Settings/AiPromptModal.tsx',
  'src/components/Views/useCalendarInteractions.ts',
  'src/components/Workspace/useDockPanels.ts',
  'src/context/AppContext.tsx',
  'src/context/hooks/useAppUpdates.ts',
  'src/context/hooks/useAppearance.ts',
  'src/context/hooks/useMobileNav.ts',
  'src/lib/ai/connections/settings.ts',
  'src/lib/backupService.ts',
  'src/lib/logger/logger.ts',
  'src/lib/notify/assistant.ts',
  'src/lib/platform/encryptedLocalStore.ts',
  'src/lib/platform/secretStore.ts',
  'src/lib/platform/updateChannel.ts',
  'src/lib/platform/windowControls.ts',
  'src/lib/storage/folderStore.ts',
  'src/lib/storage/index.ts',
  'src/lib/storage/readJson.ts',
  'src/lib/storage/settingsStore.ts',
  'src/lib/storage/usage.ts',
  'src/lib/storage/vaultFiles.ts',
  'src/lib/storage/vaultRegistry.ts',
  'src/lib/storage/vaultTransfer.ts',
  'src/lib/sync/applyBundle.ts',
  'src/lib/sync/localBookkeeping.ts',
  'src/lib/sync/outbox/outbox.ts',
  'src/lib/sync/pushBundle.ts',
  'src/lib/sync/syncConfig.ts',
  'src/lib/sync/syncEngine.ts',
];

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
  return readFileSync(join(ROOT, file), 'utf8');
}

const files = sourceFiles(SRC);
const referencing = files.filter((file) => /\blocalStorage\./.test(read(file)));

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
