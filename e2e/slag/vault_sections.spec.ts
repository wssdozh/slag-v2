import { strFromU8, unzipSync } from 'fflate';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * «Хранилище & Бэкапы» used to be five unrelated groups in one scroll. Now its three blocks sit
 * under the tab the way subfolders sit under a folder: the desktop rail opens them as nested
 * items, the phone folds them in place. Either way it is a view change and nothing else — no
 * snapshot is started and the chosen block survives a detour to another tab.
 */
test('the rail nests the vault blocks and switches between them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();

  const storage = scope.getByTestId('vault-section-storage');
  await expect(storage.getByTestId('storage-usage')).toBeVisible();
  await expect(scope.getByTestId('vault-subtab-storage')).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sections-vault.png` });

  // The nested items live in the rail, and «бэкапы» is one click away from anywhere in the tab.
  const backupsItem = scope.getByTestId('vault-subtab-backups');
  await expect(backupsItem).toBeVisible();
  await backupsItem.click();
  const backups = scope.getByTestId('vault-section-backups');
  await expect(backups.getByTestId('btn-create-snapshot')).toBeVisible();
  await expect(storage).toHaveCount(0);
  const before = await backups.locator('[data-testid^="snapshot-item-"]').count();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sections-backups.png` });
  await expect(backups.locator('[data-testid^="snapshot-item-"]')).toHaveCount(before);

  // «перенос»: export, import, the files on disk.
  await scope.getByTestId('vault-subtab-transfer').click();
  await expect(scope.getByTestId('vault-section-transfer').getByTestId('btn-export-zip')).toBeVisible();

  // The picked block survives a detour to another tab.
  await scope.locator('[data-tab="account"]').click();
  await scope.locator('[data-tab="vault"]').click();
  await expect(scope.getByTestId('vault-section-transfer')).toBeVisible();
});

test('the phone folds the vault blocks in place', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByRole('button', { name: 'Назад к папкам' }).click();
  await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
  await expect(page.getByTestId('mobile-settings-root')).toBeVisible();
  await page.getByTestId('mobile-settings-vault').click();

  const fold = page.getByTestId('vault-subtab-backups');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('vault-section-backups').getByTestId('btn-create-snapshot')).toBeVisible();
});

test('Android migration export preserves live and trash files without credentials', async ({ page }) => {
  // One in-memory app bundle avoids the Windows dev optimizer and still renders the actual row.
  const built = await build({ configFile: false, logLevel: 'error', plugins: [tailwindcss()],
    resolve: { alias: { '@': `${process.cwd()}/src` } }, oxc: { jsx: { runtime: 'automatic' } },
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, lib: { entry: 'e2e/support/migrationExportEntry.tsx', formats: ['es'] }, rolldownOptions: { output: { codeSplitting: false } } },
  });
  const outputs = (Array.isArray(built) ? built : [built]).flatMap((part) => 'output' in part ? part.output : []);
  const bundle = outputs.find((part) => part.type === 'chunk');
  const css = outputs.find((part) => part.type === 'asset' && part.fileName.endsWith('.css'));
  await page.route('**/migration-fixture', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>${css?.source ?? ''}</style><div id="root" class="p-4"></div>` }));
  await page.route('**/migration-fixture.mjs', (route) => route.fulfill({ contentType: 'text/javascript', body: bundle!.code }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/migration-fixture');
  await page.evaluate(async () => {
    const { storage, syncEngine, saveCursor, saveOutbox, saveTombstones, renderTransfer } = await import('/migration-fixture.mjs');
    const vault = storage.getCurrentVault();
    const roots = [storage.getVaultNotesPath(), storage.files.getVaultTrashPath(), storage.getVaultAttachmentsPath()];
    const texts = ['live bytes', 'trash bytes', 'media bytes'];
    const names = ['test.md', 'old.md', 'test.webp'];
    syncEngine.activeRoomId = 'migration-test-room';
    syncEngine.currentVaultId = vault.id;
    syncEngine.config.deviceId = 'test-device';
    syncEngine.config.seedPhrase = 'must-not-leak';
    saveCursor(syncEngine.bookkeeping, 42);
    saveTombstones(syncEngine.bookkeeping, { old: 123 });
    saveOutbox(vault.id, [{ opId: 'op', kind: 'item', action: 'delete', id: 'queued', timestamp: 1 }]);
    const statePath = storage.files.getVaultStatePath(vault);
    Object.defineProperty(navigator, 'userAgent', { value: 'Android migration test', configurable: true });
    Object.defineProperty(window, 'isTauri', { value: true, configurable: true });
    const target = window as unknown as { migrationZip: number[]; migrationReads: number; __TAURI_INTERNALS__: unknown };
    target.migrationReads = 0;
    target.__TAURI_INTERNALS__ = { invoke: async (cmd: string, arg: { path?: string } | Uint8Array, ipc?: { headers: Record<string, string> }) => {
      const path = 'path' in arg ? arg.path : undefined;
      if (cmd === 'plugin:fs|exists') return true;
      if (cmd === 'plugin:fs|read_dir') return [{ name: names[roots.indexOf(path ?? '')], isDirectory: false, isFile: true, isSymlink: false }];
      if (cmd === 'plugin:fs|read_text_file' && path === statePath) return [...new TextEncoder().encode('{"drafts":{"fullscreen":{}}}')];
      if (cmd === 'plugin:fs|read_file') {
        target.migrationReads++;
        return [...new TextEncoder().encode(texts[roots.findIndex((root) => path?.startsWith(root + '/'))])];
      }
      if (cmd === 'plugin:android-fs|show_save_file_picker') return { uri: 'content://fixture/migration.zip' };
      if (cmd === 'plugin:android-fs|write_file') {
        if (ipc?.headers['tpafs-cmd-type'] === 'Open') return { id: 1, supportsRawIpcRequestBody: true };
        if (ipc?.headers['tpafs-cmd-type'] === 'Write' && arg instanceof Uint8Array) target.migrationZip = [...arg];
        return;
      }
      throw new Error(`Unexpected IPC ${cmd}`);
    } };
    renderTransfer();
  });
  const button = page.getByTestId('btn-export-migration');
  await expect(button).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/migration-export-android.png` });
  await button.click();
  await expect(page.getByText('Снимок синхронизации сохранён')).toBeVisible();
  const result = await page.evaluate(() => {
    const { migrationZip, migrationReads } = window as unknown as { migrationZip: number[]; migrationReads: number };
    return { migrationZip, migrationReads };
  });
  const archive = unzipSync(new Uint8Array(result.migrationZip));
  expect(result.migrationReads).toBe(6);
  expect(Object.keys(archive).sort()).toEqual(['.attachments/test.webp', '.trash/old.md', 'notes/test.md', 'slag-migration.json']);
  expect(strFromU8(archive['notes/test.md'])).toBe('live bytes');
  expect(strFromU8(archive['.trash/old.md'])).toBe('trash bytes');
  expect(strFromU8(archive['.attachments/test.webp'])).toBe('media bytes');
  const manifest = strFromU8(archive['slag-migration.json']);
  expect(manifest).not.toContain('must-not-leak');
  expect(JSON.parse(manifest)).toMatchObject({ deviceId: 'test-device', room: 'migration-test-room', cursor: 42, tombstones: { old: 123 }, pendingIds: ['queued'] });
  await expect(page.evaluate(async (bytes) => {
    const { backupService } = await import('/migration-fixture.mjs');
    return backupService.restoreFromZip(new Uint8Array(bytes));
  }, result.migrationZip)).rejects.toThrow('Это снимок для перехода на реестр');
});
