import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * Two rules the dialog frame has to keep: the actions strip is the same surface as the body
 * (only a hairline separates them, it must not read as a second header), and the search
 * palette ends on its results instead of a strip of keyboard hints.
 */
test('the dialog footer shares the body surface', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="notifications"]') });
  await scope.locator('[data-tab="notifications"]').click();
  await scope.getByTestId('quiet-hours-from').click();

  const picker = page.locator('.fixed.z-50').filter({ has: page.getByTestId('time-picker-hour') });
  await expect(picker.getByTestId('time-picker-hour')).toBeVisible();

  const surfaces = await picker.evaluate((root) => {
    const apply = root.querySelector('[data-testid="time-picker-apply"]');
    const footer = apply?.parentElement?.parentElement ?? null;
    const dialog = footer?.parentElement ?? null;
    if (!footer || !dialog) return null;
    return {
      footer: getComputedStyle(footer).backgroundColor,
      dialog: getComputedStyle(dialog).backgroundColor,
    };
  });
  expect(surfaces).not.toBeNull();
  // Transparent is fine: the footer then shows the dialog's own surface. What it must not do
  // is paint the panel colour the header uses.
  expect(['rgba(0, 0, 0, 0)', surfaces!.dialog]).toContain(surfaces!.footer);
  expect(surfaces!.footer).not.toBe('rgb(22, 22, 22)');

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/notify-time-picker.png` });

  // «готово» is the only thing that writes: pick 07 minutes and apply.
  await picker.getByTestId('time-picker-minute-7').click();
  await picker.getByTestId('time-picker-apply').click();
  await expect(picker).toBeHidden();
  await expect(scope.getByTestId('quiet-hours-from')).toHaveText(/:07$/);

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/notify-quiet-desktop.png` });
});

test('the search palette ends on its results', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder('Поиск по заметкам');
  await expect(input).toBeVisible();

  await expect(page.getByText('Orama Hybrid Engine')).toHaveCount(0);
  await expect(page.getByText('↑↓ Навигация')).toHaveCount(0);
  await expect(page.getByText('esc Закрыть')).toHaveCount(0);

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/search-nofooter.png` });
});

test('the quiet mode and its picker fit a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
  await expect(page.getByTestId('mobile-settings-root')).toBeVisible();
  await page.getByTestId('mobile-settings-notifications').click();

  const from = page.getByTestId('quiet-hours-from');
  await expect(from).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/notify-quiet-mobile.png` });

  await from.click();
  const picker = page.locator('.fixed.z-50').filter({ has: page.getByTestId('time-picker-hour') });
  await expect(picker.getByTestId('time-picker-hour')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/notify-time-picker-mobile.png` });
});
