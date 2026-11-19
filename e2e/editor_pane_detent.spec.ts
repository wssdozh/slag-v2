import { test, expect } from '@playwright/test';

test('desktop editor docks into its pane, then expands to the window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 15000 });
  // The composer settles its entrance before the button accepts a click.
  await page.waitForTimeout(1500);

  await page.locator('button[aria-label="Раскрыть в полноэкранный редактор"]').first().click();
  const editor = page.locator('[data-testid="fullscreen-editor-modal"]');
  await expect(editor).toBeVisible();

  const docked = await editor.boundingBox();
  expect(docked).not.toBeNull();
  // Docked: the surface stops at the pane, so the window around it is still app, not editor.
  expect(docked!.width).toBeLessThan(1440);
  expect(docked!.x).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/editor-docked-pane.png' });

  // Type is a droplist now, and it lives in the pane rather than a row of three buttons.
  const typeTrigger = page.locator('[data-testid="fullscreen-editor-modal"] button[aria-label="Сменить тип записи"]');
  await typeTrigger.click();
  await page.screenshot({ path: 'test-results/screenshots/editor-type-droplist.png' });
  await page.getByRole('button', { name: 'Таска', exact: true }).last().click();
  await expect(typeTrigger).toHaveAttribute('title', 'Таска');

  await page.locator('header button[title="Развернуть на всё окно"]').first().click();
  // The detent interpolates its box; measure after it settles.
  await page.waitForTimeout(400);
  const expanded = await editor.boundingBox();
  expect(expanded!.width).toBeCloseTo(1440, 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/editor-expanded-window.png' });

  // Esc walks back one detent at a time: window → pane → closed.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const back = await editor.boundingBox();
  expect(back!.width).toBeCloseTo(docked!.width, 0);
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible({ timeout: 5000 });
});
