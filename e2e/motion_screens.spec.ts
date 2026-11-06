import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Records which direction each swap asked for, at the moment it was started. */
async function watchSwaps(page: Page) {
  await page.addInitScript(() => {
    const original = Document.prototype.startViewTransition;
    (window as unknown as { __swaps: string[] }).__swaps = [];
    if (!original) return;
    Document.prototype.startViewTransition = function (this: Document, callback: () => void) {
      const swaps = (window as unknown as { __swaps: string[] }).__swaps;
      swaps.push(document.documentElement.dataset.motionSwap || '');
      return original.call(this, callback);
    };
  });
}

const swaps = (page: Page) => page.evaluate(() => (window as unknown as { __swaps: string[] }).__swaps);

test.describe('screen swaps on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await watchSwaps(page);
    await page.goto('/');
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15000 });
  });

  test('dock tabs cross-fade and never stack two screens', async ({ page }) => {
    const dock = page.locator('nav[aria-label="Мобильная навигация"]');
    await dock.getByRole('button', { name: 'Таски' }).click();

    // The outgoing screen is a snapshot, not a live second tree.
    expect(await page.locator('header').count()).toBe(1);
    await expect(page.locator('h1', { hasText: 'Заметки' })).toHaveCount(0);
    expect(await swaps(page)).toContain('tab');

    await dock.getByRole('button', { name: /^Папки/ }).click();
    await expect(page.locator('h1', { hasText: 'Заметки' })).toBeVisible();
    expect((await swaps(page)).filter(kind => kind === 'tab')).toHaveLength(2);
  });

  test('a folder pushes in and pops back out', async ({ page }) => {
    await page.locator('button', { hasText: 'Входящие' }).first().click();
    const back = page.locator('header').getByRole('button', { name: 'Папки', exact: true });
    await expect(back).toBeVisible();
    expect(await swaps(page)).toEqual(['push']);

    await page.screenshot({ path: 'test-results/screenshots/motion_folder_push.png' });

    await back.click();
    await expect(page.locator('h1', { hasText: 'Заметки' })).toBeVisible();
    expect(await swaps(page)).toEqual(['push', 'pop']);
  });

  test('the folder info screen is part of the same stack', async ({ page }) => {
    await page.locator('button', { hasText: 'Входящие' }).first().click();
    await page.getByRole('button', { name: 'Информация о папке' }).click();
    await expect(page.getByRole('button', { name: 'Назад' })).toBeVisible();
    expect(await swaps(page)).toEqual(['push', 'push']);

    await page.getByRole('button', { name: 'Назад' }).click();
    expect(await swaps(page)).toEqual(['push', 'push', 'pop']);
  });

  test('without view transitions the screens still switch', async ({ page }) => {
    await page.addInitScript(() => {
      delete (Document.prototype as unknown as { startViewTransition?: unknown }).startViewTransition;
    });
    await page.goto('/');
    await page.locator('button', { hasText: 'Входящие' }).first().click();
    await expect(page.locator('header').getByRole('button', { name: 'Папки', exact: true })).toBeVisible();
    expect(await swaps(page)).toEqual([]);
  });
});
