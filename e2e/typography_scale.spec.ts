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
    const livePreviewTitle = page.locator('text=Предпросмотр').first();
    await expect(livePreviewTitle).toBeVisible();

    const scaleSelect = page.getByTestId('font-scale-select');
    await scaleSelect.click();
    await expect(page.getByRole('option', { name: 'Компактный (92%)', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Обычный (100%)', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Крупный (120%)', exact: true })).toBeVisible();
    await page.getByRole('option', { name: 'Комфортный (110%)', exact: true }).click();

    const comfortableScale = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-scale').trim();
    });
    expect(comfortableScale).toBe('1.1');

    // 4. Test Scale Switching: Large (120%)
    await scaleSelect.click();
    await page.getByRole('option', { name: 'Крупный (120%)', exact: true }).click();
    await page.waitForTimeout(200);

    const largeScale = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-scale').trim();
    });
    expect(largeScale).toBe('1.2');

    // 5. Test Font Family Switching: System OS
    await page.getByRole('button', { name: 'Гарнитура', exact: true }).click();
    const systemFontBtn = page.locator('button:has-text("Системный (OS Native)")').first();
    await expect(systemFontBtn).toBeVisible();
    await systemFontBtn.click();
    await page.waitForTimeout(200);

    const systemSans = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--slag-font-sans').trim();
    });
    expect(systemSans).toContain('-apple-system');

    // Scroll preview into view and capture settings screenshot
    const previewCard = page.locator('text=Предпросмотр').first();
    await previewCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'test-results/screenshots/typography_settings_preview.png' });

    // Switch back to Inter and Normal
    await page.getByRole('button', { name: 'Гарнитура', exact: true }).click();
    const interFontBtn = page.locator('button:has-text("Inter (Linear)")').first();
    await interFontBtn.click();
    await scaleSelect.click();
    await page.getByRole('option', { name: 'Обычный (100%)', exact: true }).click();
    await page.waitForTimeout(200);

    // Close Settings
    const closeBtn = page.locator('button:has(.lucide-x)').first();
    await closeBtn.click();
    await page.waitForTimeout(300);

    // 6. Visual verification in main feed
    await page.screenshot({ path: 'test-results/screenshots/typography_unified.png' });
  });

  test('Focus Editor matches note palette #141417 and circular checkbox style', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

    // Open Focus Editor via Composer Maximize button
    const expandBtn = page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first();
    await expect(expandBtn).toBeVisible({ timeout: 5000 });
    await expandBtn.click();

    // Verify fullscreen editor opened
    const editorModal = page.locator('[data-testid="fullscreen-editor-modal"]');
    await expect(editorModal).toBeVisible({ timeout: 5000 });

    // 1. Verify Note Palette (#141417 = rgb(20, 20, 23))
    const modalBg = await editorModal.evaluate((el) => {
      return getComputedStyle(el).backgroundColor;
    });
    expect(modalBg).toBe('rgb(20, 20, 23)');

    // 2. Type task subtasks into editor to test checkbox rendering
    const cmContent = page.locator('.cm-content').first();
    await expect(cmContent).toBeVisible();
    await cmContent.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('- [ ] Посчитать текущий доход и разрыв до 100к');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Найти 2-3 источника дохода');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Расписать план по месяцам');
    await page.waitForTimeout(400);

    // 3. Verify Circular Checkbox Style
    const checkboxes = page.locator('input.cm-atomic-task-checkbox');
    await expect(checkboxes.first()).toBeVisible({ timeout: 5000 });
    await expect(checkboxes).toHaveCount(3);

    // Click second checkbox to toggle it into completed state
    await checkboxes.nth(1).click();
    await page.waitForTimeout(300);

    const checkboxRadius = await checkboxes.first().evaluate((el) => {
      return getComputedStyle(el).borderRadius;
    });
    // Border-radius 9999px yields a circular value (either '9999px' or computed half-width)
    expect(checkboxRadius).toMatch(/9999px|\d+px/);

    const isCircular = await checkboxes.first().evaluate((el) => {
      const style = getComputedStyle(el);
      const width = parseFloat(style.width);
      const height = parseFloat(style.height);
      const radius = parseFloat(style.borderRadius);
      return Math.abs(width - height) < 2 && radius >= height / 2 - 1;
    });
    expect(isCircular).toBe(true);

    // Capture screenshot of Focus Editor matching note palette and circular checkboxes
    await page.screenshot({ path: 'test-results/screenshots/focus_editor_note_palette.png' });

    // Close Focus Editor
    await page.locator('header button', { hasText: 'Назад' }).click();
    await expect(editorModal).not.toBeVisible();
  });
});
