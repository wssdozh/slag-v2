import { expect, test } from '@playwright/test';

const morning = new Date('2026-11-23T08:00:00+03:00');
const file = (id: string, title: string) => `---\nid: ${id}\ntype: task\ntitle: ${title}\ncreated: 1\nupdated: 2\nfolder: Входящие\nstatus: done\ndueDate: '2026-11-22'\nlastCompletedDate: '2026-11-22'\nhistory: ['2026-11-22']\nrecurrence: { freq: daily }\n---\n`;

// Mock app-data IPC before mounting so the real constructor, scan and React lifecycle are exercised.
for (const failedRead of [false, true]) test(failedRead ? 'native partial scan does not roll over tasks' : 'native rollover waits for the latest active-vault read', async ({ page }) => {
  await page.clock.setFixedTime(morning);
  await page.addInitScript(({ files, failedRead }) => {
    const data = new Map(Object.entries(files));
    const writes: string[] = [];
    const reads: Array<{ path: string; release: () => void }> = [];
    const defaultVault = { id: 'default_vault', name: 'Main', mode: 'tauri', isCurrent: true };
    const otherVault = { id: 'other', name: 'Other', mode: 'tauri' };
    data.set('settings.json', JSON.stringify({
      slag_current_vault_v2: JSON.stringify(defaultVault), slag_vaults_v2: JSON.stringify([defaultVault, otherVault]),
    }));
    const ipc = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (cmd: string, args: { path?: string; oldPath?: string; newPath?: string } | Uint8Array = {}, options?: { headers: { path: string } }) => {
        const path = 'path' in args ? args.path ?? '' : '';
        const leaf = path.replaceAll('\\', '/');
        if (cmd === 'plugin:fs|exists') return data.has(leaf);
        if (cmd === 'plugin:fs|read_text_file') {
          if (failedRead && leaf.endsWith('/unreadable.md')) throw new Error('access denied (os error 5)');
          if (!data.has(leaf)) throw new Error('not found (os error 2)');
          const text = data.get(leaf);
          if (leaf.endsWith('.md')) {
            await new Promise<void>(release => reads.push({ path: leaf, release }));
          }
          return [...new TextEncoder().encode(text)];
        }
        if (cmd === 'plugin:fs|read_dir') {
          return [...new Set([...data.keys()].filter(p => p.startsWith(`${leaf}/`)).map(p => p.slice(leaf.length + 1).split('/')[0]))]
            .map(name => ({ name, isFile: data.has(`${leaf}/${name}`), isDirectory: !data.has(`${leaf}/${name}`) }));
        }
        if (cmd === 'plugin:fs|write_text_file') {
          const destination = decodeURIComponent(options?.headers.path ?? '');
          if (destination.endsWith('.md')) writes.push(destination);
          data.set(destination, new TextDecoder().decode(args as Uint8Array));
        }
        if (cmd === 'plugin:fs|rename' && 'oldPath' in args && args.oldPath && args.newPath) {
          const value = data.get(args.oldPath);
          if (value !== undefined) data.set(args.newPath, value);
          data.delete(args.oldPath);
        }
        return undefined;
      },
    };
    Object.assign(window, { isTauri: true, __TAURI_INTERNALS__: ipc, __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} }, feedTest: { reads, writes } });
  }, { failedRead, files: {
    'vaults/main/notes/Входящие/main.md': file('main-task', 'Рутина в основном'),
    'vaults/other/notes/Входящие/other.md': file('other-task', 'В другом хранилище'),
    ...(failedRead ? { 'vaults/main/notes/Входящие/unreadable.md': 'unreadable' } : {}),
  } });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const counts = () => page.evaluate(() => {
    const state = (window as unknown as { feedTest: { reads: { path: string }[]; writes: string[] } }).feedTest;
    return { reads: state.reads.map(read => read.path), writes: state.writes };
  });
  const release = (index: number) => page.evaluate((index) => {
    (window as unknown as { feedTest: { reads: Array<{ release: () => void }> } }).feedTest.reads[index].release();
  }, index);
  await expect(page.getByTestId('feed-list-container')).toBeVisible();
  await expect.poll(async () => (await counts()).reads).toContain('vaults/main/notes/Входящие/main.md');
  expect((await counts()).writes).toEqual([]);
  if (failedRead) {
    await release(0);
    await expect(page.locator('#item-main-task')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Сегодня', exact: true })).toHaveCount(0);
    expect((await counts()).writes).toEqual([]);
    return;
  }
  await page.evaluate(async () => {
    const modulePath = '/src/lib/storage/index.ts';
    const { storage } = await import(/* @vite-ignore */ modulePath);
    storage.switchVault('other');
    storage.switchVault('default_vault');
    window.dispatchEvent(new CustomEvent('slag-sync-updated', { detail: { hasItemsChanged: true } }));
  });
  await expect.poll(async () => (await counts()).reads.filter(p => p === 'vaults/main/notes/Входящие/main.md').length).toBeGreaterThanOrEqual(2);
  const list = (await counts()).reads;
  await release(list.lastIndexOf('vaults/main/notes/Входящие/main.md'));
  await expect(page.getByRole('region', { name: 'Сегодня', exact: true }).locator('#item-main-task')).toBeVisible();
  await release(list.indexOf('vaults/main/notes/Входящие/main.md'));
  await expect.poll(async () => (await counts()).writes.length).toBe(1);
  expect((await counts()).writes[0]).toContain('vaults/main/notes/');
  await expect(page.locator('#item-other-task')).toHaveCount(0);
});
