import { test, expect } from '@playwright/test';

test.describe('Mobile Unified Folder Header & Filters in Modal', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true,
  });

  test('Unified single-line header with vertical 3-dots, filter modal, active filter badge in header and 1-click dismiss', async ({ page }) => {
    // 1. Open app
    await page.goto('/');
    await page.waitForSelector('header');

    // 2. Open folder "Входящие"
    const inboxBtn = page.locator('button', { hasText: 'Входящие' }).first();
    await inboxBtn.click();

    // 3. Verify single clean header without extra filter ribbons
    const header = page.locator('header').first();
    await expect(header).toBeVisible();

    // Verify vertical 3-dots button is present
    const dotsBtn = page.locator('header button[aria-label="Вид и фильтры папки"]');
    await expect(dotsBtn).toBeVisible();

    await expect(dotsBtn.locator('[data-icon="action.more"]')).toBeVisible();
    await expect(dotsBtn).toHaveText('');

    // Verify old segmented filter bars are NOT rendered on the screen
    await expect(page.locator('div[aria-label="Фильтр входящих"]')).not.toBeVisible();
    await expect(page.locator('div[aria-label="Фильтр по типу"]')).not.toBeVisible();

    // 4. Capture initial clean folder screenshot
    await page.screenshot({
      path: 'test-results/screenshots/mobile_unified_folder_clean.png',
      fullPage: false,
    });

    // 5. Click vertical 3-dots button to open FolderViewModal
    await dotsBtn.click();

    const modal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
    await expect(modal).toBeVisible();

    // Verify modal content
    await expect(modal.getByRole('group', { name: 'Режим отображения' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Сортировка' })).toBeVisible();
    await expect(modal.getByRole('button', { name: /^Фильтры/ })).toBeVisible();
    const bounds = (await modal.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);

    // Capture screenshot of the modal open on mobile
    await page.screenshot({
      path: 'test-results/screenshots/mobile_folder_view_modal.png',
      fullPage: false,
    });

    // 6. Select "Таски" type filter in modal
    await modal.getByRole('button', { name: /^Фильтры/ }).click();
    const taskFilterBtn = modal.locator('button', { hasText: 'Таски' });
    await expect(taskFilterBtn).toBeVisible();
    await taskFilterBtn.click();

    // Close modal via backdrop click
    await page.mouse.click(20, 20);
    await expect(modal).not.toBeVisible();

    // 7. Verify active filter badge appears in the mobile header
    const taskBadge = page.getByRole('button', { name: 'Сбросить фильтр по типу' });
    await expect(taskBadge).toHaveAttribute('title', /Таски/);

    // Capture screenshot with active filter chip
    await page.screenshot({
      path: 'test-results/screenshots/mobile_unified_folder_with_badge.png',
      fullPage: false,
    });

    // 8. Click dismiss button on the active badge
    const dismissBtn = page.locator('button[aria-label="Сбросить фильтр по типу"]');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // Verify badge disappears
    await expect(dismissBtn).not.toBeVisible();

    // Capture final clean header
    await page.screenshot({
      path: 'test-results/screenshots/mobile_unified_folder_after_reset.png',
      fullPage: false,
    });
  });
});
