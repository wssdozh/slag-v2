import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * «состояние» — the fourth block of the vault tab. It has to reach the panel and say honestly that
 * a disk sweep is a desktop job: the browser build has no vault folder to walk, and pretending the
 * vault is clean would be worse than saying so.
 */
test('the vault tab opens the storage state block and it refuses a web sweep', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();

  await scope.getByTestId('vault-subtab-integrity').click();
  const section = scope.getByTestId('vault-section-integrity');
  const panel = section.getByTestId('integrity-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('ещё не сверяли');
  // The room's own line: no engine has run a check in a browser, and saying "сходится" without a
  // comparison would be the same lie the sweep refuses to tell.
  await expect(panel.getByTestId('integrity-remote')).toContainText('сервер: нет данных');

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/vault-integrity.png` });

  await panel.getByTestId('integrity-verify').click();
  await expect(section.getByRole('status')).toContainText('доступна в приложении', { timeout: 15000 });
});
