import { test, expect } from '@playwright/test';

test('admin reviews the sealed seed and refreshes the mode on lost response', async ({ page }) => {
  const roomId = 'room_test_registry';
  let mode = 'legacy';
  const writers = [{ id: 'desktop-test', name: 'Рабочий компьютер' }];
  await page.route('**/api/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'authorization, content-type',
    } });
    const json = (data: object) => route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } });
    if (path === '/api/admin/rooms') return json({ rooms: [{ roomId, vaultId: 'vault_test', bundlesCount: 0, cacheBytes: 0,
      noteStatus: { mode, generation: mode === 'legacy' ? 0 : 1, head: mode === 'registry' ? 1 : 0 },
      noteMigration: true, noteWriters: writers }] });
    if (path.endsWith('/note-freeze')) { mode = 'frozen'; return json({}); }
    if (path.endsWith('/note-activate')) {
      expect(route.request().postDataJSON()).toMatchObject({ generation: 1, confirmRoom: roomId, seed: { room: roomId, writers: ['desktop-test'] } });
      mode = 'registry';
      return route.abort();
    }
    if (path.endsWith('/accounts')) return json({ accounts: [] });
    if (path.endsWith('/stats') && path === '/api/admin/stats') return json({ uptime: 0, dbSizeBytes: 0, activeSessions: 0, totalBundles: 0 });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/?page=admin');
  await page.locator('#admin-server-url').fill(new URL(page.url()).origin);
  await page.locator('#admin-token').fill('test-admin-token');
  await page.locator('button[type="submit"]').click();
  await page.getByTestId('tab-relay').click();
  await page.getByRole('button', { name: 'Подготовить переход' }).click({ timeout: 15_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Подготовить переход' }).click();
  await page.getByRole('button', { name: 'Загрузить пакет' }).click();
  const dialog = page.getByRole('dialog', { name: 'Включить реестр' });
  const seed = { room: roomId, generation: 1, writers: ['desktop-test'], registryMedia: true,
    media: [], ops: [{ opId: 'test-create', noteId: 'a'.repeat(64), kind: 'create', baseRevision: 0,
      sealed: { iv: 'A'.repeat(16), ciphertext: 'A'.repeat(32) } }] };
  await dialog.locator('input[type=file]').setInputFiles({ name: 'seed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await expect(dialog.getByText('Записей реестра: 1.', { exact: false })).toBeVisible();
  await dialog.screenshot({ path: 'test-results/screenshots/admin-note-migration.png' });
  await dialog.getByRole('button', { name: 'Включить реестр' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Ответ релея не получен');
  await expect(dialog.getByRole('status')).toContainText('Реестр · поколение 1');
  await expect(dialog.getByRole('button', { name: 'Включить реестр' })).toBeDisabled();
});
