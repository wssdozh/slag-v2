import { test, expect } from '@playwright/test';
import { setupSlag } from './support/slagSetup';

// A 1×1 PNG: enough for the decode path, small enough to inline.
const PNG_HEX =
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
  '0d0a2db40000000049454e44ae426082';

test.describe('Composer · вставка из буфера', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // The live field is the CodeMirror one. The suite's fixture runs under `navigator.webdriver`
    // and therefore gets the textarea fallback, which is exactly the surface this bug was not on.
    await page.addInitScript(() => localStorage.setItem('slag:composer-engine', 'markdown'));
    await setupSlag(page, testInfo);
  });

  test('скриншот из буфера становится вложением в markdown-поле', async ({ page }) => {
    const field = page.locator('[data-composer-editor]');
    await expect(field).toBeVisible();
    // The CodeMirror surface really is mounted, not the textarea: the guard against testing
    // the fallback twice.
    await expect(page.locator('[data-composer-editor] .cm-content')).toBeVisible();

    await page.evaluate((hex: string) => {
      const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((pair) => parseInt(pair, 16)));
      const clipboard = new DataTransfer();
      clipboard.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }));
      const target = document.querySelector('[data-composer-editor] .cm-content')
        ?? document.querySelector('[data-composer-editor]');
      target!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    }, PNG_HEX);

    const tray = page.locator('[data-composer-attachments] img');
    await expect(tray.first()).toBeVisible({ timeout: 5000 });
    // The picture reaches the tray under its converted name: the paste path is the same one
    // the paperclip uses, so the webp rename proves the bytes were decoded, not just counted.
    await expect(page.locator('[data-composer-attachments] img[alt="screenshot.webp"]')).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/composer-paste-attachment.png' });
  });
});
