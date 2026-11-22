import { test, expect } from '../support/selfhostFixture';

for (const [layout, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
  test(`review sync conflicts on ${layout}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    if (layout === 'mobile') {
      await page.getByTestId('mobile-sync-btn').click({ timeout: 60_000 });
      await page.getByTestId('mobile-sync-open-settings').click();
    } else {
      await page.getByTestId('sidebar-settings-btn').click();
      await page.getByTestId('settings-tab-sync').click();
    }
    await expect(page.getByTestId('sync-refresh-btn')).toBeVisible();
    await expect(page.getByText('Протокол заметок', { exact: true })).toHaveCount(0);
    await page.getByRole('dialog', { name: 'Настройки' }).or(page.getByRole('dialog').filter({ has: page.getByTestId('sync-refresh-btn') })).screenshot({ path: `test-results/screenshots/sync-settings-${layout}.png`, animations: 'disabled' });
    await page.evaluate(async () => {
      const { syncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      const item = { id: 'test-note', type: 'note', title: 'План релиза', content: '1. Проверить сборку\n2. Обновить документацию\n3. Передать на проверку', tags: ['проект'], attachments: [], folder: 'Inbox', createdAt: 1, updatedAt: 1 };
      let latest = 12;
      let closed = false;
      syncEngine.getNoteConflicts = () => closed ? [] : [{ intentId: 'test-intent', noteId: item.id, kind: 'update', fields: ['update'],
        item: { ...item, tags: ['проект', 'на проверке'], content: item.content.replace('2. Обновить документацию', '2. Обновить инструкцию и скриншоты') },
        currentRevision: latest, currentItem: item }];
      syncEngine.resolveNoteConflict = async (_id: string, decision: string, revision: number, content?: string) => {
        if (revision !== latest || (decision !== 'keep' && (decision !== 'retry' || content !== 'Готовый текст'))) throw new Error('Нужна актуальная версия и исправленный текст');
        closed = true;
        syncEngine.notify();
      };
      window.addEventListener('test-revise', () => { latest++; syncEngine.notify(); });
      syncEngine.notify();
    });
    const compare = page.getByRole('button', { name: 'Сравнить', exact: true });
    await compare.click({ timeout: 20_000 });
    const dialog = page.getByRole('dialog', { name: 'Конфликт синхронизации' });
    await expect(dialog.getByText('Теги:', { exact: true })).toBeVisible();
    if (layout === 'mobile') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await dialog.getByRole('button', { name: 'Скопировать текст' }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Обновить документацию');
      await dialog.getByRole('group', { name: 'Версии текста' }).evaluate((tabs) => {
        tabs.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 1, target: tabs, clientX: 250, clientY: 20 })] }));
        tabs.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [new Touch({ identifier: 1, target: tabs, clientX: 70, clientY: 20 })] }));
      });
      await dialog.getByRole('textbox', { name: 'Моя правка' }).fill('Готовый текст');
      await dialog.getByRole('button', { name: 'Версия релея', exact: true }).click();
      await dialog.getByRole('button', { name: 'Моя правка', exact: true }).click();
      await expect(dialog.getByRole('textbox', { name: 'Моя правка' })).toHaveValue('Готовый текст');
      await dialog.screenshot({ path: 'test-results/screenshots/sync-conflict-mobile.png', animations: 'disabled' });
      await page.keyboard.press('Escape');
      await expect(dialog.getByText('Несохранённый текст пропадёт.', { exact: false })).toBeVisible();
      await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    } else {
      await expect(dialog.getByText('Моя правка', { exact: true }).filter({ visible: true })).toBeVisible();
      await dialog.screenshot({ path: 'test-results/screenshots/sync-conflict-desktop.png', animations: 'disabled' });
    }
    if (layout === 'desktop') {
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(compare).toBeFocused();
      await compare.click();
    }
    await page.evaluate(() => window.dispatchEvent(new Event('test-revise')));
    await expect(dialog.getByText('Версия изменилась. Сравнение обновлено.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Проверить новую версию' }).click();
    await dialog.getByRole('button', { name: layout === 'mobile' ? 'Отправить мою правку' : 'Оставить версию релея' }).click();
    await dialog.getByRole('button', { name: 'Подтвердить' }).click();
    await expect(dialog).toBeHidden();
    await expect(compare).toHaveCount(0);
  });
}

test('a folder conflict shows both members and submits one reviewed decision', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });
  await page.evaluate(async () => {
    const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
    const group = { id: 'move-group', size: 2 };
    const note = { id: 'moved-note', type: 'note', title: 'Запись проекта', folder: 'Проекты', content: '', tags: [], attachments: [], createdAt: 1, updatedAt: 1 };
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
  await page.getByRole('button', { name: 'Сравнить', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Конфликт синхронизации' });
  await expect(dialog.getByText('Папка:', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /Дерево папок/ }).click();
  await expect(dialog.getByText(/"path":"Архив"/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Повторить всю операцию' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('folder-resolution'))).toBeNull();
  await dialog.getByRole('button', { name: 'Подтвердить' }).click();
  await expect(page.getByText('Конфликты синхронизации')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('folder-resolution') ?? 'null')))
    .toEqual(['move-group', 'retry', { 'moved-note': 12, 'tree-id': 14 }]);
});
