import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * «состояние» — the fourth block of the vault tab. Two blocks: what the relay knows and what the
 * disk holds. The server half must say it has never been compared in a browser build, and the disk
 * half must say a sweep is a desktop job: pretending either is worse than saying so.
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

  // Two blocks, each with its own switch: a server check nobody can turn off is a check that
  // surprises people, and a comparison claimed without one is a lie.
  await expect(panel).toContainText('Сверка с сервером');
  await expect(panel).toContainText('Это устройство');
  await expect(panel.getByTestId('integrity-server')).toContainText('нет данных');
  await expect(panel.getByTestId('integrity-server-last')).toContainText('ни разу');
  await expect(panel.getByTestId('integrity-autocheck')).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByTestId('integrity-dryrun')).toHaveAttribute('aria-checked', 'true');
  await expect(panel).toContainText('ещё не сверяли');

  // And the explanation is on screen, not in a commit message.
  await expect(panel).toContainText('не чаще раза в 5 секунд');
  await expect(panel).toContainText('одна переотправка');

  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/vault-integrity.png` });

  await panel.getByTestId('integrity-verify').click();
  await expect(section.getByRole('status')).toContainText('доступна в приложении', { timeout: 15000 });
});
