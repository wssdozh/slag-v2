import { test, expect } from '@playwright/test';

test.describe('Backup & Restore System Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('Create snapshot, delete note, and restore vault from snapshot', async ({ page }) => {
    // 1. Accept any browser dialogs (confirm for restore)
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // 2. Create a unique note in composer
    const noteText = `Заметка для бэкапа ${Date.now()}`;
    const composerTextarea = page.locator('main textarea').first();
    await expect(composerTextarea).toBeVisible();
    await composerTextarea.fill(noteText);
    await composerTextarea.press('Enter');

    // Verify note is rendered in feed
    const noteCard = page.locator('.group', { hasText: noteText }).first();
    await expect(noteCard).toBeVisible({ timeout: 5000 });

    // 3. Open Settings modal
    const settingsBtn = page.locator('[data-testid="sidebar-settings-btn"]');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const settingsModal = page.locator('.fixed.z-50', { hasText: 'Настройки' });
    await expect(settingsModal).toBeVisible();

    // 4. Switch to "Хранилище & Бэкап" tab
    const vaultTabBtn = settingsModal.locator('button', { hasText: 'Хранилище & Бэкап' });
    await vaultTabBtn.click();
    await expect(settingsModal.locator('text=Резервное копирование и точки отката')).toBeVisible();

    // 5. Create a snapshot
    const createSnapshotBtn = settingsModal.locator('[data-testid="btn-create-snapshot"]');
    await expect(createSnapshotBtn).toBeVisible();
    await createSnapshotBtn.click();

    // Wait for snapshot item to appear in the list
    const snapshotItem = settingsModal.locator('[data-testid^="snapshot-item-"]').first();
    await expect(snapshotItem).toBeVisible({ timeout: 10000 });
    await expect(snapshotItem.locator('text=Ручной')).toBeVisible();

    // 6. Capture screenshot of the Backup Management UI
    await page.screenshot({ path: 'test-results/screenshots/backup-management.png' });

    // 7. Close settings modal
    await page.keyboard.press('Escape');
    await expect(settingsModal).not.toBeVisible();

    // 8. Delete the note from the feed via context menu
    await noteCard.click({ button: 'right' });
    const deleteMenuItem = page.locator('button', { hasText: 'Удалить' }).first();
    await expect(deleteMenuItem).toBeVisible();
    await deleteMenuItem.click();

    // Verify note is gone from feed
    await expect(page.locator('.group', { hasText: noteText })).not.toBeVisible({ timeout: 5000 });

    // 9. Re-open Settings modal -> Хранилище & Бэкап
    await settingsBtn.click();
    await expect(settingsModal).toBeVisible();
    await vaultTabBtn.click();

    // 10. Click restore button on the snapshot
    const restoreBtn = settingsModal.locator('[data-testid^="btn-restore-snapshot-"]').first();
    await expect(restoreBtn).toBeVisible();
    await restoreBtn.click();

    // Wait for toast or completion
    await page.waitForTimeout(500);

    // Close settings modal
    await page.keyboard.press('Escape');
    await expect(settingsModal).not.toBeVisible();

    // 11. Verify restored note is back in the feed!
    const restoredCard = page.locator('.group', { hasText: noteText }).first();
    await expect(restoredCard).toBeVisible({ timeout: 8000 });

    // 12. Capture screenshot of restored note
    await page.screenshot({ path: 'test-results/screenshots/backup-restored-note.png' });
  });
});
