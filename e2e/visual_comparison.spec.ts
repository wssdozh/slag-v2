import { test, expect } from '@playwright/test';

test.describe('Visual Comparison Suite', () => {
  test('Capture Desktop After Screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // 1. Folder Modal
    // Every surface below mounts on demand, so a bare isVisible() a frame after the previous
    // step answers "not yet" and the capture silently shows the wrong screen. Give each control
    // a short window to appear before deciding to skip it.
    const appear = async (locator: ReturnType<typeof page.locator>) => {
      await locator.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
      return locator.isVisible();
    };

    const newFolderBtn = page.locator('button[title*="Создать папку"]').first();
    if (await appear(newFolderBtn)) {
      await newFolderBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/after_modal_folder.png' });
      await page.locator('button:has-text("Отмена")').first().click();
      await page.waitForTimeout(200);
    }

    // 2. Settings Modal
    const settingsBtn = page.locator('button[title*="Настройки"]').first();
    if (await appear(settingsBtn)) {
      await settingsBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/after_modal_settings.png' });
      // Escape closes the top layer by contract; a blind `.lucide-x` first match can land on a
      // different surface now that overlays mount on first open and stay mounted after.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // 3. Search Modal
    // The palette is a lazy overlay now, so it arrives a chunk after the keypress - gating on
    // isVisible() right away skipped the close and left it covering the page.
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'test-results/screenshots/after_modal_search.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 4. Folder Info Right Panel (Desktop)
    await page.screenshot({ path: 'test-results/screenshots/after_folder_info_desktop.png' });

    // 5. Triage Modal
    // The button lives in the inbox header and its label is on the aria attribute, not in the
    // text - `has-text("Запустить")` never matched, so this step quietly captured the feed twice.
    const triageBtn = page.locator('button[aria-label="Запустить ИИ-Сортировку"]').first();
    if (await appear(triageBtn)) {
      await triageBtn.click();
      // The modal is a lazy overlay: clicking starts a chunk load, so a fixed sleep captures the
      // feed underneath and the file name lies about what it holds.
      await page.getByRole('dialog', { name: 'Сортировка входящих' }).waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/screenshots/after_modal_triage.png' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // 6. Kanban Board & Priority Badges
    const kanbanBtn = page.locator('button[title*="Канбан-доска задач"]').first();
    if (await appear(kanbanBtn)) {
      await kanbanBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'test-results/screenshots/after_priority_badges.png' });
    }
  });

  test('Capture Mobile After Screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // 1. Mobile Root Folders (starts here)
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/screenshots/after_mobile_folders.png' });

    // Open Входящие folder
    const inboxBtn = page.locator('button', { hasText: 'Входящие' }).first();
    if (await inboxBtn.isVisible()) {
      await inboxBtn.click();
      await page.waitForTimeout(200);
      // Click info (i) button
      const infoBtn = page.locator('button[aria-label="Информация о папке"]').first();
      if (await infoBtn.isVisible()) {
        await infoBtn.click();
        await page.waitForTimeout(200);
        await page.screenshot({ path: 'test-results/screenshots/after_folder_info_mobile.png' });
        // Close info sheet using Back button
        await page.locator('header button', { hasText: 'Назад' }).click();
        await page.waitForTimeout(200);
      }
      // Go back to root folders using Папки button
      await page.locator('header button', { hasText: 'Папки' }).click();
      await page.waitForTimeout(200);
    }

    // 2. Mobile Tasks View Header
    const tasksDockBtn = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Таски"]');
    if (await tasksDockBtn.isVisible()) {
      await tasksDockBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/after_mobile_tasks.png' });
    }

    // 3. Mobile Settings View Header
    const settingsDockBtn = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]');
    if (await settingsDockBtn.isVisible()) {
      await settingsDockBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/after_mobile_settings.png' });
    }

    // 4. Mobile Assistant View Header
    const assistantDockBtn = page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="ИИ"]');
    if (await assistantDockBtn.isVisible()) {
      await assistantDockBtn.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: 'test-results/screenshots/after_mobile_assistant.png' });
    }
  });
});
