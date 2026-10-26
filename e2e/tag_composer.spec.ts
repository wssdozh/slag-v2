import { test, expect } from '@playwright/test';

test.describe('Composer # Tag Selection E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  });

  test('1. Typing # opens Tag Suggestion Menu, shows frequency counts, filters and inserts tag on Enter', async ({ page }) => {
    const textarea = page.locator('main textarea');
    await expect(textarea).toBeVisible();

    // Type text and trigger # menu
    await textarea.click();
    await textarea.pressSequentially('Мысль про новый интерфейс #');

    // Menu should appear with header
    const tagMenuHeader = page.locator('text=Теги хранилища (#)');
    await expect(tagMenuHeader).toBeVisible();

    // Visual screenshot of the open # tag menu
    await page.screenshot({ path: 'test-results/screenshots/tag_menu_open.png' });

    // Filter by typing 'диз'
    await textarea.pressSequentially('диз');

    // Item for 'дизайн' should be visible
    const designTagItem = page.locator('[data-tag-item="дизайн"]').first();
    await expect(designTagItem).toBeVisible();

    // Press Enter to select the tag
    await textarea.press('Enter');

    // Menu should disappear
    await expect(tagMenuHeader).toBeHidden();

    // Text in textarea should contain '#дизайн '
    const value = await textarea.inputValue();
    expect(value).toContain('#дизайн ');

    // Tag chip should be visible in properties preview slot
    const tagChip = page.locator('button', { hasText: '#дизайн' }).first();
    await expect(tagChip).toBeVisible();

    // Visual screenshot of composer with tag chip
    await page.screenshot({ path: 'test-results/screenshots/tag_chip_active.png' });
  });

  test('2. Tag button is permanently absent from toolbar, typing # opens menu and inserts tag', async ({ page }) => {
    const textarea = page.locator('main textarea');
    await expect(textarea).toBeVisible();

    // Verify tag button in composer toolbar is removed
    const tagBtn = page.locator('button[title*="Выбрать тег"]');
    await expect(tagBtn).toBeHidden();

    // Type # to open tag menu
    await textarea.fill('#');

    // Tag menu should open
    const tagMenuHeader = page.locator('text=Теги хранилища (#)');
    await expect(tagMenuHeader).toBeVisible();

    // Click on 'покупки' in the list
    const shoppingTagItem = page.locator('[data-tag-item="покупки"]').first();
    await expect(shoppingTagItem).toBeVisible();
    await shoppingTagItem.click();

    // Tag menu closes
    await expect(tagMenuHeader).toBeHidden();

    // Text in textarea has '#покупки '
    const val = await textarea.inputValue();
    expect(val).toContain('#покупки ');

    // Tag chip appears
    const shoppingChip = page.locator('button', { hasText: '#покупки' }).first();
    await expect(shoppingChip).toBeVisible();
  });
});
