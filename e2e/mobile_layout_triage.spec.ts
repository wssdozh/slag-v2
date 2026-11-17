import { test, expect } from '@playwright/test';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`mobile task composer and picker use the visible height (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Входящие', exact: false }).first().click();
    const composer = page.locator('[data-composer-panel]').first();
    await expect(composer).toBeVisible();
    await composer.locator('.composer-record-type').click();
    await page.getByRole('button', { name: 'Таска', exact: true }).last().click();
    // A resized browser viewport models the space left by the keyboard, not native Android IME.
    await page.setViewportSize({ width: 375, height: 480 });
    await expect.poll(async () => (await composer.boundingBox())!.height).toBeLessThan(110);
    for (const name of ['Установить срок таски', 'Установить длительность таски', 'Повторяющаяся таска', 'Прикрепить файл']) {
      await expect(composer.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await composer.getByRole('button', { name: 'Установить длительность таски', exact: true }).click();
    await page.getByRole('button', { name: '30 мин', exact: true }).click();
    await composer.locator('textarea').fill('строка\n'.repeat(30));
    expect((await composer.locator('textarea').boundingBox())!.height).toBeLessThanOrEqual(120);
    await composer.locator('textarea').fill('компактная таска');
    await page.screenshot({ path: 'test-results/screenshots/triage-task-keyboard.png' });
    await page.evaluate(() => {
      const images = Array.from({ length: 60 }, (_, i) => ({ id: `img-${i}`, uri: `content://media/${i}`, kind: 'image', name: `image-${i}.jpg`, mimeType: 'image/jpeg', size: 1000, dateAdded: 1 }));
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string) => {
          if (cmd === 'gallery_access') return { images: 'granted', video: 'granted', audio: 'granted' };
          if (cmd === 'gallery_list') return { items: images, hasMore: false };
          throw new Error(`unexpected invoke ${cmd}`);
        },
      };
    });
    await composer.getByRole('button', { name: 'Прикрепить файл', exact: true }).click();
    const panel = page.getByTestId('attach-sheet-panel');
    await expect(panel).toHaveAttribute('data-sheet-rest', 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toHaveAttribute('data-sheet-rest', 'true');
    const grid = page.getByTestId('media-grid-image');
    await expect.poll(async () => {
      const gridBox = (await grid.boundingBox())!;
      const footerBox = (await page.getByTestId('attach-footer').boundingBox())!;
      return footerBox.y - gridBox.y - gridBox.height;
    }).toBeLessThan(16);
    await expect(grid).toHaveJSProperty('scrollTop', 0);
    await grid.evaluate(node => { node.scrollTop = node.scrollHeight; });
    expect(await grid.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/screenshots/triage-picker-height-${reducedMotion}.png` });
    await page.getByRole('button', { name: 'На весь экран', exact: true }).click();
    await expect(panel).toHaveAttribute('data-sheet-rest', 'true');
    await expect(panel).toHaveAttribute('data-expanded', 'true');
    expect((await grid.boundingBox())!.height).toBeGreaterThan(650);
    await page.getByRole('button', { name: 'Свернуть', exact: true }).click();
    await expect(panel).toHaveAttribute('data-sheet-rest', 'true');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => (await page.getByTestId('attach-footer').boundingBox())!.y).toBeLessThan(390);
  });
}
