import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * «Хранилище & Бэкапы» used to be five unrelated groups in one scroll. Now the tab folds like
 * the sidebar folds its folders — one row per block, the content underneath — and folding is a
 * view change and nothing else: no snapshot is started, the collected usage is not recounted,
 * and the folds the user left open survive a detour to another tab.
 */
test('vault folds open and close without losing state or starting backups', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();

  const storageFold = scope.getByTestId('vault-fold-storage');
  const backupsFold = scope.getByTestId('vault-fold-backups');
  const transferFold = scope.getByTestId('vault-fold-transfer');

  // Opens on «хранилище»: the footprint and the folders, the other two folded away.
  await expect(storageFold).toHaveAttribute('aria-expanded', 'true');
  await expect(scope.getByTestId('vault-section-storage').getByTestId('storage-usage')).toBeVisible();
  await expect(scope.getByTestId('vault-section-backups')).toHaveCount(0);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sections-vault.png` });

  // «бэкапы»: the autobackup switch and the restore points. Opening starts nothing.
  await backupsFold.click();
  await expect(backupsFold).toHaveAttribute('aria-expanded', 'true');
  const backups = scope.getByTestId('vault-section-backups');
  await expect(backups.getByTestId('btn-create-snapshot')).toBeVisible();
  const before = await backups.locator('[data-testid^="snapshot-item-"]').count();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sections-backups.png` });
  await expect(backups.locator('[data-testid^="snapshot-item-"]')).toHaveCount(before);

  // «перенос»: export, import, the files on disk.
  await transferFold.click();
  const transfer = scope.getByTestId('vault-section-transfer');
  await expect(transfer.getByTestId('btn-export-zip')).toBeVisible();

  // Folding a block back is the same view change, and the open folds survive a tab detour.
  await storageFold.click();
  await expect(scope.getByTestId('vault-section-storage')).toHaveCount(0);
  await scope.locator('[data-tab="account"]').click();
  await scope.locator('[data-tab="vault"]').click();
  await expect(scope.getByTestId('vault-section-transfer')).toBeVisible();
  await expect(scope.getByTestId('vault-section-storage')).toHaveCount(0);
});
