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
    const pill = dock.locator('[data-testid="dock-active-pill"]');
    await expect(pill).toBeVisible();

    await dock.getByRole('button', { name: 'Таски' }).click();

    // The outgoing screen is a snapshot, not a live second tree.
    expect(await page.locator('header').count()).toBe(1);
    await expect(page.locator('h1', { hasText: 'Заметки' })).toHaveCount(0);
    expect(await swaps(page)).toContain('tab-next');

    // Pill stays visible and slides under the active tab
    await expect(pill).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/motion_dock_pill.png' });

    await dock.getByRole('button', { name: /^Папки/ }).click();
    await expect(page.locator('h1', { hasText: 'Заметки' })).toBeVisible();
    expect(await swaps(page)).toEqual(['tab-next', 'tab-prev']);
  });

  test('subtasks accordion expands and collapses smoothly without layout jump', async ({ page }) => {
    await page.locator('button', { hasText: 'Входящие' }).first().click();
    const accordionBtn = page.locator('button[aria-label*="Подзадачи"]').first();
    if (await accordionBtn.count()) {
      await expect(accordionBtn).toBeVisible();
      const accordionContainer = page.locator('.motion-accordion').first();
      await expect(accordionContainer).toHaveAttribute('data-expanded', 'true');
      await accordionBtn.click();
      await expect(accordionContainer).toHaveAttribute('data-expanded', 'false');
      await accordionBtn.click();
      await expect(accordionContainer).toHaveAttribute('data-expanded', 'true');
      await page.screenshot({ path: 'test-results/screenshots/motion_subtasks_accordion.png' });
    }
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

  test('the dock is pinned during a swap instead of being erased by the screen snapshot', async ({ page }) => {
    // The screen snapshot paints above the live page, so a dock without its own
    // group disappears for the whole swap and pops back in — the "blink".
    const pseudos = await page.evaluate(() => new Promise<string[]>(resolve => {
      const dock = document.querySelector('nav[aria-label="Мобильная навигация"]');
      const button = dock?.querySelector<HTMLButtonElement>('[data-tab-id="tasks"]');
      button?.click();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        resolve(document.getAnimations()
          .map(animation => (animation.effect as KeyframeEffect | null)?.pseudoElement ?? '')
          .filter(Boolean));
      }));
    }));

    expect(pseudos).toContain('::view-transition-group(mobile-dock)');
    expect(pseudos.filter(pseudo => pseudo.includes('(root)'))).toEqual([]);
    expect(pseudos).not.toContain('::view-transition-old(mobile-dock)');
  });
});
