import { test, expect } from '@playwright/test';

test.describe('Поиск: кириллица и опечатки', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('находит русскую заметку и терпит одну опечатку', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(input).toBeVisible();

    const dialog = page.locator('[role="dialog"]').first();
    const title = dialog.getByText('Обновить резюме и портфолио проектов');

    await input.fill('портфолио');
    await expect(title).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/search-cyrillic.png' });

    await input.fill('партфолио');
    await expect(title).toBeVisible();
  });

  test('новая заметка попадает в индекс без полной перестройки', async ({ page }) => {
    // Build the index once, so the second open goes through the incremental sync.
    await page.keyboard.press('Control+k');
    const input = page.locator('input[placeholder*="Поиск по заметкам"]');
    await expect(input).toBeVisible();
    await input.fill('портфолио');
    await expect(page.locator('[role="dialog"]').first().getByText('Обновить резюме и портфолио проектов')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(input).toBeHidden();

    const composer = page.locator('.composer-surface').first();
    await composer.locator('textarea').fill('Криптослон');
    await composer.getByTitle('Отправить (Enter)', { exact: true }).click();
    await expect(page.getByText('Криптослон').first()).toBeVisible();

    await page.keyboard.press('Control+k');
    await expect(input).toBeVisible();
    await page.waitForTimeout(500); // modal debounces index sync by 200ms
    await input.fill('криптослон');
    await expect(page.locator('[role="dialog"]').first()).toContainText('Криптослон');
  });
});
