import { test, expect } from '@playwright/test';
import { setupSlag } from './support/slagSetup';

test('markdown composer consumes the expanded draft without restoring a duplicate', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('slag:composer-engine', 'markdown'));
  await setupSlag(page, testInfo);
  const composer = page.locator('[data-composer-editor] .cm-content').first();
  await composer.fill('исходный markdown черновик');
  await page.getByRole('button', { name: 'Раскрыть в полноэкранный редактор', exact: true }).click();
  const editor = page.locator('#fullscreen-editor-root');
  await expect(editor).toBeVisible();
  await editor.locator('.cm-content').fill('изменённый markdown черновик');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const documentText = () => composer.evaluate(async element => {
    const modulePath = '/node_modules/.vite/deps/@codemirror_view.js';
    const { EditorView } = await import(modulePath);
    return EditorView.findFromDOM(element)?.state.doc.toString();
  });
  await expect.poll(documentText).toBe('');
  await page.reload();
  await expect.poll(documentText).toBe('');
  await page.screenshot({ path: 'test-results/screenshots/consolidate-draft-cm.png', fullPage: true });
});
