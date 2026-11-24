import { test, expect } from '@playwright/test';
import { BROKEN_STATE, FIXTURE_REGISTRY, installRecoveryFixture, RECOVERY_ROOT, RECOVERY_RELAY } from '../support/vaultRecoveryFixture';

const root = RECOVERY_ROOT;
const newNote = 'Локальная запись после сбоя';

async function expectPausedWithUnknownQueue(page: import('@playwright/test').Page, lostRegistry: boolean) {
  const sync = page.getByTestId('sidebar-sync-btn');
  await expect(sync).toHaveAttribute('data-sync-state', 'error');
  await sync.focus();
  await page.getByTestId('sidebar-sync-open-health').click();
  const report = page.getByTestId('vault-health-report');
  await expect(report.getByText('журнал реестра не подтверждён; обмен остановлен')).toBeVisible();
  await expect(report.locator('dt:text-is("Очередь пакетов") + dd')).toHaveText('неизвестно');
  await expect(report.locator('dt:text-is("Очередь реестра") + dd')).toHaveText(lostRegistry ? 'неизвестно' : '0');
}

async function itemCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const url = '/src/lib/storage/index.ts';
    const { storage } = await import(/* @vite-ignore */ url);
    return storage.getItems().length;
  });
}

test('locked note does not disappear from the disk watcher or look new after unlock', async ({ page }) => {
  await page.route('**/watch-fixture.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto('/watch-fixture.html');
  const events = await page.evaluate(async () => {
    const url = '/src/lib/storage/vaultWatch.ts';
    const { startVaultWatch } = await import(/* @vite-ignore */ url);
    const notesPath = 'vaults/fixture/notes';
    const note = { isFile: true, isDirectory: false };
    const folder = { isFile: false, isDirectory: true };
    const changes: { sweep: number; changed: string[]; removed: string[]; foldersAdded: string[]; foldersRemoved: string[] }[] = [];
    let sweeps = 0;
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (cmd: string, { path }: { path: string }) => {
      const denied = () => new Error('Access denied (os error 5)');
      if (cmd === 'plugin:fs|read_dir') {
        if (path === notesPath) {
          sweeps++;
          if (sweeps === 9) finish();
          return [{ name: 'sibling.md', ...note }, ...(sweeps < 7
            ? [{ name: 'keep', ...folder }, { name: 'kept.md', ...note }] : [])];
        }
        if (path === `${notesPath}/keep`) {
          if (sweeps >= 2 && sweeps <= 4) throw denied();
          return [{ name: 'nested', ...folder }];
        }
        if (path === `${notesPath}/keep/nested`) return [{ name: 'child.md', ...note }];
      }
      if (cmd === 'plugin:fs|stat') {
        if (path.endsWith('/kept.md') && sweeps >= 2 && sweeps <= 4) throw denied();
        return { size: 9, mtime: path.endsWith('/sibling.md') && sweeps >= 3 ? 2000 : 1000, isFile: true };
      }
      throw new Error(`Unexpected fixture command ${cmd} ${path}`);
    } } });
    const watch = await startVaultWatch({ notesPath, intervalMs: 20,
      onChanged: (change: Omit<(typeof changes)[number], 'sweep'>) => changes.push({ sweep: sweeps, ...change }),
    });
    try { await finished; } finally { watch.stop(); }
    return changes;
  });
  expect(events).toEqual([
    { sweep: 3, changed: ['sibling.md'], removed: [], foldersAdded: [], foldersRemoved: [] },
    { sweep: 8, changed: [], removed: ['keep/nested/child.md', 'kept.md'], foldersAdded: [], foldersRemoved: ['keep', 'keep/nested'] },
  ]);
});

test('damaged state opens the same 106 notes and saved changes survive two restarts', async ({ page, baseURL }) => {
  const disk = await installRecoveryFixture(page, baseURL!);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Заметка проверки 1', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => itemCount(page)).toBe(106);
  await expect(page.getByText('Удалённая не возвращается')).toHaveCount(0);
  expect(disk.firstNoteWrites()).toEqual([]);

  const composer = page.locator('main textarea').first();
  await composer.fill(newNote);
  await composer.press('Enter');
  const created = page.locator('[data-flip-id]').filter({ hasText: newNote }).first();
  await expect(created).toBeVisible();
  await expect(composer).toHaveValue('');
  expect(disk.firstNoteWrites()).toHaveLength(1);

  await page.locator('[id^="item-"]').filter({ hasText: newNote }).first().click({ button: 'right', timeout: 5000 });
  await page.getByRole('button', { name: 'Фокус-редактор' }).click({ timeout: 5000 });
  const editor = page.getByTestId('fullscreen-editor-modal');
  await expect(editor).toBeVisible();
  const tags = editor.getByTestId('editor-tag-input');
  await tags.fill('после-сбоя');
  await tags.press('Enter');
  await expect.poll(() => [...disk.files].some(([path, text]) => path.endsWith('.md') && text.includes(newNote) && text.includes('после-сбоя'))).toBe(true);

  for (let restart = 0; restart < 2; restart++) {
    await page.reload();
    await expect(page.locator('[data-flip-id]').filter({ hasText: newNote }).first()).toBeVisible();
    await expect.poll(() => itemCount(page)).toBe(107);
    await expect.poll(() => page.evaluate(async (text) => {
      const url = '/src/lib/storage/index.ts';
      const { storage } = await import(/* @vite-ignore */ url);
      return storage.getItems().find((item: { content: string }) => item.content.includes(text))?.tags;
    }, newNote)).toContain('после-сбоя');
  }
  expect([...disk.files.entries()].some(([path, text]) => path.startsWith(`${root}/`) && text === BROKEN_STATE)).toBe(true);
  expect(disk.files.get(`${root}/note-registry.json`)).toBe(FIXTURE_REGISTRY);
  expect(disk.attempts).toEqual([]);
  await page.screenshot({ path: 'test-results/screenshots/vault-self-recovery.png' });
});

test('a failed native Markdown write does not clear input or confirm it', async ({ page, baseURL }) => {
  const disk = await installRecoveryFixture(page, baseURL!);
  await page.goto('/');
  await expect(page.getByText('Заметка проверки 1', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  disk.rejectWritesTo((path) => path.startsWith(`${root}/notes/`) && path.endsWith('.md'));
  const composer = page.locator('main textarea').first();
  await composer.fill(newNote);
  await composer.press('Enter');
  await expect(page.getByText(/не удалось.*(?:сохранить|записать)/i).first()).toBeVisible();
  await expect(composer).toHaveValue(newNote);
  expect(disk.firstNoteWrites()).toEqual([]);
  expect(disk.attempts).toEqual([]);

  disk.allowWrites();
  await composer.press('Enter');
  await expect(composer).toHaveValue('');
  await expect.poll(() => disk.firstNoteWrites()).toHaveLength(1);
  await page.reload();
  await expect(page.getByText(newNote, { exact: true }).first()).toBeVisible();
  await expect.poll(() => itemCount(page)).toBe(107);
});

test('healthy legacy binding migrates once without replacing the device or queue', async ({ page, baseURL }) => {
  const disk = await installRecoveryFixture(page, baseURL!);
  disk.files.delete(`${root}/note-registry.json`);
  const config = { serverUrl: RECOVERY_RELAY, deviceId: 'fixture-device', enabled: false, autoSync: false };
  const outbox = [{ opId: 'fixture-op', id: 'note-archived', kind: 'item', action: 'delete', timestamp: 1000 }];
  disk.files.set(`${root}/state.json`, JSON.stringify({ sync: { config, outbox, tombstones: { 'note-archived': 1000 } } }));
  await page.goto('/');
  await expect.poll(() => disk.files.get(`${root}/sync-ledger.json.fixture-generation`)).toBeDefined();
  await expect.poll(() => disk.files.get(`${root}/state.json`)).toContain('"protectedSync":true');
  const ledger = JSON.parse(disk.files.get(`${root}/sync-ledger.json.fixture-generation`)!);
  const binding = JSON.parse(disk.files.get(`${root}/sync-config.json.fixture-generation`)!);
  expect(ledger).toMatchObject({ vaultId: 'default_vault', value: { outbox, tombstones: { 'note-archived': 1000 } } });
  expect(binding.value).toMatchObject(config);
  expect(binding.value).not.toHaveProperty('seedPhrase');
  expect(JSON.parse(disk.files.get(`${root}/state.json`) ?? '{}')).not.toHaveProperty('sync');
  await page.reload();
  await expect.poll(() => itemCount(page)).toBe(106);
  expect(disk.files.get(`${root}/sync-ledger.json.fixture-generation`)).toBe(JSON.stringify(ledger));
  expect(disk.attempts).toEqual([]);

  // An unrelated settings failure no longer takes the exact delivery state with it.
  disk.files.set(`${root}/state.json`, BROKEN_STATE);
  await page.reload();
  await expect.poll(() => disk.files.get(`${root}/state.json`)).toContain('"protectedSync":true');
  await expect.poll(() => itemCount(page)).toBe(106);
  expect(disk.files.has(`${root}/recovery-local-only.json`)).toBe(false);
  expect(disk.files.get(`${root}/sync-ledger.json.fixture-generation`)).toBe(JSON.stringify(ledger));
  await expect(page.getByTestId('sidebar-sync-btn')).toHaveAttribute('data-sync-state', 'idle');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const lostFiles of [
  ['note-registry.json'], ['sync-ledger.json'], ['sync-config.json'],
  ['sync-config.json', 'note-registry.json'],
] as const) {
  const compound = lostFiles.length > 1;
  test(`${lostFiles.join(' + ')}: a failed generation pauses transport but leaves local writing usable`, async ({ page, baseURL }) => {
    const disk = await installRecoveryFixture(page, baseURL!);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const binding = { serverUrl: RECOVERY_RELAY, deviceId: 'fixture-device', enabled: true, autoSync: true, syncId: 'fixture-vault' };
    const outbox = [{ opId: 'fixture-op', id: 'note-archived', kind: 'item', action: 'delete', timestamp: 1000 }];
    const envelope = (value: unknown) => JSON.stringify({ version: 1, vaultId: 'default_vault', value });
    const generations = [
      [`${root}/sync-config.json.fixture-generation`, envelope(binding)],
      [`${root}/sync-ledger.json.fixture-generation`, envelope({ registryRequired: true, outbox,
        ...(compound && { pendingFolderProjection: { 'recovery-note-2': true } }),
      })],
      [`${root}/note-registry.json.fixture-generation`, FIXTURE_REGISTRY],
    ] as const;
    for (const [path, value] of generations) disk.files.set(path, value);
    disk.files.set(`${root}/state.json`, compound ? BROKEN_STATE : '{"protectedSync":true}');
    for (const file of lostFiles) disk.damageGeneration(file);

    await page.goto('/');
    await expect(page.getByText('Заметка проверки 1', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    if (compound) {
      // The only physical copy can be an intermediate result; no duplicate is needed to make it unsafe.
      await expect.poll(() => itemCount(page)).toBe(105);
      const updated = await page.evaluate(async () => {
        const url = '/src/lib/storage/index.ts';
        const { storage } = await import(/* @vite-ignore */ url);
        return storage.reloadFromDisk({ changed: ['Входящие/recovery-note-2.md'], removed: [] });
      });
      expect(updated).toEqual({ updated: 0, removed: 0 });
      expect(disk.files.get(`${root}/notes/Входящие/recovery-note-2.md`)).toContain('Заметка проверки 2');
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const composer = page.locator('main textarea').first();
    await composer.fill(newNote);
    await composer.press('Enter');
    await expect(composer).toHaveValue('');
    await expect(page.locator('[data-flip-id]').filter({ hasText: newNote }).first()).toBeVisible();
    await expect.poll(() => disk.firstNoteWrites()).toHaveLength(1);

    await page.reload();
    await expect(page.locator('[data-flip-id]').filter({ hasText: newNote }).first()).toBeVisible();
    await expect.poll(() => itemCount(page)).toBe(compound ? 106 : 107);
    await expectPausedWithUnknownQueue(page, lostFiles.some((file) => file === 'note-registry.json'));
    expect(disk.files.get(`${root}/recovery-local-only.json`)).toBe('{"version":1,"reason":"registry"}');
    for (const [path, value] of generations) expect(disk.files.get(path)).toBe(value);
    expect(disk.attempts).toEqual([]);
  });
}
