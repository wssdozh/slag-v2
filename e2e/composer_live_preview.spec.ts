import { test, expect } from '@playwright/test';

// The composer renders the same CodeMirror the fullscreen editor uses: the caret line stays raw
// markdown, every other line shows its formatting. The rest of the suite drives the plain
// textarea, so these specs opt into the markdown engine explicitly.
async function openComposer(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('slag:composer-engine', 'markdown');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120_000 });
  const editor = page.locator('[data-composer-editor] .cm-editor').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  return editor;
}

test.describe('Composer live preview', () => {
  test('the caret line stays raw while the rest renders', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const editor = await openComposer(page);

    await editor.click();
    await page.keyboard.type('- [ ] первая');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('вторая строка');
    await page.waitForTimeout(300);

    const lines = page.locator('[data-composer-editor] .cm-line');
    await expect(lines).toHaveCount(2);

    // The line without the caret is rendered: its checkbox is a widget, not text.
    await expect(lines.nth(0).locator('input[type="checkbox"]')).toHaveCount(1);
    // The caret line is raw markdown: the source is still in the text, no widget.
    await expect(lines.nth(1)).toContainText('вторая строка');
    await expect(lines.nth(1).locator('input[type="checkbox"]')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/screenshots/composer-live-preview.png' });
  });

  test('enter sends the draft instead of adding a line', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const editor = await openComposer(page);
    const cardsBefore = await page.locator('[id^="item-"]').count();

    await editor.click();
    await page.keyboard.type('Проверка отправки из markdown-композера');
    await page.keyboard.press('Enter');

    await expect
      .poll(async () => page.locator('[id^="item-"]').count(), { timeout: 10_000 })
      .toBe(cardsBefore + 1);
    await expect(page.locator('[data-composer-editor] .cm-line')).toHaveCount(1);
    await expect(page.locator('[data-composer-editor] .cm-editor')).toContainText('Мысль');
  });

  test('hash opens the tag suggestions over the editor', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const editor = await openComposer(page);

    await editor.click();
    await page.keyboard.type('Мысль #');
    await expect(page.getByText('Теги хранилища (#)')).toBeVisible({ timeout: 5_000 });
  });
});
