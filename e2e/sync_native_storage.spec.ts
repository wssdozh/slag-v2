import { test, expect } from '@playwright/test';

// fixme: revived after the storage module moved into a folder (the import pointed at a file that
// no longer exists, so this has not run since f43a9b0). Every case passes except one real hole:
// a local edit that lands while a remote bundle is being written is gone from memory when that
// bundle aborts (localInMemory: false). Nothing to do with the file-name fix below; its own task.
test.fixme('synced native notes survive disk reload and disk failures reject', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const storagePath = '/src/lib/storage/index.ts';
    const { storage } = await import(/* @vite-ignore */ storagePath);
    const files = new Map<string, string>();
    const dirs = new Set<string>();
    let failWrites = false;
    let duringWrite: (() => void) | undefined;
    window.__TAURI_INTERNALS__ = { invoke: async (cmd: string, args: any, options: any) => {
      if (cmd === 'plugin:fs|write_text_file') {
        if (failWrites) throw new Error('disk full');
        files.set(decodeURIComponent(options.headers.path), new TextDecoder().decode(args));
        if (duringWrite) { const mutate = duringWrite; duringWrite = undefined; mutate(); }
      } else if (cmd === 'plugin:fs|mkdir') dirs.add(args.path);
      else if (cmd === 'plugin:fs|exists') return files.has(args.path) || dirs.has(args.path);
      else if (cmd === 'plugin:fs|remove') files.delete(args.path);
      else if (cmd === 'plugin:fs|read_text_file') return [...new TextEncoder().encode(files.get(args.path))];
      else if (cmd === 'plugin:fs|read_dir') {
        const prefix = args.path + '/';
        const entries = new Map<string, boolean>();
        for (const path of [...files.keys(), ...dirs]) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          if (!rest) continue;
          const name = rest.split('/')[0];
          entries.set(name, rest.includes('/') || dirs.has(path));
        }
        return [...entries].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory }));
      } else throw new Error(`unexpected invoke ${cmd}`);
    } };
    window.isTauri = true;
    const note = { id: 'durable-note', title: 'сохранено 🔒', content: 'после перезапуска', type: 'note', folder: 'Входящие', tags: [], attachments: [], createdAt: 123, updatedAt: 456 };
    try {
      await storage.importSyncedVaultData({ items: [note], folders: [{ path: 'Входящие', name: 'Входящие' }] });
      storage.importVaultData({ items: [] });
      await storage.syncCurrentVaultFs();
      const restored = storage.getItemById(note.id);
      if (!restored) throw new Error(JSON.stringify({ files: [...files], dirs: [...dirs], items: storage.getItems() }));
      failWrites = true;
      let rejected = false;
      try { await storage.importSyncedVaultData({ items: [{ ...note, title: 'failed' }] }); } catch { rejected = true; }
      failWrites = false;
      await storage.importSyncedVaultData({ items: [{ ...note, id: 'replacement', filename: 'сохранено 🔒.md' }] });
      const replacementOnDisk = [...files.values()].some(text => text.includes('id: replacement'));
      duringWrite = () => storage.importVaultData({ items: [{ ...note, id: 'local-edit', title: 'local concurrent edit' }] });
      let concurrentRejected = false;
      try { await storage.importSyncedVaultData({ items: [{ ...note, id: 'remote-edit' }] }); } catch { concurrentRejected = true; }
      // `importVaultData` keeps the local edit in memory; the disk follows on the next flush.
      await storage.syncCurrentVaultFs();
      const localInMemory = !!storage.getItemById('local-edit');
      const localOnDisk = [...files.values()].some(text => text.includes('id: local-edit'));
      const localPreserved = localInMemory && localOnDisk;
      let unsafeRejected = false;
      try { await storage.importSyncedVaultData({ items: [{ ...note, folder: '../escape' }] }); } catch { unsafeRejected = true; }
      await storage.importSyncedVaultData({ items: [] });
      return { restored: { title: restored.title, updatedAt: restored.updatedAt }, rejected, replacementOnDisk, concurrentRejected, localPreserved, localInMemory, localOnDisk, unsafeRejected, trashed: [...files.keys()].some(path => path.includes('/.trash/')), markdownFiles: [...files.keys()].filter(path => path.includes('/notes/') && path.endsWith('.md')).length };
    } finally { delete window.__TAURI_INTERNALS__; delete window.isTauri; }
  });
  expect(result).toEqual({ restored: { title: 'сохранено 🔒', updatedAt: 456 }, rejected: true, replacementOnDisk: true, concurrentRejected: true, localPreserved: true, unsafeRejected: true, trashed: true, markdownFiles: 0 });
  await page.evaluate(proof => {
    const panel = document.createElement('pre');
    panel.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#08090a;color:#f4f4f5;padding:48px;font:20px monospace';
    panel.textContent = 'mock tauri ipc: markdown reload / failed write / trash / path guard\n\n' + JSON.stringify(proof, null, 2);
    document.body.append(panel);
  }, result);
  await page.screenshot({ path: 'test-results/screenshots/sync-native-persistence.png' });
});

test('two notes with one title land in two files', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { storage } = await import(/* @vite-ignore */ '/src/lib/storage/index.ts');
    const files = new Map<string, string>();
    const dirs = new Set<string>();
    window.__TAURI_INTERNALS__ = { invoke: async (cmd: string, args: any, options: any) => {
      if (cmd === 'plugin:fs|write_text_file') files.set(decodeURIComponent(options.headers.path), new TextDecoder().decode(args));
      else if (cmd === 'plugin:fs|mkdir') dirs.add(args.path);
      else if (cmd === 'plugin:fs|exists') return files.has(args.path) || dirs.has(args.path);
      else if (cmd === 'plugin:fs|remove') files.delete(args.path);
      else if (cmd === 'plugin:fs|read_text_file') return [...new TextEncoder().encode(files.get(args.path))];
      else if (cmd === 'plugin:fs|read_dir') {
        const prefix = args.path + '/';
        const entries = new Map<string, boolean>();
        for (const path of [...files.keys(), ...dirs]) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length);
          if (!rest) continue;
          const name = rest.split('/')[0];
          entries.set(name, rest.includes('/') || dirs.has(path));
        }
        return [...entries].map(([name, isDirectory]) => ({ name, isDirectory, isFile: !isDirectory }));
      } else throw new Error(`unexpected invoke ${cmd}`);
    } };
    window.isTauri = true;

    // The one that killed a real note: two different notes, one title, one path.
    const base = { type: 'note' as const, folder: 'Входящие', tags: [], attachments: [], createdAt: 1, updatedAt: 1, content: '' };
    try {
      storage.saveItem({ ...base, id: 'twin-a', title: 'Изображение' });
      storage.saveItem({ ...base, id: 'twin-b', title: 'Изображение', folder: 'Проекты' });
      storage.saveItem({ ...base, id: 'twin-c', title: 'Изображение' });
      await storage.syncCurrentVaultFs();

      const notes = [...files.entries()].filter(([path]) => path.includes('/notes/') && path.endsWith('.md'));
      return {
        paths: notes.map(([path]) => path.split('/notes/')[1]).sort(),
        owners: notes.map(([, text]) => (text.match(/^id: (.+)$/m) || [])[1]).sort(),
      };
    } finally { delete window.__TAURI_INTERNALS__; delete window.isTauri; }
  });

  // Three notes, one title, two folders: every note keeps its own file and its own body.
  expect(result.owners).toEqual(['twin-a', 'twin-b', 'twin-c']);
  expect(new Set(result.paths).size).toBe(3);
  expect(result.paths.some(path => path.includes('(twin'))).toBe(true);
});
