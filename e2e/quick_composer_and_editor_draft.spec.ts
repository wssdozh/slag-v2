import { test, expect } from './support/selfhostFixture';

test.describe('Editor draft preservation and Quick Composer = Main Composer sync', () => {
  test('1. Preserves and restores draft on local PC when exiting Fullscreen Editor', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 15000 });

    const composerTextarea = page.locator('main textarea[placeholder*="мысль"]').or(page.locator('main textarea')).first();
    await expect(composerTextarea).toBeVisible();

    // Maximize composer into Fullscreen Editor
    const maximizeBtn = page.locator('button[title*="Раскрыть"]').or(page.locator('button[aria-label*="Раскрыть"]')).first();
    await expect(maximizeBtn).toBeVisible();
    await maximizeBtn.click();

    // Fullscreen editor should be open
    await expect(page.locator('.cm-content')).toBeVisible({ timeout: 5000 });

    // Type text into CodeMirror
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('Черновик написанный в редакторе на компе');

    // Press Escape to exit editor
    await page.keyboard.press('Escape');

    // Fullscreen editor should be closed
    await expect(page.locator('.cm-content')).toHaveCount(0);

    // Composer on main feed must preserve the draft typed in editor!
    await expect(composerTextarea).toBeVisible();
    await expect(composerTextarea).toHaveValue('Черновик написанный в редакторе на компе');

    // Wait past debounced autosave (250ms) to ensure it does not clear itself
    await page.waitForTimeout(400);
    await expect(composerTextarea).toHaveValue('Черновик написанный в редакторе на компе');

    // Storage draft must also have this content
    const savedDraft = await page.evaluate(() => {
      const { storage } = (window as any);
      return storage.getComposerDraft('Входящие');
    });
    expect(savedDraft).not.toBeNull();
    expect(savedDraft.content).toBe('Черновик написанный в редакторе на компе');

    await page.screenshot({
      path: 'test-results/screenshots/editor_draft_preserve.png',
      fullPage: false,
    });
  });

  test('2. Quick Composer Island equals Main Composer: live cross-window draft synchronization', async ({ browser }) => {
    // Open main window and quick composer in same browser context (sharing localStorage & BroadcastChannel)
    const context = await browser.newContext();
    const pageMain = await context.newPage();
    const pageQuick = await context.newPage();

    await pageMain.setViewportSize({ width: 1280, height: 800 });
    await pageQuick.setViewportSize({ width: 660, height: 760 });

    await pageMain.goto('/');
    await pageQuick.goto('/?window=quick-composer');

    await expect(pageMain.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 15000 });
    await expect(pageQuick.locator('span:has-text("Быстрая мысль")')).toBeVisible({ timeout: 10000 });

    const mainInput = pageMain.locator('main textarea[placeholder*="мысль"]').or(pageMain.locator('main textarea')).first();
    const quickInput = pageQuick.locator('textarea[placeholder*="Содержимое записи..."]').or(pageQuick.locator('textarea')).first();

    await expect(mainInput).toBeVisible();
    await expect(quickInput).toBeVisible();

    // 1. Type in Quick Composer Island
    await quickInput.click();
    await quickInput.fill('Быстрая мысль = основной композер');

    // Let debounced autosave (250ms) and BroadcastChannel cross-window sync propagate
    await pageQuick.waitForTimeout(600);

    // Main window must immediately reflect the exact draft from Quick Composer!
    await expect(mainInput).toHaveValue('Быстрая мысль = основной композер');

    // 2. Edit draft in Main window
    await pageMain.bringToFront();
    await mainInput.click();
    await pageMain.waitForTimeout(500);
    await mainInput.fill('Быстрая мысль = основной композер, дополнено из главного окна!');

    await pageMain.waitForTimeout(400);

    // Quick Composer must update live to match the Main window!
    await expect(quickInput).toHaveValue('Быстрая мысль = основной композер, дополнено из главного окна!');

    await pageQuick.screenshot({
      path: 'test-results/screenshots/quick_composer_sync_main.png',
      fullPage: false,
    });

    // 3. Submit from Quick Composer with Enter
    await quickInput.press('Enter');

    // Both quick composer and main composer should now have cleared drafts
    await pageQuick.waitForTimeout(400);
    await expect(quickInput).toHaveValue('');
    await expect(mainInput).toHaveValue('');
  });
});
