import { test, expect } from '@playwright/test';

/** Two 1×1 PNGs and a clip that only has to exist: the test reads the DOM, not the pixels. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CLIP = 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29t';

/** A note carrying one photo, one clip and a second photo: the viewer's deck, in order. */
const NOTE = {
  id: 'media_viewer_item',
  type: 'note',
  title: 'Медиа',
  content: 'Фото и клип в одной заметке',
  folder: 'Входящие',
  tags: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  attachments: [
    { id: 'mv_img1', name: 'photo1.png', type: 'image', mimeType: 'image/png', size: 1024, relativePath: '.attachments/photo1.png', dataUrl: PNG },
    { id: 'mv_clip', name: 'clip.mp4', type: 'video', mimeType: 'video/mp4', size: 2048, relativePath: '.attachments/clip.mp4', dataUrl: CLIP },
    { id: 'mv_img2', name: 'photo2.png', type: 'image', mimeType: 'image/png', size: 1024, relativePath: '.attachments/photo2.png', dataUrl: PNG2 },
  ],
};

async function seedAndOpenFeed(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.evaluate((note) => {
    const storageKey = 'slag_items_default_vault';
    const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
    items.unshift(note);
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, NOTE);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // A phone opens on the folder list; the feed (and the note) live behind it.
  const inbox = page.locator('button', { hasText: 'Входящие' }).first();
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await inbox.click();
  await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 15000 });
}

test.describe('media viewer', () => {
  test('on a phone photos and clips share one deck, and the chrome gets out of the way', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await seedAndOpenFeed(page);

    // A clip plays in its card; the viewer is the way out of it.
    await page.getByRole('button', { name: 'Открыть видео' }).first().click();

    const lightbox = page.getByTestId('image-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByTestId('viewer-video')).toBeVisible();
    await expect(lightbox.getByText(/\d из 3/)).toBeVisible();
    // The desktop hint bar is a desktop thing.
    await expect(lightbox.locator('text=для перелистывания')).not.toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'test-results/screenshots/media-viewer-video-phone.png' });

    // Swipe right, back to the photo before the clip.
    await page.mouse.move(90, 420);
    await page.mouse.down();
    for (let step = 1; step <= 10; step++) await page.mouse.move(90 + (220 * step) / 10, 420);
    await page.mouse.up();
    await expect(lightbox.locator('img[alt="photo1.png"]')).toBeVisible({ timeout: 5000 });
    await expect(lightbox.getByText(/1 из 3/)).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/media-viewer-photo-phone.png' });

    const headerOpacity = () =>
      page.getByTestId('viewer-chrome-top').evaluate((node) => getComputedStyle(node).opacity);

    // A tap puts the chrome away, a second tap brings it back, and an idle viewer hides it alone.
    await page.mouse.click(200, 400);
    await expect.poll(headerOpacity).toBe('0');
    await page.mouse.click(200, 400);
    await expect.poll(headerOpacity).toBe('1');
    await expect.poll(headerOpacity, { timeout: 6000 }).toBe('0');

    // The menu acts on the note, not on the bytes.
    await page.mouse.click(200, 400);
    await page.getByRole('button', { name: 'Действия' }).click();
    const menu = page.getByTestId('viewer-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Открыть заметку');
    await expect(menu).toContainText('Ответить');
    await page.screenshot({ path: 'test-results/screenshots/media-viewer-menu-phone.png' });
  });

  test('on a desktop the viewer keeps its arrows, its zoom and the hint bar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await seedAndOpenFeed(page);

    await page.locator('img[alt="photo1.png"]').first().click();

    const lightbox = page.getByTestId('image-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.locator('text=1 из 3')).toBeVisible();
    await expect(lightbox.locator('text=для перелистывания')).toBeVisible();
    await expect(lightbox.getByRole('button', { name: 'Следующее изображение' })).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(lightbox.locator('text=2 из 3')).toBeVisible();
    // The clip is a slide, not a hole in the deck.
    await expect(lightbox.getByTestId('viewer-video')).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'test-results/screenshots/media-viewer-desktop.png' });

    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();
  });
});
