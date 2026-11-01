import { test, expect } from '@playwright/test';

test.describe('Folder View Settings & Todoist-style Modal', () => {
  test('Clean header, Todoist-style view modal, sorting, filtering, and per-folder persistence', async ({ page }) => {
    // Open app
    await page.goto('http://localhost:5173');
    await page.waitForSelector('header');

    // 1. Verify clean header: no segmented mode switcher, only folder title and 3-dots button
    const dotsBtn = page.locator('header button[aria-label="Вид и фильтры папки"]');
    await expect(dotsBtn).toBeVisible();

    // Verify segmented switcher is not cluttering the header
    const oldSegmented = page.locator('header nav[aria-label="Режимы представления"]');
    await expect(oldSegmented).not.toBeVisible();

    // 2. Click 3-dots button to open Todoist-style FolderViewModal
    await dotsBtn.click();

    const modal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
    await expect(modal).toBeVisible();

    // Verify sections inside the modal
    await expect(modal.locator('text=Режим отображения')).toBeVisible();
    await expect(modal.locator('text=Сортировка')).toBeVisible();
    await expect(modal.locator('text=Фильтрация записей')).toBeVisible();

    // Capture visual screenshot of the Todoist-style view modal
    await page.screenshot({
      path: 'test-results/screenshots/folder_view_modal.png',
      fullPage: false,
    });

    // 3. Switch view mode to "Канбан" in modal
    const kanbanModalBtn = modal.locator('button', { hasText: 'Канбан' });
    await expect(kanbanModalBtn).toBeVisible();
    await kanbanModalBtn.click();

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    // Verify Kanban board columns are now rendered
    await expect(page.locator('h3', { hasText: 'Бэклог' }).or(page.locator('h3', { hasText: 'К выполнению' })).first()).toBeVisible();

    // 4. Open modal again, switch back to "Лента", and set Type Filter to "Таски"
    await dotsBtn.click();
    await expect(modal).toBeVisible();

    const feedModalBtn = modal.locator('button', { hasText: 'Лента' });
    await feedModalBtn.click();

    const taskFilterBtn = modal.locator('button', { hasText: 'Таски' });
    await taskFilterBtn.click();

    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    // Verify active filter chip appears in the header with 1-click dismiss button
    const taskChip = page.locator('header span', { hasText: 'Таски' }).first();
    await expect(taskChip).toBeVisible();

    // Click dismiss button on the chip
    const dismissChipBtn = page.locator('header button[aria-label="Сбросить фильтр по типу"]');
    await expect(dismissChipBtn).toBeVisible();
    await dismissChipBtn.click();

    // Verify chip disappeared
    await expect(dismissChipBtn).not.toBeVisible();

    // 5. Test Per-Folder View Settings Persistence
    // Navigate to "Карьера"
    const careerFolderBtn = page.locator('aside span', { hasText: 'Карьера' }).first();
    await careerFolderBtn.click();

    // Set "Карьера" to Kanban mode via modal
    await dotsBtn.click();
    await expect(modal).toBeVisible();
    await kanbanModalBtn.click();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    // Verify Kanban is displayed for "Карьера"
    await expect(page.locator('h3', { hasText: 'Бэклог' }).or(page.locator('h3', { hasText: 'К выполнению' })).first()).toBeVisible();

    // Navigate to "Входящие"
    const inboxBtn = page.locator('aside span', { hasText: 'Входящие' }).first();
    await inboxBtn.click();

    // Verify "Входящие" opened in its own default view (Feed / Лента)
    await expect(page.locator('h3', { hasText: 'Бэклог' })).not.toBeVisible();

    // Navigate back to "Карьера"
    await careerFolderBtn.click();

    // Verify "Карьера" remembered and auto-restored Kanban view!
    await expect(page.locator('h3', { hasText: 'Бэклог' }).or(page.locator('h3', { hasText: 'К выполнению' })).first()).toBeVisible();

    // Reset settings for "Карьера" via "Сбросить вид" icon
    await dotsBtn.click();
    await expect(modal).toBeVisible();
    const resetBtn = modal.locator('button[aria-label="Сбросить вид"]');
    await resetBtn.click();
    await page.keyboard.press('Escape');

    // Verify "Карьера" reverted to default Feed view
    await expect(page.locator('h3', { hasText: 'Бэклог' })).not.toBeVisible();

    // Capture clean header screenshot
    await page.screenshot({
      path: 'test-results/screenshots/folder_view_clean_header.png',
      fullPage: false,
    });
  });
});
