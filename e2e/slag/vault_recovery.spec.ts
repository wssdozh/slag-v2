import { expect, test, type Page } from '@playwright/test';

const statePath = 'vaults/main/state.json';
const healthy = JSON.stringify({ migrations: { legacyAt: 1 }, sync: { config: { enabled: false }, outbox: [] } });

declare global {
  interface Window {
    recoveryFixture: { files: Map<string, string>; mutations: string[] };
  }
}

async function openVault(page: Page, state: string | null, registry?: string) {
  const outbound: string[] = [];
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).origin === 'http://127.0.0.1:' + (process.env.SLAG_E2E_PORT || '5173')) {
      await route.continue();
    } else {
      outbound.push(route.request().method());
      await route.abort();
    }
  });
  await page.routeWebSocket('**/*', socket => {
    if (new URL(socket.url()).host === `127.0.0.1:${process.env.SLAG_E2E_PORT || '5173'}`) socket.connectToServer();
    else outbound.push('WebSocket');
  });
  await page.addInitScript(({ state, statePath, registry }) => {
    const vault = { id: 'default_vault', name: 'main', mode: 'tauri' };
    const files = new Map<string, string>([
      ['settings.json', JSON.stringify({ slag_current_vault_v2: JSON.stringify(vault), slag_vaults_v2: JSON.stringify([vault]), legacy_profile_imported: 'done' })],
    ]);
    if (state !== null) files.set(statePath, state);
    if (registry !== undefined) files.set('vaults/main/note-registry.json', registry);
    for (let i = 1; i <= 106; i++) {
      files.set(`vaults/main/notes/Входящие/recovery-${i}.md`, `---\nid: recovery-${i}\ntype: note\ntitle: Локальная заметка ${i}\ncreated: 1\nupdated: 2\n---\nИсходный текст ${i}.`);
    }
    const dirs = new Set<string>();
    const mutations: string[] = [];
    window.recoveryFixture = { files, mutations };
    const ipc = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      async invoke(command: string, arg: { path?: string; relativeTarget?: string; newPath?: string; content?: string } = {}, ipc?: { headers: { path: string } }) {
        const pathname = (arg.path ?? arg.relativeTarget ?? arg.newPath ?? decodeURIComponent(ipc?.headers.path ?? '')).replaceAll('\\', '/');
        if (command === 'plugin:fs|exists') return files.has(pathname) || dirs.has(pathname);
        if (command === 'plugin:fs|read_text_file') {
          const text = files.get(pathname);
          if (text === undefined) throw new Error('not found (os error 2)');
          return [...new TextEncoder().encode(text)];
        }
        if (command === 'plugin:fs|read_dir') {
          const prefix = `${pathname}/`;
          return [...new Set([...files.keys(), ...dirs].filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length).split('/')[0]))]
            .map(name => ({ name, isDirectory: !files.has(`${prefix}${name}`), isFile: files.has(`${prefix}${name}`) }));
        }
        if (command === 'plugin:fs|mkdir' || command === 'durable_atomic_write' || command === 'plugin:fs|write_text_file'
            || command === 'plugin:fs|rename' || command === 'plugin:fs|remove') {
          if (pathname.startsWith('vaults/')) mutations.push(`${command}: ${pathname}`);
          if (command === 'plugin:fs|mkdir') dirs.add(pathname);
          if (command === 'durable_atomic_write') files.set(pathname, arg.content ?? '');
        }
        return undefined;
      },
    };
    Object.assign(window, { isTauri: true, __TAURI_INTERNALS__: ipc, __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} } });
  }, { state, statePath, registry });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  return outbound;
}

for (const [name, state, registry] of [
  ['NUL bytes', '\0'.repeat(43_763), undefined],
  ['invalid outbox', '{"sync":{"outbox":[{"broken":true}]}}', undefined],
  ['invalid pending projection', '{"pendingFolderProjection":[]}', undefined],
  ['invalid registry', healthy, '{"version":1,"room":"test","generation":1,"journal":{"pending":null}}'],
  ['missing state in an enrolled vault', null, '{"version":1,"room":"test","generation":1,"journal":{"cursor":0,"confirmed":{},"pending":[]}}'],
] as const) {
  test(`native recovery: ${name} keeps 106 notes visible without writes or relay`, async ({ page }) => {
    if (name === 'NUL bytes') await page.setViewportSize({ width: 1440, height: 900 });
    if (name === 'invalid outbox') {
      await page.setViewportSize({ width: 375, height: 740 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    const outbound = await openVault(page, state, registry);
    await expect(page.getByTestId('vault-recovery')).toContainText('Синхронизация приостановлена', { timeout: 120_000 });
    await expect(page.getByTestId('vault-recovery-count')).toHaveText('Найдено файлов заметок: 106');
    await expect(page.getByTestId('vault-recovery-note')).toHaveCount(106);
    await page.getByTestId('vault-recovery-note').first().click();
    await expect(page.getByTestId('vault-recovery-content')).toContainText('Исходный текст 1.');
    if (name === 'NUL bytes' || name === 'invalid outbox') {
      await page.screenshot({ path: `test-results/screenshots/vault-recovery-${name === 'NUL bytes' ? 'desktop' : 'phone'}.png` });
    }
    await expect(page.getByTestId('feed-list-container')).toHaveCount(0);
    const actual = await page.evaluate((statePath) => ({ state: window.recoveryFixture.files.get(statePath), mutations: window.recoveryFixture.mutations }), statePath);
    expect(actual.mutations).toEqual([]);
    expect(actual.state === (state ?? undefined)).toBe(true);
    expect(outbound).toEqual([]);
  });
}

test('retry stays read-only after the damaged state disappears, but accepts a verified repair', async ({ page }) => {
  await openVault(page, '\0');
  await expect(page.getByTestId('vault-recovery-count')).toContainText('106', { timeout: 120_000 });
  const writeBlocked = await page.evaluate(async () => {
    const modulePath = '/src/lib/storage/index.ts';
    const { storage } = await import(/* @vite-ignore */ modulePath);
    try {
      await storage.files.writeStateSection('sync', { outbox: [] }, storage.getCurrentVault(), true);
      return false;
    } catch (error) {
      return String(error).includes('только для чтения');
    }
  });
  expect(writeBlocked).toBe(true);
  await page.evaluate((path) => window.recoveryFixture.files.delete(path), statePath);
  await page.getByRole('button', { name: 'Проверить снова' }).click();
  await expect(page.getByTestId('vault-recovery-count')).toContainText('106');
  expect(await page.evaluate(() => window.recoveryFixture.mutations)).toEqual([]);
  await page.evaluate(([path, state]) => window.recoveryFixture.files.set(path, state), [statePath, healthy]);
  await page.getByRole('button', { name: 'Проверить снова' }).click();
  await expect(page.getByTestId('vault-recovery')).toHaveCount(0);
  await expect(page.getByTestId('feed-list-container')).toBeVisible({ timeout: 30_000 });
});

test('healthy native state still opens the normal workspace', async ({ page }) => {
  await openVault(page, healthy);
  await expect(page.getByTestId('feed-list-container')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('vault-recovery')).toHaveCount(0);
});
