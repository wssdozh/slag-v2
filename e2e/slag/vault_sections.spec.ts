import { test, expect } from '../support/selfhostFixture';

const SHOT_DIR = 'test-results/screenshots';

/**
 * «Хранилище & Бэкапы» used to be five unrelated groups in one scroll. Now its three blocks sit
 * under the tab the way subfolders sit under a folder: the desktop rail opens them as nested
 * items, the phone folds them in place. Either way it is a view change and nothing else — no
 * snapshot is started and the chosen block survives a detour to another tab.
 */
test('the rail nests the vault blocks and switches between them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();

  const storage = scope.getByTestId('vault-section-storage');
  await expect(storage.getByTestId('storage-usage')).toBeVisible();
  await expect(scope.getByTestId('vault-subtab-storage')).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sections-vault.png` });

  // The nested items live in the rail, and «бэкапы» is one click away from anywhere in the tab.
  const backupsItem = scope.getByTestId('vault-subtab-backups');
  await expect(backupsItem).toBeVisible();
  await backupsItem.click();
  const backups = scope.getByTestId('vault-section-backups');
  await expect(backups.getByTestId('btn-create-snapshot')).toBeVisible();
  await expect(storage).toHaveCount(0);
  const before = await backups.locator('[data-testid^="snapshot-item-"]').count();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOT_DIR}/sections-backups.png` });
  await expect(backups.locator('[data-testid^="snapshot-item-"]')).toHaveCount(before);

  // «перенос»: export, import, the files on disk.
  await scope.getByTestId('vault-subtab-transfer').click();
  await expect(scope.getByTestId('vault-section-transfer').getByTestId('btn-export-zip')).toBeVisible();

  // The picked block survives a detour to another tab.
  await scope.locator('[data-tab="account"]').click();
  await scope.locator('[data-tab="vault"]').click();
  await expect(scope.getByTestId('vault-section-transfer')).toBeVisible();
});

test('the phone folds the vault blocks in place', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
  await expect(page.getByTestId('mobile-settings-root')).toBeVisible();
  await page.getByTestId('mobile-settings-vault').click();

  const fold = page.getByTestId('vault-subtab-backups');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('vault-section-backups').getByTestId('btn-create-snapshot')).toBeVisible();
});
