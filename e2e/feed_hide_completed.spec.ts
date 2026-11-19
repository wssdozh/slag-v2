import { test, expect } from '@playwright/test';

// "Без готовых" is a session filter. A launch must not reopen with done tasks hidden because
// the switch was flipped on days ago; the chip only shows up after a deliberate toggle.
test.describe('Hide completed tasks stays a session filter', () => {
  test('a launch never starts with done tasks hidden, toggling still works', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header').first()).toBeVisible({ timeout: 120000 });

    const chip = page.locator('header', { hasText: 'Без готовых' });
    await expect(chip).not.toBeVisible();

    await page.locator('header button[aria-label="Вид и фильтры папки"]').click();
    const modal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
    await expect(modal).toBeVisible();
    await modal.getByText('Скрыть выполненные').click();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    // The toggle works inside the session.
    await expect(chip).toBeVisible();
    await page.locator('header').screenshot({ path: 'test-results/screenshots/hide-completed-on.png' });

    // But a fresh launch forgets it.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('header').first()).toBeVisible({ timeout: 120000 });
    await expect(page.locator('header', { hasText: 'Без готовых' })).not.toBeVisible();
    await page.locator('header').screenshot({ path: 'test-results/screenshots/hide-completed-startup.png' });
  });
});
