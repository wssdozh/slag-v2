import { test, expect } from '@playwright/test';

test.describe('Folder Badge Navigation & Card Anchoring', () => {
  test('Clicking folder name on a card navigates to that folder and anchors to the card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    // 1. Ensure we start in Inbox ("Входящие")
    const inboxTab = page.locator('button', { hasText: 'Входящие' }).first();
    await expect(inboxTab).toBeVisible();

    // 2. Find a card with a folder badge (e.g. belonging to 'Потом', 'Поиск работы', 'Дизайн' etc.)
    const folderButtons = page.locator('[id^="item-"] button[title*="Перейти в папку"]');
    await expect(folderButtons.first()).toBeVisible({ timeout: 5000 });

    const targetFolderBtn = folderButtons.first();
    const folderName = (await targetFolderBtn.innerText()).trim();
    const parentCard = targetFolderBtn.locator('xpath=ancestor::div[starts-with(@id, "item-")]');
    const targetCardId = await parentCard.getAttribute('id');
    expect(targetCardId).toBeTruthy();

    // 3. Click the folder name badge on the card
    await targetFolderBtn.click();

    // 4. Verify folder navigation: header or active tab now shows target folder
    await page.waitForTimeout(500);
    const activeHeader = page.locator('header h2');
    await expect(activeHeader).toContainText(folderName);

    // 5. Verify the card is present and highlighted in the new folder
    const anchoredCard = page.locator(`#${targetCardId}`);
    await expect(anchoredCard).toBeVisible();
    await expect(anchoredCard).toHaveClass(/item-highlight-pulse/);

    // 6. Capture screenshot of the anchored card in its dedicated folder
    await page.screenshot({
      path: 'test-results/screenshots/folder_jump_anchored.png',
      fullPage: false,
    });
  });
});
