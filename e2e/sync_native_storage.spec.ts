import { test, expect } from '@playwright/test';

test('synced native notes survive disk reload and disk failures reject', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const storagePath = '/src/lib/storage.ts';
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
      const localPreserved = !!storage.getItemById('local-edit') && [...files.values()].some(text => text.includes('id: local-edit'));
      let unsafeRejected = false;
      try { await storage.importSyncedVaultData({ items: [{ ...note, folder: '../escape' }] }); } catch { unsafeRejected = true; }
      await storage.importSyncedVaultData({ items: [] });
      return { restored: { title: restored.title, updatedAt: restored.updatedAt }, rejected, replacementOnDisk, concurrentRejected, localPreserved, unsafeRejected, trashed: [...files.keys()].some(path => path.includes('/.trash/')), markdownFiles: [...files.keys()].filter(path => path.includes('/notes/') && path.endsWith('.md')).length };
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
