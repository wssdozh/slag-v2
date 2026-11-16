import { test, expect } from '@playwright/test';

/**
 * В«РҐСЂР°РЅРёР»РёС‰Рµ & Р‘СЌРєР°РїВ» used to be five unrelated groups in one scroll. It is now three
 * subsections behind one switch вЂ” the disk, the backups, the way out вЂ” and that switch must
 * be a view change and nothing else: no snapshot is started, the already-collected usage is
 * not recounted, and the subsection the user picked survives a detour to another tab.
 */

test('vault subsections switch without losing state or starting backups', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('sidebar-settings-btn').click();

  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();

  const usage = scope.getByTestId('storage-usage');
  const snapshots = scope.locator('[data-testid^="snapshot-item-"]');
  const createSnapshot = scope.getByTestId('btn-create-snapshot');

  // The tab opens on В«С…СЂР°РЅРёР»РёС‰РµВ»: the footprint and the folders, no backup control in sight.
  await expect(usage).toBeVisible({ timeout: 30000 });
  await expect(usage.getByTestId('storage-total')).toBeVisible();
  await expect(createSnapshot).toBeHidden();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/sections-vault.png' });

  // В«Р±СЌРєР°РїС‹В»: the autobackup switch and the restore points. Switching does not take a snapshot.
  await scope.getByRole('button', { name: 'Р±СЌРєР°РїС‹' }).click();
  await expect(createSnapshot).toBeVisible();
  const snapshotCount = await snapshots.count();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/sections-backups.png' });

  // В«РїРµСЂРµРЅРѕСЃВ»: both exports and the import door.
  await scope.getByRole('button', { name: 'РїРµСЂРµРЅРѕСЃ' }).click();
  await expect(scope.getByTestId('btn-export-zip')).toBeVisible();
  await expect(scope.getByLabel('Р’РѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ РёР· С„Р°Р№Р»Р° (.zip / .json)')).toBeAttached();

  // Back to В«С…СЂР°РЅРёР»РёС‰РµВ»: the ring still holds the collected numbers, not a fresh В«РЎС‡РёС‚Р°СЋвЂ¦В».
  await scope.getByRole('button', { name: 'С…СЂР°РЅРёР»РёС‰Рµ' }).click();
  await expect(usage.getByTestId('storage-total')).toBeVisible();
  await expect(usage.getByText('РЎС‡РёС‚Р°СЋвЂ¦')).toHaveCount(0);

  // The pick is session memory: another settings tab and back lands on the same subsection.
  await scope.locator('[data-tab="ui"]').click();
  await scope.locator('[data-tab="vault"]').click();
  await expect(usage).toBeVisible();
  await expect(createSnapshot).toBeHidden();

  // Nothing but the button creates snapshots: the round trip added none.
  await scope.getByRole('button', { name: 'Р±СЌРєР°РїС‹' }).click();
  await expect(createSnapshot).toBeVisible();
  expect(await snapshots.count()).toBe(snapshotCount);
});
