import { test, expect } from '@playwright/test';
import { setupSlag } from './support/slagSetup';

test.beforeEach(async ({ page }, testInfo) => { await setupSlag(page, testInfo); });

test('expanded composer consumes its original draft after editing and saving', async ({ page }) => {
  const composer = page.locator('main textarea').first();
  await composer.fill('исходный черновик #проверка');
  await page.getByRole('button', { name: 'Раскрыть в полноэкранный редактор', exact: true }).click();
  const editor = page.locator('#fullscreen-editor-root');
  await expect(editor).toBeVisible();
  await editor.locator('.cm-content').fill('изменённый текст после раскрытия');
  await page.waitForTimeout(700); // Outlast the composer's former pending autosave.
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(composer).toHaveValue('');
  await page.reload();
  await expect(page.locator('main textarea').first()).toHaveValue('');
  await page.screenshot({ path: 'test-results/screenshots/triage-draft-saved.png', fullPage: true });
});

test('expanded composer keeps a newer draft created after expand', async ({ page }) => {
  const composer = page.locator('main textarea').first();
  await composer.fill('старый черновик');
  await page.getByRole('button', { name: 'Раскрыть в полноэкранный редактор', exact: true }).click();
  await expect(page.locator('#fullscreen-editor-root')).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = '/src/lib/storage/index.ts';
    const { storage } = await import(modulePath);
    const drafts = storage.getAllComposerDrafts();
    const folder = Object.keys(drafts).find(key => drafts[key].content === 'старый черновик');
    if (!folder) throw new Error('original draft missing');
    storage.saveComposerDraft(folder, { ...drafts[folder], content: 'новый независимый черновик', updatedAt: Date.now() + 1000 }, 'remote');
  });
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(composer).toHaveValue('новый независимый черновик');
});

test('expanded composer cancel keeps edited content and attachments', async ({ page }) => {
  await page.evaluate(async () => {
    const modulePath = '/src/lib/storage/index.ts';
    const { storage } = await import(modulePath);
    storage.saveComposerDraft('Входящие', {
      content: 'черновик с файлом', itemType: 'note', priority: 'none', dueDate: '', tags: [],
      attachments: [{ id: 'draft-file', name: 'draft.txt', type: 'file', mimeType: 'text/plain', size: 1, relativePath: '.attachments/draft.txt' }],
      replyTarget: null, updatedAt: Date.now(),
    }, 'remote');
  });
  const composer = page.locator('main textarea').first();
  await composer.fill('черновик для отмены');
  await page.getByRole('button', { name: 'Раскрыть в полноэкранный редактор', exact: true }).click();
  await page.locator('#fullscreen-editor-root .cm-content').fill('сохранить при отмене');
  await page.keyboard.press('Escape');
  await expect(page.locator('#fullscreen-editor-root')).not.toBeVisible();
  await expect(composer).toHaveValue('сохранить при отмене');
  const attachments = await page.evaluate(async () => {
    const modulePath = '/src/lib/storage/index.ts';
    const { storage } = await import(modulePath);
    return storage.getComposerDraft('Входящие')?.attachments.map((attachment: { id: string }) => attachment.id);
  });
  expect(attachments).toEqual(['draft-file']);
});
