import { test, expect } from './support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

// The tab must be honest where there is no native backend: a browser build cannot update itself,
// and it must say so instead of rendering a dead button.
test('updates tab explains the browser mode and shows the running version', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="updates"]') });
  await scope.locator('[data-tab="updates"]').click();

  const tab = page.getByTestId('updates-settings');
  await expect(tab).toBeVisible();
  await expect(page.getByTestId('update-web-hint')).toContainText('работает только в приложении');
  await expect(page.getByTestId('update-current-version')).toHaveText('—');
  await expect(page.getByTestId('update-check-btn')).toHaveCount(0);
  await expect(page.getByTestId('update-install-btn')).toHaveCount(0);

  await page.screenshot({ path: `${SHOT_DIR}/updates-tab-1280.png` });
  expect(errors).toEqual([]);
});

test('updates row is reachable from the phone settings list', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
  await expect(page.getByTestId('mobile-settings-root')).toBeVisible();
  await page.getByTestId('mobile-settings-updates').click();

  await expect(page.getByTestId('updates-settings')).toBeVisible();
  await expect(page.getByTestId('update-web-hint')).toBeVisible();
  await page.screenshot({ path: `${SHOT_DIR}/updates-tab-375.png` });
});
