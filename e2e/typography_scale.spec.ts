import { test, expect } from '@playwright/test';

test.describe('Typography Modular Scale & Unified Config Suite', () => {
  test('Verifies CSS variables, font family, and scale reactivity', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // 1. Initial CSS variables verification on :root
    const initialScale = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-scale').trim();
    });
    expect(initialScale).toBe('1');

    const initialSans = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-sans').trim();
    });
    expect(initialSans).toContain('Inter');

    const initialMono = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-mono').trim();
    });
    expect(initialMono).toContain('Mono');

    // 2. Open Settings Modal and switch to "Интерфейс" tab
    const settingsBtn = page.locator('button[title*="Настройки"]').first();
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();
    await page.waitForTimeout(300);

    const uiTabBtn = page.locator('button:has-text("Интерфейс")').first();
    await expect(uiTabBtn).toBeVisible({ timeout: 5000 });
    await uiTabBtn.click();
    await page.waitForTimeout(300);

    // Verify live preview card is visible
    const livePreviewTitle = page.locator('text=Интерактивный образец иерархии внимания').first();
    await expect(livePreviewTitle).toBeVisible();

    // Verify font scale buttons
    const smallBtn = page.locator('button:has-text("Компактный (92%)")').first();
    const normalBtn = page.locator('button:has-text("Обычный (100%)")').first();
    const comfortableBtn = page.locator('button:has-text("Комфортный (110%)")').first();
    const largeBtn = page.locator('button:has-text("Крупный (120%)")').first();

    await expect(smallBtn).toBeVisible();
    await expect(normalBtn).toBeVisible();
    await expect(comfortableBtn).toBeVisible();
    await expect(largeBtn).toBeVisible();

    // 3. Test Scale Switching: Comfortable (110%)
    await comfortableBtn.click();
    await page.waitForTimeout(200);

    const comfortableScale = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-scale').trim();
    });
    expect(comfortableScale).toBe('1.1');

    // 4. Test Scale Switching: Large (120%)
    await largeBtn.click();
    await page.waitForTimeout(200);

    const largeScale = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-scale').trim();
    });
    expect(largeScale).toBe('1.2');

    // 5. Test Font Family Switching: System OS
    const systemFontBtn = page.locator('button:has-text("Системный (OS Native)")').first();
    await expect(systemFontBtn).toBeVisible();
    await systemFontBtn.click();
    await page.waitForTimeout(200);

    const systemSans = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-sans').trim();
    });
    expect(systemSans).toContain('-apple-system');

    // Scroll preview into view and capture settings screenshot
    const previewCard = page.locator('text=Интерактивный образец иерархии внимания').first();
    await previewCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/screenshots/typography_settings_preview.png' });

    // Switch back to Inter and Normal
    const interFontBtn = page.locator('button:has-text("Inter (Linear)")').first();
    await interFontBtn.click();
    await normalBtn.click();
    await page.waitForTimeout(200);

    // Close Settings
    const closeBtn = page.locator('button:has(.lucide-x)').first();
    await closeBtn.click();
    await page.waitForTimeout(300);

    // 6. Visual verification in main feed
    await page.screenshot({ path: 'test-results/screenshots/typography_unified.png' });
  });
});
