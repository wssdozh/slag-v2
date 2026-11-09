import { test, expect, type Page } from '@playwright/test';

/**
 * A picture keeps its own proportions in the feed: the height is clamped, the width follows
 * the source ratio, and a note that is nothing but a picture hugs it instead of sitting in a
 * column-wide slab. The four stand-in images below cover the ratios people actually attach.
 */
const svg = (width: number, height: number, label: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#4b5563"/><stop offset="0.55" stop-color="#312e81"/>` +
      `<stop offset="1" stop-color="#7c2d12"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/>` +
      `<g fill="#f4f4f5" font-family="JetBrains Mono, monospace" text-anchor="middle">` +
      `<text x="50%" y="50%" font-size="${Math.round(Math.min(width, height) / 7)}">${label}</text></g></svg>`,
  );

const SHAPES = [
  { id: 'thumb_poster', name: 'poster', width: 400, height: 600 },
  { id: 'thumb_wide', name: 'wide', width: 1600, height: 900 },
  { id: 'thumb_square', name: 'square', width: 800, height: 800 },
  { id: 'thumb_panorama', name: 'panorama', width: 1800, height: 600 },
];

const CLIP = 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29t';

const NOTES = [
  ...SHAPES.map((shape) => ({
    id: shape.id,
    type: 'note',
    title: shape.name,
    content: '',
    folder: 'Входящие',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attachments: [
      {
        id: `${shape.id}_file`,
        name: `${shape.name}.svg`,
        type: 'image',
        mimeType: 'image/svg+xml',
        size: 1024,
        relativePath: `.attachments/${shape.name}.svg`,
        dataUrl: svg(shape.width, shape.height, `${shape.width}×${shape.height}`),
      },
    ],
  })),
  {
    // Five pictures: one hero and a rail. The fourth slot counts what did not fit.
    id: 'thumb_album',
    type: 'note',
    title: 'album',
    content: '',
    folder: 'Входящие',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attachments: Array.from({ length: 8 }, (_, index) => ({
      id: `thumb_album_${index}`,
      name: `album-${index + 1}.svg`,
      type: 'image',
      mimeType: 'image/svg+xml',
      size: 512,
      relativePath: `.attachments/album-${index + 1}.svg`,
      dataUrl: svg(800, 800, `кадр ${index + 1}`),
    })),
  },
  {
    // A clip is media too: the circle and its way out do not need a column-wide card.
    id: 'thumb_clip',
    type: 'note',
    title: 'clip',
    content: '',
    folder: 'Входящие',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attachments: [
      {
        id: 'thumb_clip_file',
        name: 'clip.mp4',
        type: 'video',
        mimeType: 'video/mp4',
        size: 2048,
        relativePath: '.attachments/clip.mp4',
        dataUrl: CLIP,
      },
    ],
  },
  {
    // A note with a line of text stays a column: prose needs the room, the picture does not.
    id: 'thumb_with_text',
    type: 'note',
    title: '',
    content: 'Картинка к заметке с текстом, чтобы карточка осталась во всю ширину.',
    folder: 'Входящие',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attachments: [
      {
        id: 'thumb_with_text_file',
        name: 'wide.svg',
        type: 'image',
        mimeType: 'image/svg+xml',
        size: 1024,
        relativePath: '.attachments/wide.svg',
        dataUrl: svg(1600, 900, '1600×900'),
      },
    ],
  },
];

async function seedFeed(page: Page) {
  await page.evaluate((notes) => {
    const storageKey = 'slag_items_default_vault';
    const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
    localStorage.setItem(storageKey, JSON.stringify([...notes, ...items]));
  }, NOTES);
  await page.reload({ waitUntil: 'domcontentloaded' });

  const inbox = page.locator('button', { hasText: 'Входящие' }).first();
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await inbox.click();
  await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 15000 });
  // Lazy images have to be decoded before their box means anything.
  await expect
    .poll(() => page.locator('#item-thumb_poster img').evaluate((node) => (node as HTMLImageElement).naturalWidth), {
      timeout: 10000,
    })
    .toBe(400);
}

const boxOf = async (page: Page, selector: string) => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return box;
};

test.describe('feed thumbnails', () => {
  test('a phone keeps tall pictures tall and wide pictures narrow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await seedFeed(page);

    // 22rem is the ceiling; a 400×600 poster reaches it and is 2/3 as wide.
    const poster = await boxOf(page, '#item-thumb_poster img');
    expect(poster.height).toBeLessThanOrEqual(352);
    expect(poster.height).toBeGreaterThan(300);
    expect(poster.width / poster.height).toBeCloseTo(2 / 3, 1);

    // A panorama can not swallow the whole column either.
    const wide = await boxOf(page, '#item-thumb_panorama img');
    expect(wide.width).toBeLessThanOrEqual(356);

    // The bubble hugs the picture: no empty slab to the right of it.
    const bubble = await boxOf(page, '#item-thumb_poster');
    const column = await boxOf(page, '.feed-card-contain');
    expect(bubble.width).toBeLessThan(column.width - 60);

    // A clip is media on the same terms.
    const clip = await boxOf(page, '#item-thumb_clip');
    expect(clip.width).toBeLessThan(column.width * 0.8);

    // Eight pictures fill one canvas: five frames and a counter, not eight crops across the column.
    const album = page.locator('#item-thumb_album [data-testid="media-album"]');
    await expect(album).toBeVisible();
    await expect(album.locator('button')).toHaveCount(6);
    await expect(album).toContainText('+3');
    const albumBox = await album.boundingBox();
    expect(albumBox?.width).toBeLessThanOrEqual(321);
    // The counter is a door, not a decoration: it opens the deck on the first hidden frame.
    await album.getByTitle('Ещё 3').click();
    const lightbox = page.getByTestId('image-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByText(/album-6\.svg/).first()).toBeVisible();
    // The deck opens on the frame that was clicked, not on the first one of the pile — and the
    // frame is really on screen, not merely marked active.
    await expect(lightbox.locator('[aria-hidden="false"] img')).toHaveAttribute('alt', 'album-6.svg');
    await expect(lightbox.locator('[aria-hidden="false"] img')).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(lightbox).not.toBeVisible();

    // The same frame twice in a row: a fresh viewer still lands on it, it does not fall back
    // to the first slide because the pager remembers where it was.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await album.getByTitle('album-4.svg').click();
      await expect(lightbox.locator('[aria-hidden="false"] img')).toHaveAttribute('alt', 'album-4.svg');
      await expect(lightbox.locator('[aria-hidden="false"] img')).toBeInViewport();
      await page.keyboard.press('Escape');
      await expect(lightbox).not.toBeVisible();
    }

    // A note with text keeps the full column.
    const withText = await boxOf(page, '#item-thumb_with_text');
    expect(withText.width).toBeGreaterThan(column.width - 12);

    await page.locator('#item-thumb_album').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/feed-thumbs-album-phone.png', fullPage: false });

    await page.locator('#item-thumb_poster').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/feed-thumbs-phone.png', fullPage: false });
  });

  test('a desktop caps the same way and still reads as a card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await seedFeed(page);

    const poster = await boxOf(page, '#item-thumb_poster img');
    expect(poster.height).toBeLessThanOrEqual(320);
    expect(poster.width / poster.height).toBeCloseTo(2 / 3, 1);

    const wide = await boxOf(page, '#item-thumb_wide img');
    expect(wide.width).toBeLessThanOrEqual(417);
    expect(wide.width / wide.height).toBeCloseTo(16 / 9, 1);

    const bubble = await boxOf(page, '#item-thumb_wide');
    const column = await boxOf(page, '.feed-card-contain');
    expect(bubble.width).toBeLessThan(column.width - 100);

    await page.locator('#item-thumb_poster').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/screenshots/feed-thumbs-desktop.png', fullPage: false });
  });
});
