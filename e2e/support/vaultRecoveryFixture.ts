import type { Page } from '@playwright/test';

export const RECOVERY_ROOT = 'vaults/main';
export const RECOVERY_RELAY = 'http://127.0.0.1:18329';
export const BROKEN_STATE = '\0'.repeat(43_763);
export const FIXTURE_REGISTRY = JSON.stringify({
  version: 1, room: 'room_fixture', generation: 1,
  journal: { cursor: 0, confirmed: {}, pending: [] },
});

/** A persistent IPC fake; browser reload drops the app heap, not its mock disk. */
export async function installRecoveryFixture(page: Page, baseURL: string) {
  const appOrigin = new URL(baseURL).origin;
  const files = new Map<string, string>([
    ['settings.json', JSON.stringify({ legacy_profile_imported: 'fixture' })],
    [`${RECOVERY_ROOT}/state.json`, BROKEN_STATE],
    [`${RECOVERY_ROOT}/note-registry.json`, FIXTURE_REGISTRY],
  ]);
  const dirs = new Set(['', 'vaults', RECOVERY_ROOT, `${RECOVERY_ROOT}/notes`, `${RECOVERY_ROOT}/notes/Входящие`, `${RECOVERY_ROOT}/.trash`]);
  const attempts: string[] = [];
  const writes: string[] = [];
  let refuseWrite: ((path: string) => boolean) | undefined;
  const failedGenerations = new Set<string>();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const normalize = (path: string) => path.replaceAll('\\', '/').replace(/\/$/, '');
  const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const ensureDir = (path: string) => {
    while (!dirs.has(path)) {
      dirs.add(path);
      path = parent(path);
    }
  };
  const date = Date.now();
  const noteIds = Array.from({ length: 106 }, (_, i) => `recovery-note-${i + 1}`);
  for (const [i, id] of noteIds.entries()) {
    const folder = i < 48 ? 'Входящие' : i < 80 ? 'Проекты/Аварии' : 'Личное';
    const dir = `${RECOVERY_ROOT}/notes/${folder}`;
    const title = `Заметка проверки ${i + 1}`;
    ensureDir(dir);
    files.set(`${dir}/${id}.md`, `---\nid: ${id}\ntype: note\ntitle: ${title}\ncreated: ${date - (i + 1) * 1000}\nupdated: ${date - (i + 1) * 1000}\n---\n\n${title}\n`);
  }
  files.set(`${RECOVERY_ROOT}/.trash/deleted.md`, '---\nid: deliberately-deleted\ntitle: Удалённая не возвращается\n---\n\nУдалённая не возвращается');
  const read = (path: string) => {
    const value = files.get(path);
    if (value === undefined) throw new Error('The system cannot find the file specified. (os error 2)');
    return value;
  };
  const put = (path: string, value: string) => {
    if (refuseWrite?.(path)) throw new Error('Not enough space (os error 112)');
    if (!dirs.has(parent(path))) throw new Error('The system cannot find the path specified. (os error 3)');
    files.set(path, value);
    writes.push(path);
  };
  const move = (from: string, to: string, replace: boolean) => {
    if (!replace && files.has(to)) throw new Error('Already exists (os error 183)');
    put(to, read(from));
    files.delete(from);
  };
  const firstNoteWrites = () => writes.filter((path) => path.startsWith(`${RECOVERY_ROOT}/notes/`) && path.endsWith('.md'));

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) {
      await route.continue();
      return;
    }
    // Neither requests to the test relay nor accidental external requests may leave the fixture.
    if (url.origin === RECOVERY_RELAY || /\/api\/(?:rooms|vaults|sync|assistant|notify)(?:\/|$)/.test(url.pathname)) {
      attempts.push(`${route.request().method()} ${url.pathname}`);
    }
    await route.fulfill({ status: 503, json: { error: 'isolated vault fixture' } });
  });
  await page.routeWebSocket(/.*/, (socket) => {
    const url = new URL(socket.url());
    if (url.host === new URL(appOrigin).host) {
      socket.connectToServer();
      return;
    }
    attempts.push(`WS ${url.pathname}`);
    socket.close();
  });
  await page.exposeFunction('__recoveryInvoke', async (cmd: string, arg: Record<string, unknown>, headers?: Record<string, string>) => {
    const path = normalize(String(arg.path ?? (headers?.path ? decodeURIComponent(headers.path) : '')));
    const bytes = (input: unknown): string => typeof input === 'string' ? input : decoder.decode(Uint8Array.from(input as number[]));
    switch (cmd) {
      case 'plugin:fs|exists': return files.has(path) || dirs.has(path);
      case 'plugin:fs|read_file':
      case 'plugin:fs|read_text_file': return [...encoder.encode(read(path))];
      case 'plugin:fs|mkdir': ensureDir(path); return;
      case 'plugin:fs|read_dir': {
        if (!dirs.has(path)) throw new Error('The system cannot find the path specified. (os error 3)');
        return [...dirs, ...files.keys()].filter((entry) => entry !== path && parent(entry) === path)
          .map((entry) => ({ name: entry.slice(path ? path.length + 1 : 0), isDirectory: dirs.has(entry), isFile: files.has(entry), isSymlink: false }));
      }
      case 'plugin:fs|stat': return { size: read(path).length, mtime: date, isFile: true };
      case 'plugin:fs|write_file':
      case 'plugin:fs|write_text_file': put(path, bytes(arg)); return;
      case 'plugin:fs|rename': move(normalize(String(arg.oldPath)), normalize(String(arg.newPath)), true); return;
      case 'plugin:fs|copy_file': put(normalize(String(arg.toPath)), read(normalize(String(arg.fromPath)))); return;
      case 'plugin:fs|remove': files.delete(path); dirs.delete(path); return;
      case 'vault_replace': ensureDir(parent(path)); put(path, bytes(arg.data)); return;
      case 'vault_move': {
        const to = normalize(String(arg.to));
        ensureDir(parent(to));
        move(normalize(String(arg.from)), to, false);
        return;
      }
      case 'vault_remove': files.delete(path); return;
      case 'vault_read_generation':
      case 'vault_write_generation': {
        if (failedGenerations.has(path)) throw new Error('vault generation is not recoverable');
        if (cmd === 'vault_read_generation') return files.get(`${path}.fixture-generation`) ?? null;
        ensureDir(parent(path));
        put(`${path}.fixture-generation`, String(arg.text));
        return;
      }
      case 'secret_get': return arg.key === 'vault-seed:default_vault' ? 'abandon ability able about above absent absorb abstract absurd abuse access accident' : null;
      case 'secret_set': attempts.push('secret_set'); return;
      case 'plugin:event|listen': return 1;
      case 'plugin:app|version': return '0.2.5';
      case 'plugin:path|resolve_directory': return 'C:\\fixture';
      case 'plugin:fs|watch': return 1;
      default: return undefined; // Shell and notification calls have no filesystem side effects in this fixture.
    }
  });
  await page.addInitScript(() => {
    const target = window as unknown as {
      isTauri: boolean;
      __recoveryInvoke: (command: string, args: unknown, headers?: Record<string, string>) => Promise<unknown>;
      __TAURI_INTERNALS__: unknown;
      __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
    };
    target.isTauri = true;
    let callbackId = 0;
    target.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
      transformCallback: () => ++callbackId,
      unregisterCallback: () => {},
      convertFileSrc: (file: string) => file,
      invoke: (cmd: string, args?: unknown, options?: { headers?: Record<string, string> }) =>
        target.__recoveryInvoke(cmd, ArrayBuffer.isView(args) ? [...new Uint8Array(args.buffer, args.byteOffset, args.byteLength)] : args ?? {}, options?.headers),
    };
    target.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  });
  return {
    files, attempts, noteIds, writes, firstNoteWrites,
    damageGeneration: (file: 'note-registry.json' | 'sync-ledger.json' | 'sync-config.json') => {
      const path = `${RECOVERY_ROOT}/${file}`;
      if (!files.has(`${path}.fixture-generation`)) throw new Error(`No fixture generation for ${file}`);
      failedGenerations.add(path);
    },
    rejectWritesTo: (predicate: (path: string) => boolean) => { refuseWrite = predicate; },
    allowWrites: () => { refuseWrite = undefined; },
  };
}
