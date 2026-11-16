import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * «Хранилище & Бэкапы» used to be five unrelated groups in one scroll. It is now three
 * subsections behind one switch — the disk, the backups, the way out — and that switch must
 * be a view change and nothing else: no snapshot is started, the already-collected usage is
 * not recounted, and the subsection the user picked survives a detour to another tab.
 */
test('vault subsections switch without losing state or starting backups', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();

  const storage = scope.getByTestId('vault-section-storage');
  const backups = scope.getByTestId('vault-section-backups');
  const transfer = scope.getByTestId('vault-section-transfer');

  // Opens on «хранилище»: the footprint and the folders, no backup control in sight.
  await expect(storage).toBeVisible();
  await expect(storage.getByTestId('storage-usage')).toBeVisible();
  await expect(backups).toBeHidden();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sections-vault.png` });

  // «бэкапы»: the autobackup switch and the restore points. Switching starts nothing.
  await scope.getByRole('button', { name: 'бэкапы' }).click();
  await expect(backups).toBeVisible();
  await expect(storage).toBeHidden();
  await expect(backups.getByTestId('btn-create-snapshot')).toBeVisible();
  const before = await backups.locator('[data-testid^="snapshot-item-"]').count();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sections-backups.png` });
  await expect(backups.locator('[data-testid^="snapshot-item-"]')).toHaveCount(before);

  // «перенос»: export, import, the files on disk.
  await scope.getByRole('button', { name: 'перенос' }).click();
  await expect(transfer).toBeVisible();
  await expect(transfer.getByTestId('btn-export-zip')).toBeVisible();

  // The picked subsection is not thrown back to «хранилище» after a detour.
  await scope.locator('[data-tab="account"]').click();
  await scope.locator('[data-tab="vault"]').click();
  await expect(transfer).toBeVisible();
});
