/**
 * MCP task mailbox — the whole path, exercised through the supported entry points.
 *
 * MCP side: a real `McpVault` over an isolated temporary vault on this machine's disk.
 * App side: a real `StorageService` whose Tauri AppData filesystem is mocked at the IPC
 * boundary but backed by that same temporary vault directory. Nothing talks to `localStorage`
 * or a live SLAG vault: every request is written by MCP code and read back by app code.
 *
 * Covered:
 *  - registry vault: MCP queues `{ id, status }` once, the app claims it, the journal intent is
 *    durable before the projected receipt appears, and both the index and the Markdown file
 *    carry the new status;
 *  - expired request: receipt `rejected_expired`, no mutation, no journal intent;
 *  - no writable journal in this webview: the poll must leave the request unclaimed (another
 *    window may own the journal), so MCP times out closed;
 *  - receiver scope: a request aimed at a note that is not a task is rejected;
 *  - legacy vault: MCP still writes Markdown directly, and the registry write guard refuses a
 *    non-status edit without touching the file.
 */

import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { McpVault } from '../../src/mcp/vault';
import {
  buildPendingPath,
  buildReceiptPath,
  isValidRequest,
} from '../../src/lib/storage/taskMailbox';
import type { TaskMailboxReceipt, TaskMailboxRequest } from '../../src/lib/storage/taskMailbox';
import { emptyJournal, recordNote } from '../../src/lib/sync/notes/journal';
import { loadNoteJournal } from '../../src/lib/sync/notes/persistence';

// ── Isolated temporary vault ────────────────────────────────────────

interface IsolatedVault {
  /** Root of the mocked Tauri AppData directory. */
  appData: string;
  /** Where MCP and the app both see the vault: `<appData>/vaults/main`. */
  vaultRoot: string;
}

async function freshVault(name: string): Promise<IsolatedVault> {
  const appData = test.info().outputPath(name);
  const vaultRoot = path.join(appData, 'vaults', 'main');
  await fs.mkdir(path.join(vaultRoot, 'notes', 'Входящие'), { recursive: true });
  await fs.writeFile(path.join(vaultRoot, 'state.json'), '{}');
  return { appData, vaultRoot };
}

const enrollment = { version: 1, room: 'mailbox-e2e', generation: 1 };

async function writeRegistryMarker(root: string): Promise<void> {
  await fs.writeFile(path.join(root, 'note-registry.json'), JSON.stringify({ ...enrollment, journal: emptyJournal() }));
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeNoteFile(root: string, note: {
  id: string;
  title: string;
  type?: 'note' | 'task';
  status?: 'backlog' | 'todo' | 'in_progress' | 'done';
}): Promise<string> {
  const file = path.join(root, 'notes', 'Входящие', `${note.title}.md`);
  const frontmatter = [
    '---',
    `id: ${note.id}`,
    `type: ${note.type ?? 'task'}`,
    `title: ${note.title}`,
    'created: 1',
    'updated: 1',
    'folder: Входящие',
    `status: ${note.status ?? 'todo'}`,
    '---',
    '',
    '- [ ] шаг',
    '',
  ].join('\n');
  await fs.writeFile(file, frontmatter, 'utf-8');
  return file;
}

async function readFileOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf-8');
  } catch {
    return null;
  }
}

async function waitFor<T>(read: () => Promise<T | null>, what: string, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null && value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function waitForReceipt(root: string, requestId: string): Promise<TaskMailboxReceipt> {
  const file = buildReceiptPath(root, requestId);
  return waitFor(async () => {
    const raw = await readFileOrNull(file);
    if (raw === null) return null;
    return JSON.parse(raw) as TaskMailboxReceipt;
  }, `receipt ${requestId}`);
}

/** Put a request on disk exactly where MCP would leave it. */
async function seedRequest(root: string, request: TaskMailboxRequest): Promise<string> {
  const pendingDir = path.dirname(buildPendingPath(root, request.requestId));
  await fs.mkdir(pendingDir, { recursive: true });
  const file = buildPendingPath(root, request.requestId);
  await fs.writeFile(file, JSON.stringify(request), 'utf-8');
  return file;
}

function makeRequest(overrides: Partial<TaskMailboxRequest> = {}): TaskMailboxRequest {
  return {
    requestId: randomUUID(),
    noteId: 'task-mailbox-target',
    targetStatus: 'done',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── App-side Tauri AppData filesystem mock ──────────────────────────
//
// The real `VaultFiles` and `StorageService` code runs unchanged. Only the IPC boundary is
// replaced: every `plugin:fs|*` command reads and writes the temporary vault directory, so the
// app and MCP see the same bytes.

function installAppDataMock(root: string) {
  const toReal = (relative: string): string => {
    const clean = relative.replaceAll('\\', '/').replace(/^\/+/, '');
    const target = path.resolve(root, clean);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Mock AppData path escapes its root: ${relative}`);
    }
    return target;
  };

  const invoke = async (cmd: string, args: Record<string, unknown> = {}, options?: {
    headers?: { path?: string };
  }): Promise<unknown> => {
    const filePath = typeof args.path === 'string' ? args.path : '';
    switch (cmd) {
      case 'plugin:fs|exists':
        try { await fs.access(toReal(filePath)); return true; } catch { return false; }
      case 'plugin:fs|read_text_file': {
        const bytes = await fs.readFile(toReal(filePath));
        return [...bytes];
      }
      case 'plugin:fs|read_dir': {
        try {
          const entries = await fs.readdir(toReal(filePath), { withFileTypes: true });
          return entries.map((entry) => ({
            name: entry.name,
            isFile: entry.isFile(),
            isDirectory: entry.isDirectory(),
          }));
        } catch {
          throw new Error('not found (os error 2)');
        }
      }
      case 'plugin:fs|write_text_file': {
        const destination = toReal(decodeURIComponent(options?.headers?.path ?? ''));
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, Buffer.from(args as unknown as Uint8Array));
        return undefined;
      }
      case 'plugin:fs|mkdir':
        await fs.mkdir(toReal(filePath), { recursive: true });
        return undefined;
      case 'plugin:fs|remove':
        await fs.rm(toReal(filePath), { recursive: false, force: true });
        return undefined;
      case 'plugin:fs|rename': {
        const from = toReal(typeof args.oldPath === 'string' ? args.oldPath : '');
        const to = toReal(typeof args.newPath === 'string' ? args.newPath : '');
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.rename(from, to);
        return undefined;
      }
      case 'plugin:fs|stat': {
        const stat = await fs.stat(toReal(filePath));
        return {
          isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size,
          mtime: stat.mtime.toISOString(), atime: stat.atime.toISOString(),
          birthtime: stat.birthtime.toISOString(), ctime: stat.ctime.toISOString(),
        };
      }
      case 'plugin:fs|lstat': {
        const stat = await fs.lstat(toReal(filePath));
        return {
          isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size,
          mtime: stat.mtime.toISOString(), atime: stat.atime.toISOString(),
          birthtime: stat.birthtime.toISOString(), ctime: stat.ctime.toISOString(),
        };
      }
      default:
        // Settings/log commands are irrelevant here; the mailbox path only needs fs.
        return undefined;
    }
  };

  return invoke;
}

function memoryLocalStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
  };
}

/**
 * Boot a real `StorageService` against the temporary vault.
 *
 * The mailbox interval is suppressed so each test calls `processMailboxQueue()` itself: the
 * public API is the processor's job, and the private name is the fixture hook the task allows.
 */
async function withApp<T>(root: string, run: (service: import('../../src/lib/storage').StorageService) => Promise<T>): Promise<T> {
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = {
    window: globals.window,
    isTauri: globals.isTauri,
    localStorage: globals.localStorage,
    setInterval: globals.setInterval,
  };

  const storage = memoryLocalStorage();
  const invoke = installAppDataMock(root);
  const windowStub = {
    isTauri: true,
    __TAURI_INTERNALS__: { invoke },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    sessionStorage: undefined,
    localStorage: storage,
    setTimeout,
    clearTimeout,
  };

  globals.window = windowStub;
  globals.isTauri = true;
  globals.localStorage = storage;
  // No background polling: the fixture drives one deterministic pass.
  globals.setInterval = (() => 0) as unknown as typeof setInterval;

  let service: import('../../src/lib/storage').StorageService | undefined;
  let draftChannel: BroadcastChannel | null = null;
  try {
    const module = await import('../../src/lib/storage/index.ts');
    draftChannel = module.storage.getDraftChannel();
    service = new module.StorageService();
    expect(await service.getCurrentVaultRead()).toBe(true);

    return await run(service);
  } finally {
    draftChannel?.close();
    service?.getDraftChannel()?.close();
    globals.setInterval = previous.setInterval;
    for (const [key, value] of Object.entries(previous)) {
      if (key === 'setInterval') continue;
      if (value === undefined) delete globals[key];
      else globals[key] = value;
    }
  }
}

function processMailbox(service: import('../../src/lib/storage').StorageService): Promise<void> {
  // `processMailboxQueue` is private by design; the spec is the only caller outside the poller.
  return (service as unknown as { processMailboxQueue(): Promise<void> }).processMailboxQueue();
}

// ── Tests ───────────────────────────────────────────────────────────

test('registry vault: durable journal then projected receipt, index and Markdown agree', async () => {
  test.setTimeout(60_000);
  const { appData, vaultRoot } = await freshVault('success');
  await writeRegistryMarker(vaultRoot);
  const noteFile = await writeNoteFile(vaultRoot, { id: 'task-mailbox-target', title: 'Задача через mailbox' });
  const vault = new McpVault(vaultRoot);
  await vault.init();

  await withApp(appData, async (storage) => {
    let markJournalStarted!: () => void;
    const journalStarted = new Promise<void>((resolve) => { markJournalStarted = resolve; });
    let releaseJournal!: () => void;
    const journalGate = new Promise<void>((resolve) => { releaseJournal = resolve; });
    let journal = emptyJournal();
    const unsubscribe = storage.subscribeNoteIntents(async (changes) => {
      markJournalStarted();
      await journalGate;
      journal = changes.reduce((state, change) => recordNote(state, {
        ...change, intentId: change.intentId ?? randomUUID(),
      }), journal);
      await storage.writeNoteRegistry({ ...enrollment, journal });
    });

    try {
      await processMailbox(storage); // An empty pass must not disable later requests.
      let saved: Awaited<ReturnType<McpVault['saveNote']>> | undefined;
      let saveFailed: unknown;
      const save = vault.saveNote({ id: 'task-mailbox-target', status: 'done' })
        .then((result) => { saved = result; }, (error: unknown) => { saveFailed = error; });

      const pendingDir = path.join(vaultRoot, '.task-mailbox', 'pending');
      const requestFile = await waitFor(async () => {
        const names = await fs.readdir(pendingDir).catch(() => [] as string[]);
        const file = names.find((name) => name.endsWith('.json'));
        return file ? path.join(pendingDir, file) : null;
      }, 'MCP pending request');

      const request = JSON.parse(await fs.readFile(requestFile, 'utf-8')) as TaskMailboxRequest;
      expect(isValidRequest(request)).toBe(true);
      expect(request).toMatchObject({ noteId: 'task-mailbox-target', targetStatus: 'done' });
      // The mailbox lives exactly once under the vault root — not `.task-mailbox/.task-mailbox`.
      expect(await exists(path.join(vaultRoot, '.task-mailbox', '.task-mailbox'))).toBe(false);

      const processed = processMailbox(storage);
      await Promise.race([journalStarted, processed.then(() => { throw new Error('Mailbox returned without capturing an intent'); })]);
      expect(saved).toBeUndefined();
      // Neither the receipt nor the disk change may overtake the journal write.
      expect(await readFileOrNull(buildReceiptPath(vaultRoot, request.requestId))).toBeNull();
      expect(await fs.readFile(noteFile, 'utf-8')).toContain('status: todo');
      releaseJournal();
      await processed;

      await save;
      expect(saveFailed).toBeUndefined();
      const journalOnDisk = loadNoteJournal(await storage.readNoteRegistry(), enrollment.room, enrollment.generation);
      expect(journalOnDisk.pending).toMatchObject([{ id: 'task-mailbox-target', kind: 'update', item: { status: 'done' } }]);
      expect(saved?.item.status).toBe('done');
      expect(saved?.path).toBe('Входящие/Задача через mailbox.md');

      expect(storage.getItemById('task-mailbox-target')?.status).toBe('done');
      expect(await fs.readFile(noteFile, 'utf-8')).toContain('status: done');

      // Both sides clean their own artifacts after the client consumes the receipt.
      expect(await exists(buildReceiptPath(vaultRoot, request.requestId))).toBe(false);
      expect(await fs.readdir(pendingDir)).toEqual([]);
      expect(await fs.readdir(path.join(vaultRoot, '.task-mailbox', 'processing')).catch(() => [] as string[])).toEqual([]);
    } finally {
      releaseJournal();
      unsubscribe();
    }
  });
});

test('expired request: rejected_expired receipt without touching the task', async () => {
  test.setTimeout(30_000);
  const { appData, vaultRoot } = await freshVault('expired');
  await writeRegistryMarker(vaultRoot);
  const noteFile = await writeNoteFile(vaultRoot, { id: 'task-mailbox-target', title: 'Просроченный запрос' });

  await withApp(appData, async (storage) => {
    const journal: string[] = [];
    const unsubscribe = storage.subscribeNoteIntents(async (changes) => {
      journal.push(...changes.map((change) => change.id));
    });
    try {
      const request = makeRequest({ createdAt: Date.now() - 60_000 });
      await seedRequest(vaultRoot, request);
      await processMailbox(storage);

      const receipt = await waitForReceipt(vaultRoot, request.requestId);
      expect(receipt.state).toBe('rejected_expired');
      expect(storage.getItemById(request.noteId)?.status).toBe('todo');
      expect(await fs.readFile(noteFile, 'utf-8')).toContain('status: todo');
      expect(journal).toEqual([]);
      expect(await fs.readdir(path.join(vaultRoot, '.task-mailbox', 'pending')).catch(() => [] as string[])).toEqual([]);
    } finally {
      unsubscribe();
    }
  });
});

test('no writable journal here: request stays unclaimed and MCP times out closed', async () => {
  test.setTimeout(45_000);
  const { appData, vaultRoot } = await freshVault('no-journal');
  await writeRegistryMarker(vaultRoot);
  const noteFile = await writeNoteFile(vaultRoot, { id: 'task-mailbox-target', title: 'Без журнала' });
  const vault = new McpVault(vaultRoot);
  await vault.init();

  await withApp(appData, async (storage) => {
    let saveFailed: unknown;
    const save = vault.saveNote({ id: 'task-mailbox-target', status: 'done' })
      .then(() => undefined, (error: unknown) => { saveFailed = error; });

    const pendingDir = path.join(vaultRoot, '.task-mailbox', 'pending');
    const requestFile = await waitFor(async () => {
      const names = await fs.readdir(pendingDir).catch(() => [] as string[]);
      const file = names.find((name) => name.endsWith('.json'));
      return file ? path.join(pendingDir, file) : null;
    }, 'MCP pending request');
    const request = JSON.parse(await fs.readFile(requestFile, 'utf-8')) as TaskMailboxRequest;

    // Without a listener, or with a read-only listener, this webview must not claim.
    await processMailbox(storage);
    const unsubscribe = storage.subscribeNoteIntents(async () => { throw new Error('Read-only journal called'); }, () => false);
    try {
      await processMailbox(storage);
    } finally {
      unsubscribe();
    }

    expect(await fs.readdir(pendingDir)).toEqual([path.basename(requestFile)]);
    expect(await readFileOrNull(buildReceiptPath(vaultRoot, request.requestId))).toBeNull();
    expect(await fs.readdir(path.join(vaultRoot, '.task-mailbox', 'processing')).catch(() => [] as string[])).toEqual([]);
    expect(storage.getItemById('task-mailbox-target')?.status).toBe('todo');
    expect(await fs.readFile(noteFile, 'utf-8')).toContain('status: todo');

    await save;
    expect(saveFailed).toBeInstanceOf(Error);
    expect(String(saveFailed)).toContain('Исход неизвестен');
    // The client closed the loop by removing its own request; it was never the processor's.
    expect(await exists(requestFile)).toBe(false);
  });
});

test('receiver scope: a request aimed at a plain note is rejected', async () => {
  test.setTimeout(30_000);
  const { appData, vaultRoot } = await freshVault('non-task');
  await writeRegistryMarker(vaultRoot);
  const noteFile = await writeNoteFile(vaultRoot, { id: 'not-a-task', title: 'Обычная заметка', type: 'note', status: 'todo' });

  await withApp(appData, async (storage) => {
    const journal: string[] = [];
    const unsubscribe = storage.subscribeNoteIntents(async (changes) => {
      journal.push(...changes.map((change) => change.id));
    });
    try {
      const request = makeRequest({ noteId: 'not-a-task', targetStatus: 'done' });
      await seedRequest(vaultRoot, request);
      await processMailbox(storage);

      const receipt = await waitForReceipt(vaultRoot, request.requestId);
      expect(receipt.state).toBe('rejected_unknown');
      expect(storage.getItemById('not-a-task')).toMatchObject({ id: 'not-a-task', type: 'note' });
      expect(await fs.readFile(noteFile, 'utf-8')).toContain('status: todo');
      expect(journal).toEqual([]);
    } finally {
      unsubscribe();
    }
  });
});

test('legacy vault writes Markdown directly; registry guard refuses a non-status edit', async () => {
  test.setTimeout(30_000);

  // Legacy: no note-registry.json, so MCP keeps the original direct-write flow.
  const legacy = await freshVault('legacy');
  const legacyVault = new McpVault(legacy.vaultRoot);
  await legacyVault.init();
  const created = await legacyVault.saveNote({
    title: 'Legacy задача',
    type: 'task',
    status: 'todo',
  });
  expect(created.created).toBe(true);
  expect(await exists(path.join(legacy.vaultRoot, '.task-mailbox'))).toBe(false);
  const toggled = await legacyVault.toggleTask('Legacy задача', undefined, 'done');
  expect(toggled.status).toBe('done');
  expect(await fs.readFile(path.join(legacyVault.config.notesDir, 'Входящие', 'Legacy задача.md'), 'utf-8'))
    .toContain('status: done');
  expect(await exists(path.join(legacy.vaultRoot, '.task-mailbox'))).toBe(false);

  // Registry: any non-status edit is refused before a byte is written.
  const registry = await freshVault('guard');
  await writeRegistryMarker(registry.vaultRoot);
  const guardedFile = await writeNoteFile(registry.vaultRoot, { id: 'task-mailbox-target', title: 'Защищённая задача' });
  const before = await fs.readFile(guardedFile, 'utf-8');
  const guarded = new McpVault(registry.vaultRoot);
  await guarded.init();

  let failure: unknown;
  await guarded.saveNote({ id: 'task-mailbox-target', title: 'Новое имя' }).catch((error: unknown) => { failure = error; });
  expect(String(failure)).toMatch(/реестр синхронизации/);
  expect(await fs.readFile(guardedFile, 'utf-8')).toBe(before);
  expect(await fs.readdir(path.join(registry.vaultRoot, '.task-mailbox', 'pending')).catch(() => [] as string[])).toEqual([]);
});
