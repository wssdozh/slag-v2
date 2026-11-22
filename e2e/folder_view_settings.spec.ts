import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`Active filters share compact styling and clear independently at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    if (viewport.width < 768) {
      await page.getByRole('button', { name: /^Входящие/ }).first().click();
    }
    const dots = page.getByRole('button', { name: 'Вид и фильтры папки' });
    const header = dots.locator('xpath=ancestor::header');
    await expect(header.getByRole('button', { name: 'Информация о папке' })).toHaveText('Входящие');
    await expect(header.getByRole('button', { name: 'Запустить ИИ-Сортировку' })).toHaveText('');
    await dots.click();
    const modal = page.getByRole('dialog', { name: 'Вид и фильтры', exact: true });
    await modal.getByRole('button', { name: /^Фильтры/ }).click();
    await expect(modal.getByRole('button', { name: 'Назад' })).toBeFocused();
    await modal.getByRole('button', { name: 'Таски', exact: true }).click();
    await modal.getByText('Скрыть выполненные', { exact: true }).click();
    await modal.getByText('Только закрепленные', { exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(modal.getByRole('button', { name: /^Фильтры/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(dots).toBeFocused();
    await expect(dots).toHaveAttribute('data-filtered', 'true');
    await header.screenshot({ path: `test-results/screenshots/inbox-header-filtered-${viewport.width}.png` });

    const type = page.getByRole('button', { name: 'Сбросить фильтр по типу', exact: true });
    const pinned = page.getByRole('button', { name: 'Сбросить фильтр закрепленных', exact: true });
    const completed = page.getByRole('button', { name: 'Показать выполненные таски', exact: true });
    for (const badge of [type, pinned, completed]) {
      await expect(badge).toBeVisible();
      await expect(badge).toHaveCSS('border-top-width', '0px');
      await expect(badge).toHaveCSS('height', '24px');
      await expect(badge).toHaveAttribute('class', await type.getAttribute('class') ?? '');
      await expect(badge.locator('[data-icon="action.close"]')).toHaveAttribute('width', '12');
      await expect(badge.locator('button')).toHaveCount(0);
      await expect(badge).toHaveText('');
    }
    await page.screenshot({ path: `test-results/screenshots/unified-filter-chips-${viewport.width}.png` });
    await completed.focus();
    await page.keyboard.press('Enter');
    await expect(completed).not.toBeVisible();
    await expect(type).toBeVisible();
    await expect(pinned).toBeVisible();
    await pinned.click();
    await expect(pinned).not.toBeVisible();
    await type.click();
    await expect(type).not.toBeVisible();
  });
}

test.describe('Folder View Settings & Todoist-style Modal', () => {
  test('Clean header, Todoist-style view modal, sorting, filtering, and per-folder persistence', async ({ page }) => {
    // Open app
    await page.goto('/');
    await page.waitForSelector('header');

    // 1. Verify clean header: no segmented mode switcher, only folder title and 3-dots button
    const dotsBtn = page.locator('header button[aria-label="Вид и фильтры папки"]');
    await expect(dotsBtn.locator('[data-icon="action.more"]')).toBeVisible();
    await expect(dotsBtn).toHaveText('');

    // Verify segmented switcher is not cluttering the header
    const oldSegmented = page.locator('header nav[aria-label="Режимы представления"]');
    await expect(oldSegmented).not.toBeVisible();

    // 2. Click 3-dots button to open Todoist-style FolderViewModal
    await dotsBtn.click();

    const modal = page.locator('[role="dialog"][aria-label="Вид и фильтры"]');
    await expect(modal).toBeVisible();

    // Verify sections inside the modal
    const layouts = modal.getByRole('group', { name: 'Режим отображения' });
    await expect(layouts).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(layouts).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(layouts.locator('button[aria-pressed="false"]').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(layouts.locator('button[aria-pressed="true"]')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(modal.getByRole('button', { name: 'Сортировка' })).toBeVisible();
    await expect(modal.getByRole('button', { name: /^Фильтры/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Таски' })).not.toBeVisible();
    await modal.getByRole('button', { name: 'Сортировка' }).click();
    await modal.getByRole('button', { name: 'По названию' }).click();
    await modal.getByRole('button', { name: /^Направление/ }).click();
    await expect(modal.getByRole('button', { name: /^Направление/ })).toContainText('Я → А');
    await modal.getByRole('button', { name: 'Назад' }).click();
    await expect(modal.getByRole('button', { name: 'Сортировка' })).toContainText('По названию');

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

    await modal.getByRole('button', { name: /^Фильтры/ }).click();
    const taskFilterBtn = modal.locator('button', { hasText: 'Таски' });
    await taskFilterBtn.click();
    await expect(modal.getByRole('group', { name: 'Разбор входящих' })).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    // Verify active filter chip appears in the header with 1-click dismiss button
    const dismissChipBtn = page.locator('header button[aria-label="Сбросить фильтр по типу"]');
    await expect(dismissChipBtn).toHaveAttribute('title', /Таски/);
    await expect(dismissChipBtn).toHaveCSS('border-top-width', '0px');
    await dismissChipBtn.locator('xpath=ancestor::header').screenshot({ path: 'test-results/screenshots/compact-feed-filter.png' });
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
    const resetBtn = modal.getByRole('button', { name: 'Сбросить вид' });
    await resetBtn.click();
    await expect(modal).not.toBeVisible();

    // Verify "Карьера" reverted to default Feed view
    await expect(page.locator('h3', { hasText: 'Бэклог' })).not.toBeVisible();

    // Capture clean header screenshot
    await page.screenshot({
      path: 'test-results/screenshots/folder_view_clean_header.png',
      fullPage: false,
    });
  });
});
