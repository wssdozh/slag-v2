import { test, expect, type Page } from '@playwright/test';

// The first navigation of a run pays for the dev server's whole module graph; the second is warm.
test.setTimeout(120_000);

/**
 * MediaStore lives on the device, so the gallery answers are stubbed. Only the commands the
 * picker asks for are served; anything else fails loudly, the way a missing plugin would.
 */
const stubDeviceGallery = () => {
  const row = (id: string, kind: string, name: string, size: number) => ({
    id,
    uri: `content://media/${id}`,
    kind,
    name,
    mimeType: kind === 'audio' ? 'audio/wav' : 'image/jpeg',
    size,
    dateAdded: 1,
  });
  const images = [
    row('img-1', 'image', 'IMG_0001.jpg', 1_200_000),
    row('img-2', 'image', 'IMG_0002.jpg', 1_300_000),
    row('img-3', 'image', 'IMG_0003.jpg', 1_400_000),
    row('img-4', 'image', 'IMG_0004.jpg', 1_500_000),
  ];
  const audio = [
    row('aud-1', 'audio', '20261025_225348.wav', 48_000),
    row('aud-2', 'audio', '20261025_230112.wav', 52_000),
    row('aud-3', 'audio', '20261025_231500.wav', 61_000),
  ];
  const granted = { images: 'granted', video: 'granted', audio: 'granted' };
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
    // A silent wav: the row only needs a source the element accepts.
    convertFileSrc: () => 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=',
    invoke: async (cmd: string, args: { kind: string }) => {
      if (cmd === 'gallery_access') return granted;
      if (cmd === 'gallery_list') return { items: args.kind === 'audio' ? audio : images, hasMore: false };
      throw new Error(`unexpected invoke ${cmd}`);
    },
  };
};

const openPicker = async (page: Page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const inbox = page.locator('button', { hasText: 'Входящие' }).first();
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await inbox.click();
  await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 15000 });

  await page.evaluate(stubDeviceGallery);
  await page.locator('button[aria-label="Прикрепить файл"]').first().click();
  await expect(page.locator('[data-testid="media-grid-image"]')).toBeVisible({ timeout: 10000 });
  // The sheet arrives on a spring; a tile measured mid-flight is not where it will be.
  await page.waitForTimeout(500);
};

const footer = (page: Page) => page.locator('[data-testid="attach-footer"]');

const hold = async (page: Page, selector: string) => {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
};

test('holding a tile starts a multi-selection, and taps extend it instead of zooming', async ({ page }) => {
  await openPicker(page);

  const first = '[data-testid="media-grid-image"] button[aria-label="IMG_0001.jpg"]';
  const second = '[data-testid="media-grid-image"] button[aria-label="IMG_0002.jpg"]';

  await hold(page, first);
  // The hold picks, it does not open the viewer.
  await expect(page.locator('[data-testid="media-preview"]')).toHaveCount(0);
  await expect(page.locator(first)).toHaveAttribute('aria-pressed', 'true');
  await expect(footer(page)).toContainText('1 ·');

  await page.locator(second).click();
  await expect(page.locator(second)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(second)).toContainText('2');
  await expect(page.locator('[data-testid="media-preview"]')).toHaveCount(0);
  await page.locator('[data-testid="attach-sheet"]').screenshot({ path: 'test-results/screenshots/media-picker-multi-select.png' });

  // Dropping everything leaves the mode, and a tap opens the photo again.
  await page.locator(first).click();
  await page.locator(second).click();
  await expect(page.locator(first)).toHaveAttribute('aria-pressed', 'false');
  await page.locator(first).click();
  await expect(page.locator('[data-testid="media-preview"]')).toBeVisible();
});

test('audio is a playlist of rows: tap selects, nothing opens full screen', async ({ page }) => {
  await openPicker(page);

  await page.getByRole('button', { name: 'Аудио', exact: true }).click();
  const list = page.locator('[data-testid="media-grid-audio"]');
  await expect(list).toBeVisible();

  const track = list.locator('button[aria-label="20261025_225348.wav"]');
  await expect(track).toBeVisible();
  await expect(list.locator('button[aria-label$=".wav"]')).toHaveCount(3);

  // A row, not a square: it takes the sheet's width and stays one line tall.
  const box = await track.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThan(60);
  expect(box!.width).toBeGreaterThan(200);

  // The stream protocol is stubbed, so the play button is live rather than disabled.
  await expect(list.getByRole('button', { name: 'Прослушать' }).first()).toBeEnabled();

  await track.click();
  await expect(track).toHaveAttribute('aria-pressed', 'true');
  await expect(footer(page)).toContainText('1 ·');
  await expect(page.locator('[data-testid="media-preview"]')).toHaveCount(0);
  // The platform's own player is what the old full-screen path used to show.
  await expect(page.locator('audio[controls]')).toHaveCount(0);
  await page.locator('[data-testid="attach-sheet"]').screenshot({ path: 'test-results/screenshots/media-picker-audio-rows.png' });
});
