import { test, expect } from '@playwright/test';
import { setupSlag } from '../support/slagSetup';

// The editor's chunk stays lazy, so its first import can be held back: the app must show the
// lightweight status fallback, must not mount a late editor after that open was closed, and must
// reopen straight into the editor once the module is cached.
test.describe('Editor cold import', () => {
  test('fallback holds the open, close before load mounts nothing, reopen has no splash', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      localStorage.setItem('slag_items_default_vault', JSON.stringify([{
        id: 'e2e-editor-import', type: 'article', title: 'E2E editor import', content: 'Body',
        folder: 'Входящие', tags: [], attachments: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      }]));
    });

    let releaseImport: () => void = () => {};
    const importGate = new Promise<void>((resolve) => { releaseImport = resolve; });
    let held = 0;
    await page.route('**/src/components/Editor/FullscreenEditor.tsx*', async (route) => {
      held += 1;
      await importGate;
      await route.continue();
    });

    await setupSlag(page, test.info());
    const title = page.locator('[data-flip-id="e2e-editor-import"] h3 span');
    await expect(title).toBeVisible();
    await title.click({ position: { x: 6, y: 10 } });

    const fallback = page.getByTestId('editor-opening-fallback');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute('role', 'status');
    expect(held).toBe(1);

    await page.keyboard.press('Escape');
    await expect(fallback).toBeHidden();
    releaseImport();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="fullscreen-editor-modal"]')).toHaveCount(0);

    await title.click({ position: { x: 6, y: 10 } });
    await expect(page.getByTestId('editor-opening-fallback')).toHaveCount(0);
    await expect(page.locator('[data-testid="fullscreen-editor-modal"]')).toBeVisible();
  });

  test('a failed import is retried on reopen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      localStorage.setItem('slag_items_default_vault', JSON.stringify([{
        id: 'e2e-editor-import', type: 'article', title: 'E2E editor import', content: 'Body',
        folder: 'Входящие', tags: [], attachments: [],
        createdAt: Date.now(), updatedAt: Date.now(),
      }]));
    });

    let attempts = 0;
    await page.route('**/src/components/Editor/FullscreenEditor.tsx*', async (route) => {
      attempts += 1;
      if (attempts === 1) await route.abort();
      else await route.continue();
    });

    await setupSlag(page, test.info());
    const title = page.locator('[data-flip-id="e2e-editor-import"] h3 span');
    await expect(title).toBeVisible();
    await title.click({ position: { x: 6, y: 10 } });
    const fallback = page.getByTestId('editor-opening-fallback');
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText('Попробуйте ещё раз');

    await page.keyboard.press('Escape');
    await expect(fallback).toBeHidden();
    await title.click({ position: { x: 6, y: 10 } });
    await expect(page.locator('[data-testid="fullscreen-editor-modal"]')).toBeVisible();
    expect(attempts).toBe(2);
  });
});
