/**
 * Preferences: the one place settings live, wherever they came from.
 *
 * A native build keeps them in `<AppData>/settings.json`; a browser build keeps them in
 * `localStorage` and nowhere else. Which of the two is behind this module is decided once, in
 * `initPrefs()`, and the code above it never learns the answer.
 *
 * Reads are synchronous on purpose: they happen inside `useState(() => ...)` and in module-level
 * helpers that cannot wait for a promise. `initPrefs()` loads the snapshot once in `boot()`, before
 * the first render, and from then on the map below is the truth. A write updates the map
 * immediately and reaches the backend through one coalescing queue, so a burst of `setPref` calls
 * costs one backend write.
 */
import { isTauri } from '@tauri-apps/api/core';
import { logger } from '../logger/logger';

const log = logger.scope('APP');

/**
 * What a backend has to do, and all of it: read everything once, then apply the keys that changed.
 * `null` is a removal. Two executors, no plan for a third.
 */
export interface PrefsBackend {
  load(): Promise<Record<string, string>>;
  save(changes: Record<string, string | null>): Promise<void>;
}

const prefs = new Map<string, string>();
/** Keys changed since the last flush; `null` says the key was removed. */
const pending = new Map<string, string | null>();
let backend: PrefsBackend | null = null;
let initialization: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let flushQueued = false;

/**
 * Reads the snapshot into memory. Called once from `boot()` before the first render; a second call
 * returns the same promise and touches nothing, so a remount or a retry cannot clobber values set
 * in between.
 *
 * A backend that cannot be loaded or read leaves the map empty and the app running: missing
 * settings are defaults, not a crash.
 */
export function initPrefs(): Promise<void> {
  initialization ??= loadSnapshot();
  return initialization;
}

async function loadSnapshot(): Promise<void> {
  try {
    const { prefsBackend } = isTauri()
      ? await import('./prefsBackend.native')
      : await import('./prefsBackend.browser');
    backend = prefsBackend;
    const snapshot = await backend.load();
    for (const [key, value] of Object.entries(snapshot)) {
      // A value set before init wins over the file: it is newer than what was on disk.
      if (!pending.has(key)) prefs.set(key, value);
    }
  } catch (err) {
    log.warn('Settings could not be read; the app runs on empty defaults:', err);
  }
  if (pending.size > 0) queueFlush();
}

export function getPref(key: string): string | null {
  return prefs.get(key) ?? null;
}

export function setPref(key: string, value: string): void {
  if (prefs.get(key) === value) return;
  prefs.set(key, value);
  pending.set(key, value);
  queueFlush();
}

export function removePref(key: string): void {
  prefs.delete(key);
  // Recorded even when the key is not in memory yet: a removal before init must not be undone by
  // the snapshot that init is about to read from the file.
  pending.set(key, null);
  queueFlush();
}

/**
 * The typed read `localStorage` callers used to get from `readStoredJson`: a missing, half-written
 * or foreign-shaped value answers `fallback` and never throws. `revive` returning `undefined` means
 * "not my shape" — the fallback comes back unchanged.
 */
export function getPrefJson<T>(
  key: string,
  fallback: T,
  revive?: (value: unknown) => T | undefined
): T {
  const raw = prefs.get(key);
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (parsed === null) return fallback;
  if (!revive) return parsed as T;
  const revived = revive(parsed);
  return revived === undefined ? fallback : revived;
}

/** One flush in flight at a time: a burst of writes that arrives while it runs waits for the next. */
function queueFlush(): void {
  if (!backend || flushQueued) return;
  flushQueued = true;
  writeQueue = writeQueue.then(flush, flush);
}

async function flush(): Promise<void> {
  flushQueued = false;
  if (!backend || pending.size === 0) return;
  const changes: Record<string, string | null> = {};
  for (const [key, value] of pending) changes[key] = value;
  pending.clear();
  try {
    await backend.save(changes);
  } catch (err) {
    // A failed write keeps its keys for the next attempt; memory is still correct either way.
    for (const [key, value] of Object.entries(changes)) {
      if (!pending.has(key)) pending.set(key, value);
    }
    log.warn('Settings could not be written; they stay in memory:', err);
  }
}
