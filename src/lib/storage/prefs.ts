/**
 * Preferences: the one place settings live, wherever they came from.
 *
 * A native build keeps them in `<AppData>/settings.json`; a browser build keeps them in
 * `localStorage` and nowhere else. Which of the two is behind this module is decided once, in
 * `initPrefs()`, and the code above it never learns the answer.
 *
 * Reads are synchronous on purpose: they happen inside `useState(() => ...)` and in module-level
 * helpers that cannot wait for a promise. `initPrefs()` loads the snapshot once in `boot()`, before
 * the first render, and from then on the map below is the truth — plus, in a browser build, the
 * profile behind it for keys this build never wrote. A write updates the map immediately and
 * reaches the backend through one coalescing queue, so a burst of `setPref` calls costs one backend
 * write.
 */
import { isTauri } from '@tauri-apps/api/core';

/**
 * The logger pulls the `config` barrel (extensionless imports, a directory index) and would make
 * this module unreadable to `node --test`, which reads the sync ledger beside it as-is and needs
 * `prefs` to load there too. Nothing above this module has a warning to log at import time.
 */
function warn(message: string, error: unknown): void {
  void import('../logger/logger.ts').then(({ logger }) => logger.scope('APP').warn(message, error));
}

/**
 * What a backend has to do, and all of it: read everything once, then apply the keys that changed.
 * `null` is a removal. Two executors, no plan for a third.
 *
 * `read` and `entries` are the browser backend's synchronous window onto the profile. There is no
 * native counterpart on purpose — the Tauri fs is asynchronous, so a native build lives on the
 * snapshot alone — and they exist because the browser build's store *is* `localStorage`: a
 * Playwright seed, another tab and the one-off legacy scans put keys there behind this module's
 * back, and a read that cannot see them would answer "nothing stored" to a profile that has them.
 */
export interface PrefsBackend {
  load(): Promise<Record<string, string>>;
  save(changes: Record<string, string | null>): Promise<void>;
  read?(key: string): string | null;
  entries?(): [string, string][];
}

const prefs = new Map<string, string>();
/** Keys changed since the last flush; `null` says the key was removed. */
const pending = new Map<string, string | null>();
let backend: PrefsBackend | null = null;
let initialization: Promise<void> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let flushQueued = false;
/** Flushes running right now; a write that lands mid-flush waits for the queue instead. */
let busyWrites = 0;

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
    warn('Settings could not be read; the app runs on empty defaults:', err);
  }
  if (pending.size > 0) queueFlush();
}

/**
 * The value of a key: the map's answer wins, a removal this session wins over the profile, and
 * only then may a browser build ask the backend for a key it never loaded (a seed another writer
 * left there). A native build has no `read`, so it answers from the snapshot, exactly as before.
 */
export function getPref(key: string): string | null {
  if (pending.has(key)) return pending.get(key) ?? null;
  const value = prefs.get(key);
  if (value !== undefined) return value;
  return backend?.read?.(key) ?? null;
}

export function setPref(key: string, value: string): void {
  if (getPref(key) === value) return;
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
 * Every key this build can see: the snapshot plus what it wrote, and in a browser build whatever
 * else the profile holds. The storage panel and the one-off legacy scans are the only callers —
 * nothing that owns a section may use this as a second read path.
 */
export function getPrefEntries(): [string, string][] {
  const merged = new Map<string, string>(backend?.entries?.() ?? prefs);
  for (const [key, value] of prefs) merged.set(key, value);
  for (const [key, value] of pending) {
    if (value === null) merged.delete(key);
    else merged.set(key, value);
  }
  return [...merged];
}

/**
 * The typed read the removed `readStoredJson` gave its callers: a missing, half-written
 * or foreign-shaped value answers `fallback` and never throws. `revive` returning `undefined` means
 * "not my shape" — the fallback comes back unchanged.
 */
export function getPrefJson<T>(
  key: string,
  fallback: T,
  revive?: (value: unknown) => T | undefined
): T {
  const raw = getPref(key);
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

/**
 * One flush in flight at a time, and the first write of a burst runs **now**: a `pagehide` handler
 * and a test reading the backend in the same tick both have to see it, and the browser backend's
 * body is synchronous under its promise. The rest coalesce behind the queue.
 */
function queueFlush(): void {
  if (!backend || flushQueued) return;
  flushQueued = true;
  if (busyWrites > 0) {
    writeQueue = writeQueue.then(flush, flush);
    return;
  }
  void flush();
}

async function flush(): Promise<void> {
  flushQueued = false;
  busyWrites += 1;
  if (!backend || pending.size === 0) {
    busyWrites -= 1;
    return;
  }
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
    warn('Settings could not be written; they stay in memory:', err);  } finally {
    busyWrites -= 1;
  }
}
