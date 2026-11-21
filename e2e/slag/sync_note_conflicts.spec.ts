import { test, expect } from '../support/selfhostFixture';

test('conflict settings show both versions and require an explicit decision', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });
  await page.evaluate(async () => {
    const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
    const base = { id: 'test-note', type: 'note', title: 'Спорная заметка', folder: 'Входящие' };
    syncEngine.getNoteConflicts = () => [{
      intentId: 'local-intent', noteId: base.id, kind: 'update', revision: 9, fields: ['update'], at: 1,
      currentRevision: 10, currentItem: { ...base, content: 'Подтверждённый текст' },
      item: { ...base, content: 'Локальная правка' },
    }];
    syncEngine.resolveNoteConflict = async (intentId, resolution, revision) => {
      sessionStorage.setItem('test-resolution', JSON.stringify([intentId, resolution, revision]));
      syncEngine.getNoteConflicts = () => [];
      syncEngine.notify();
    };
  });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.locator('[data-tab="sync"]').click();
  await page.getByText('Сравнить версии', { exact: true }).click();
  await expect(page.getByText(/Подтверждённый текст/)).toBeVisible();
  await expect(page.getByText(/"content": "Локальная правка"/)).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/sync-note-conflicts.png' });
  await page.getByRole('button', { name: 'Применить локальную', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Применить локальную', exact: true }).last();
  await expect(page.getByText(/поверх подтверждённой ревизии 10/)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('test-resolution'))).toBeNull();
  await confirm.click();
  await expect(page.getByText('Конфликты синхронизации')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('test-resolution') ?? 'null')))
    .toEqual(['local-intent', 'retry', 10]);
});

test('a folder conflict shows both members and submits one reviewed decision', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });
  await page.evaluate(async () => {
    const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
    const group = { id: 'move-group', size: 2 };
    const note = { id: 'moved-note', title: 'Запись проекта', folder: 'Проекты' };
    const folder = { path: 'Проекты', name: 'Проекты' };
    syncEngine.getNoteConflicts = () => [
      { intentId: 'note-move', noteId: note.id, folderGroup: { ...group, index: 0 }, currentRevision: 12,
        currentItem: note, item: { ...note, folder: 'Архив' } },
      { intentId: 'tree-move', noteId: 'tree-id', folderGroup: { ...group, index: 1 }, currentRevision: 14,
        currentItem: [folder], item: [{ path: 'Архив', name: 'Архив' }] },
    ];
    syncEngine.resolveFolderConflict = async (...decision) => {
      sessionStorage.setItem('folder-resolution', JSON.stringify(decision));
      syncEngine.getNoteConflicts = () => [];
      syncEngine.notify();
    };
  });
  await page.getByTestId('sidebar-settings-btn').click();
  await page.locator('[data-tab="sync"]').click();
  await expect(page.getByText('Папочная операция', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить всю операцию' })).toHaveCount(1);
  const versions = page.getByText('Сравнить версии', { exact: true });
  await versions.nth(0).click();
  await versions.nth(1).click();
  await expect(page.getByText(/"folder": "Архив"/)).toBeVisible();
  await expect(page.getByText(/"path": "Архив"/)).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/sync-folder-conflicts.png' });
  await page.getByRole('button', { name: 'Повторить всю операцию' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('folder-resolution'))).toBeNull();
  await page.getByRole('button', { name: 'Повторить всю операцию' }).last().click();
  await expect(page.getByText('Конфликты синхронизации')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('folder-resolution') ?? 'null')))
    .toEqual(['move-group', 'retry', { 'moved-note': 12, 'tree-id': 14 }]);
});
