import { test, expect } from '@playwright/test';

test.describe('Feed surfaces: tone instead of borders, one motion per action', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);
  });

  test('1. cards and composer carry no border', async ({ page }) => {
    const card = page.locator('[data-flip-id]').first();
    await expect(card).toBeVisible();
    const cardBorder = await card.evaluate(el => getComputedStyle(el).borderTopWidth);
    expect(cardBorder).toBe('0px');

    const composer = page.locator('[data-composer-panel]').first();
    const composerBorder = await composer.evaluate(el => getComputedStyle(el).borderTopWidth);
    expect(composerBorder).toBe('0px');

    await page.screenshot({ path: 'test-results/screenshots/feed-without-borders.png' });
  });

  test('2. no corner actions button on desktop, right click still opens the menu', async ({ page }) => {
    await expect(page.locator('button[title="Действия"]')).toHaveCount(0);

    const card = page.locator('[data-flip-id]').first();
    await card.click({ button: 'right' });
    await expect(page.getByText('Удалить', { exact: true })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
  });

  test('3. saving from the editor leaves no ghost draft in the composer', async ({ page }) => {
    const composerTextarea = page.locator('main textarea').first();
    await composerTextarea.fill('Заметка из редактора без призрака');

    await page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first().click();
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5000 });

    await page.locator('header button[aria-label="Создать"]').first().click();
    await expect(page.locator('.cm-content')).toHaveCount(0, { timeout: 5000 });

    await page.waitForTimeout(400);
    await expect(composerTextarea).toHaveValue('');
    await expect(page.locator('[data-flip-id]', { hasText: 'Заметка из редактора без призрака' })).toHaveCount(1);
    await page.screenshot({ path: 'test-results/screenshots/editor-save-no-ghost-draft.png' });
  });

  test('4. deleting a card removes it from the feed', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    const card = page.locator('[data-flip-id]').last();
    const cardId = await card.getAttribute('data-flip-id');
    await card.click({ button: 'right' });
    await page.getByText('Удалить', { exact: true }).click();
    await expect(page.locator(`[data-flip-id="${cardId}"]`)).toHaveCount(0, { timeout: 5000 });
  });
});
