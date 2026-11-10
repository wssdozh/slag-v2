import { test, expect, type Page } from '@playwright/test';

const accentHex = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim(),
  );

/** Reads a token through the same utility the real controls use, so the check
 *  never depends on whether a button happens to be enabled right now. */
const utilityColor = (page: Page, className: string) =>
  page.evaluate((cls) => {
    const probe = document.createElement('div');
    probe.className = cls;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, className);

test('accent preset repaints the accent family and survives a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });

  await expect.poll(() => accentHex(page)).toBe('#3b82f6');
  const blueStrong = await utilityColor(page, 'bg-accent-strong');

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="ui"]') });
  await scope.locator('[data-tab="ui"]').click();
  await expect(page.getByText('Оформление', { exact: true })).toBeVisible();

  await page.getByTestId('accent-select').click();
  const palette = page.locator('[role="listbox"]');
  await expect(palette).toBeVisible();
  // The popover fades in; a screenshot mid-flight shows the card behind it.
  await palette.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({ path: 'test-results/screenshots/accent_color_palette.png' });
  await page.getByRole('option', { name: 'Фиолетовый', exact: true }).click();
  await expect(palette).toHaveCount(0);

  await expect.poll(() => accentHex(page)).toBe('#8b5cf6');
  // The derived tokens follow the chosen hex, or the send plate would stay blue.
  expect(await utilityColor(page, 'bg-accent-strong')).not.toBe(blueStrong);

  await page.screenshot({ path: 'test-results/screenshots/accent_color_settings.png' });

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('accent-select')).toBeHidden();

  const composer = page.locator('textarea[placeholder*="Мысль, заметка или код"]').first();
  await composer.fill('проверка акцента');
  await expect(page.locator('button[title*="Отправить"]').first()).toBeEnabled();
  await page.screenshot({ path: 'test-results/screenshots/accent_color_feed.png' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  await expect.poll(() => accentHex(page)).toBe('#8b5cf6');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('slag_ui_config_v2')))
    .toContain('"accent":"violet"');
});
