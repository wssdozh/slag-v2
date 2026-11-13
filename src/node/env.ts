// The browser surfaces the sync core still leans on, backed by files. Installed before anything
// from `lib/sync` is imported — the engine reads its config and ledgers synchronously at load.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const slagHome = process.env.SLAG_HOME || path.join(os.homedir(), '.slag');

interface StorageLike {
  readonly length: number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

function createStorage(file: string): StorageLike & { flush(): void } {
  let data: Record<string, string> = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, string>;
  } catch (error) {
    // A missing file is a first run, not a failure; anything else is worth a line on stderr.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`slag-node: could not read ${file}: ${String(error)}\n`);
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = (): void => {
    timer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    } catch (error) {
      process.stderr.write(`slag-node: could not write ${file}: ${String(error)}\n`);
    }
  };
  const schedule = (): void => {
    if (timer) return;
    timer = setTimeout(flush, 150);
    timer.unref();
  };

  return {
    get length() {
      return Object.keys(data).length;
    },
    clear() {
      data = {};
      schedule();
    },
    getItem(key) {
      return Object.hasOwn(data, key) ? data[key] : null;
    },
    key(index) {
      return Object.keys(data)[index] ?? null;
    },
    removeItem(key) {
      if (!Object.hasOwn(data, key)) return;
      delete data[key];
      schedule();
    },
    setItem(key, value) {
      data[key] = String(value);
      schedule();
    },
    flush: () => {
      if (!timer) return;
      clearTimeout(timer);
      flush();
    },
  };
}

/**
 * Gives the sync core the three globals it expects from a browser. Nothing here fakes a DOM:
 * the daemon never renders, it only writes ledgers and reads a config back.
 */
export function installNodeEnvironment(): void {
  fs.mkdirSync(slagHome, { recursive: true });

  const local = createStorage(path.join(slagHome, 'local-storage.json'));
  const session = createStorage(path.join(slagHome, 'session-storage.json'));

  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  win.localStorage = local;
  win.sessionStorage = session;
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
  win.setInterval = setInterval;
  win.clearInterval = clearInterval;

  Object.assign(globalThis, { localStorage: local, sessionStorage: session, window: win });

  // The ledgers are debounced; a SIGTERM from systemd must not outrun the last write.
  const flushAll = (): void => {
    local.flush();
    session.flush();
  };
  process.on('exit', flushAll);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      flushAll();
      process.exit(0);
    });
  }
}
