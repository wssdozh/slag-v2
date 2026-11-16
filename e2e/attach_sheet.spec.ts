import { test, expect } from '@playwright/test';

const attachButton = (page: Parameters<Parameters<typeof test>[1]>[0]['page']) =>
  page.locator('button[aria-label="Прикрепить файл"]').first();

/** A 1×1 PNG: enough for the canvas path, small enough to inline. */
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
  '0d0a2db40000000049454e44ae426082',
  'hex',
);

test('the paperclip opens one sheet with every source, and the pick lands in the tray', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  const sheet = page.locator('[data-testid="attach-sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Фото и видео');
  await expect(sheet).toContainText('Файл');
  await expect(sheet).toContainText('Голос');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/attach-sheet-desktop.png' });

  // The picker itself stays the platform's; the sheet owns what happens around it.
  await page.locator('[data-testid="attach-input-media"]').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: PNG_BYTES,
  });

  await expect(sheet).toHaveCount(0);
  // Images are stored as webp, so the name says what the bytes actually are.
  await expect(page.locator('[data-composer-attachments] img[alt="shot.webp"]')).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'test-results/screenshots/attach-sheet-picked.png' });
});

test('"не сжимать" keeps the original bytes and the original name', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  const toggle = page.locator('[data-testid="attach-sheet-panel"] [role="checkbox"]').first();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await page.locator('[data-testid="attach-input-media"]').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: PNG_BYTES,
  });

  await expect(page.locator('[data-composer-attachments] img[alt="shot.png"]')).toBeVisible({ timeout: 5000 });
});

test('an attached image survives a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  await page.locator('[data-testid="attach-input-media"]').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: PNG_BYTES,
  });
  await expect(page.locator('[data-composer-attachments] img[alt="shot.webp"]')).toBeVisible({ timeout: 5000 });

  // Send it, so the note is stored the way a saved note stores things: metadata in the index,
  // bytes in IndexedDB.
  await page.locator('main textarea').first().fill('заметка с картинкой');
  await page.keyboard.press('Enter');
  const note = page.locator('[id^="item-"]', { hasText: 'заметка с картинкой' }).first();
  await expect(note).toBeVisible({ timeout: 10000 });
  await expect(note.locator('img[alt="shot.webp"]')).toBeVisible({ timeout: 10000 });

  // The note itself is already in `localStorage` — that write is synchronous. The bytes are
  // not: `saveAttachment` fires the IndexedDB put and never awaits it. Reload inside that gap
  // aborts the transaction, and the note comes back with a "нет файла" slot. So wait for the
  // record, not for the picture above.
  await expect.poll(
    () => page.evaluate(async () => {
      const request = indexedDB.open('slag_v2_blobs');
      return await new Promise<string[]>((resolve) => {
        request.onerror = () => resolve([]);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('attachments')) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction('attachments', 'readonly').objectStore('attachments').getAll();
          all.onerror = () => { db.close(); resolve([]); };
          all.onsuccess = () => {
            db.close();
            resolve((all.result as Array<{ name?: string; dataUrl?: string }>)
              .filter((attachment) => Boolean(attachment.dataUrl))
              .map((attachment) => attachment.name || ''));
          };
        };
      });
    }),
    { timeout: 15000 },
  ).toContain('shot.webp');

  await page.reload({ waitUntil: 'domcontentloaded' });
  // The card's own picture, not any tile that happens to share the name: the right panel's
  // media grid renders a src-less <img> while the bytes are still being read back.
  const image = page.locator('[id^="item-"]', { hasText: 'заметка с картинкой' }).locator('img[alt="shot.webp"]').first();
  await expect(image).toBeVisible({ timeout: 20000 });
  // Off-screen and lazy means "empty" for Chromium's loader; the pixels only arrive once asked.
  await image.scrollIntoViewIfNeeded();
  // A src is not enough: a broken image also has one. It has to have decoded into pixels.
  await expect.poll(
    () => image.evaluate((el: HTMLImageElement) => el.naturalWidth),
    { timeout: 15000 },
  ).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screenshots/attach-survives-reload.png' });
});

test('a pasted photo survives the draft read-back when the window takes focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  await page.locator('[data-testid="attach-input-media"]').setInputFiles({
    name: 'shot.png',
    mimeType: 'image/png',
    buffer: PNG_BYTES,
  });
  const tray = page.locator('[data-composer-attachments] img[alt="shot.webp"]');
  await expect(tray).toBeVisible({ timeout: 5000 });

  // The draft on disk keeps metadata only, and a screenshot tool steals focus and hands it
  // back. That read-back used to replace the photo in the field with that metadata — no
  // bytes behind it, so the tray went blank and the note it was sent into arrived broken.
  await expect.poll(
    () => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('slag_drafts_'))),
    { timeout: 5000 },
  ).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(tray).toBeVisible();
  await expect.poll(() => tray.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

  // A stored draft that lags behind the field is not news either: this is the window where a
  // photo is attached and the own autosave has not landed yet. Adopting it drops the photo.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('slag_drafts_')) continue;
      const drafts = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, { attachments?: unknown[] }>;
      for (const draft of Object.values(drafts)) draft.attachments = [];
      localStorage.setItem(key, JSON.stringify(drafts));
    }
    window.dispatchEvent(new Event('focus'));
  });
  await expect(tray).toBeVisible();

  // The draft on disk is metadata only, so the photo after a restart is the bytes the store
  // kept for it. Without those, the tray comes back blank and the note is sent broken.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const restored = page.locator('[data-composer-attachments] img[alt="shot.webp"]');
  await expect(restored).toBeVisible({ timeout: 10000 });
  await expect.poll(() => restored.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

  await page.locator('main textarea').first().fill('фото после скриншота');
  await page.keyboard.press('Enter');
  const note = page.locator('[id^="item-"]', { hasText: 'фото после скриншота' }).first();
  await expect(note).toBeVisible({ timeout: 10000 });
  const sent = note.locator('img[alt="shot.webp"]').first();
  await sent.scrollIntoViewIfNeeded();
  await expect.poll(
    () => sent.evaluate((el: HTMLImageElement) => el.naturalWidth),
    { timeout: 15000 },
  ).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screenshots/composer-photo-after-focus.png' });
});

test('Esc closes the sheet, not the surface it was opened from', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  const sheet = page.locator('[data-testid="attach-sheet"]');
  await expect(sheet).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  // The composer is still there and usable.
  await expect(page.locator('main textarea').first()).toBeVisible();
});

test('on a phone the sheet is a tabbed bottom panel with a handle', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The phone opens on the folder list; the composer (and its paperclip) lives in the feed.
  const inbox = page.locator('button', { hasText: 'Входящие' }).first();
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await inbox.click();
  await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 15000 });

  const button = attachButton(page);
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();

  const sheet = page.locator('[data-testid="attach-sheet"]');
  const panel = page.locator('[data-testid="attach-sheet-panel"]');
  await expect(panel).toBeVisible();

  // Four tabs, no header repeating them in smaller type.
  for (const label of ['Фото', 'Видео', 'Аудио', 'Файлы']) {
    await expect(sheet.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(panel.getByRole('checkbox')).toBeVisible();

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeGreaterThan(844 - 4);
  await expect(panel.locator('[data-sheet-handle]')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/attach-sheet-mobile.png' });

  // The files tab explains itself instead of showing an empty list.
  await sheet.getByRole('button', { name: 'Файлы', exact: true }).click();
  await expect(sheet).toContainText('Папок пока нет');
  await page.screenshot({ path: 'test-results/screenshots/attach-sheet-mobile-files.png' });
});

test('the picker has two detents: the button and the handle both move it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const inbox = page.locator('button', { hasText: 'Входящие' }).first();
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await inbox.click();
  await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 15000 });

  await attachButton(page).click();

  const panel = page.locator('[data-testid="attach-sheet-panel"]');
  const handle = panel.locator('[data-sheet-handle]');
  await expect(panel).toBeVisible();
  await expect(handle).toBeVisible();
  await page.waitForTimeout(400);

  // Folded: the sheet starts a fifth of the screen down.
  const folded = await panel.boundingBox();
  expect(folded).not.toBeNull();
  expect(folded!.y).toBeGreaterThan(140);

  // The footer rides the counter-translate instead of being resized, so it stays on the edge.
  const footer = page.locator('[data-testid="attach-footer"]');
  const pinned = async () => {
    const fb = await footer.boundingBox();
    expect(fb).not.toBeNull();
    return Math.abs(fb!.y + fb!.height - 844);
  };
  expect(await pinned()).toBeLessThan(2);

  await page.getByRole('button', { name: 'На весь экран' }).click();
  await expect(panel).toHaveAttribute('data-expanded', 'true');
  await page.waitForTimeout(400);
  expect(Math.abs((await panel.boundingBox())!.y)).toBeLessThan(2);
  expect(await pinned()).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/screenshots/attach-sheet-mobile-full.png' });

  // The handle still folds it back, and the panel returns to the same detent.
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(x, startY + (200 * step) / 10);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(panel).not.toHaveAttribute('data-expanded', 'true');
  expect(Math.abs((await panel.boundingBox())!.y - folded!.y)).toBeLessThan(4);
});
