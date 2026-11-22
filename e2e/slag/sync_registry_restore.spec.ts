import { zipSync } from 'fflate';
import { test, expect } from '../support/selfhostFixture';

test('offline registry enrollment blocks JSON and ZIP restore before writes', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('sidebar-settings-btn').click({ timeout: 240_000 });
  await page.getByRole('button', { name: 'Хранилище & Бэкап' }).click();
  await page.getByRole('button', { name: 'перенос', exact: true }).click();
  await page.evaluate(async (zip) => {
    const { storage } = await import('/src/lib/storage/index.ts');
    await storage.writeNoteRegistry({ version: 1, room: 'offline-fixture', generation: 1, journal: { cursor: 0, confirmed: {}, pending: [] } });
    window.verifyBlockedZip = async () => {
      const { backupService } = await import('/src/lib/backupService.ts');
      const before = JSON.stringify(storage.getItems());
      try {
        await backupService.restoreFromZip(Uint8Array.from(zip));
        return false;
      } catch (err) {
        return /отдельное несинхронизируемое/.test(String(err)) && before === JSON.stringify(storage.getItems());
      }
    };
  }, [...zipSync({'restored.md': new Uint8Array([1]) })]);
  await page.getByLabel('Восстановить из файла (.zip / .json)').setInputFiles({
    name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from('{"items":[]}'),
  });
  await expect(page.getByText('Восстановите бэкап в отдельное несинхронизируемое хранилище')).toBeVisible();
  expect(await page.evaluate(() => window.verifyBlockedZip())).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/sync-registry-restore.png' });
});
