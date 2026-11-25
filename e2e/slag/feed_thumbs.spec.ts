import { test, expect, type Page } from '@playwright/test';

/**
 * Feed attachments share compact square tiles; opening a tile shows the original
 * in the viewer without losing the clicked position. The fixtures cover distinct source ratios.
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
    // Eight attachments exercise tile wrapping and opening a later image.
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
    // A picture with recognised text: the panel is closed, so the card must stay a bubble.
    // Its text used to live in the DOM and pull the card out to the whole column.
    id: 'thumb_ocr',
    type: 'note',
    title: 'ocr',
    content: '',
    folder: 'Входящие',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attachments: [
      {
        id: 'thumb_ocr_file',
        name: 'poster-ocr.svg',
        type: 'image',
        mimeType: 'image/svg+xml',
        size: 1024,
        relativePath: '.attachments/poster-ocr.svg',
        dataUrl: svg(400, 600, 'постер с текстом'),
        extractedText: 'Lipsticks. Nails. Blades. ARASAKA — предупреждение о военном кибероружии, очень длинная строка распознанного текста, которая раньше распирала карточку.',
      },
    ],
  },
  {
    // A note whose bytes never arrived: an id that moved, an upload that got lost. The card
    // has to say so instead of showing the browser's broken-image icon.
    id: 'thumb_missing',
    type: 'note',
    title: 'missing',
    content: '',
    folder: 'Входящие',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attachments: [
      {
        id: 'thumb_missing_file',
        name: 'gone.webp',
        type: 'image',
        mimeType: 'image/webp',
        size: 1024,
        relativePath: '.attachments/att_gone_gone.webp',
      },
    ],
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

  const inbox = page.getByRole('button', { name: 'Входящие', exact: true });
  const poster = page.locator('#item-thumb_poster');
  await expect(inbox.or(poster).first()).toBeVisible({ timeout: 20000 });
  if (await inbox.isVisible() && !(await poster.isVisible())) await inbox.click({ timeout: 5000 });
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
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    test(`square tiles stay compact and open the original at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await seedFeed(page);

      for (const shape of SHAPES) {
        const card = page.locator(`#item-${shape.id}`);
        const image = card.getByRole('img', { name: `${shape.name}.svg`, exact: true });
        await expect(image).toBeVisible();
        await expect(image).toHaveJSProperty('naturalWidth', shape.width);
        await expect(image).toHaveJSProperty('naturalHeight', shape.height);
        await expect(image).toHaveClass(/object-cover/);
        const box = await image.boundingBox();
        expect(box?.width).toBe(80);
        expect(box?.height).toBe(80);
      }
      const column = await boxOf(page, '.feed-card-contain');
      expect((await boxOf(page, '#item-thumb_poster')).width).toBeLessThan(column.width - 60);
      expect((await boxOf(page, '#item-thumb_clip')).width).toBeLessThan(column.width * 0.8);

      const album = page.locator('#item-thumb_album').getByTestId('item-attachment-grid');
      await expect(album.getByRole('button', { name: /^album-/ })).toHaveCount(8);
      expect((await album.boundingBox())?.width).toBeLessThanOrEqual(column.width);
      const lightbox = page.getByTestId('image-lightbox');
      for (const index of [6, 4, 4]) {
        const name = `album-${index}.svg`;
        await album.getByRole('button', { name, exact: true }).click({ timeout: 5000 });
        await expect(lightbox).toBeVisible();
        const active = lightbox.locator('[aria-hidden="false"] img');
        await expect(active).toHaveAttribute('alt', name);
        await expect(active).toBeInViewport();
        await page.keyboard.press('Escape');
        await expect(lightbox).not.toBeVisible();
      }

      const missing = page.locator('#item-thumb_missing');
      await expect(missing.getByTestId('media-missing')).toBeVisible();
      await expect(missing.locator('img')).toHaveCount(0);
      const textCard = page.locator('#item-thumb_with_text');
      await expect(textCard).toContainText('Картинка к заметке с текстом');
      await expect(textCard.getByRole('img', { name: 'wide.svg' })).toBeVisible();

      const ocr = page.locator('#item-thumb_ocr');
      const collapsedWidth = (await boxOf(page, '#item-thumb_ocr')).width;
      expect(collapsedWidth).toBeLessThan(column.width - 60);
      await ocr.hover();
      const openOcr = ocr.getByRole('button', { name: 'Текст: poster-ocr.svg' });
      await expect(openOcr).toHaveAttribute('aria-expanded', 'false');
      await openOcr.click({ timeout: 5000 });
      await expect(ocr).toContainText('Lipsticks. Nails. Blades.');
      await ocr.getByRole('button', { name: 'Скрыть распознанный текст' }).click({ timeout: 5000 });
      await expect(ocr.getByText(/Lipsticks/)).toHaveCount(0);
      expect((await boxOf(page, '#item-thumb_ocr')).width).toBeCloseTo(collapsedWidth, 0);
      await album.screenshot({ path: `test-results/screenshots/feed-thumbs-${viewport.width}.png` });
    });
  }

  test('a job that was running when the app closed is not a job any more', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const { parseMarkdownToItem, serializeItemToMarkdown } = await import('/src/lib/vault/markdownSerializer.ts');
      const raw = [
        '---',
        'id: item_stale',
        'type: note',
        'title: stale',
        'attachments:',
        '  - id: att_stale',
        '    name: photo.webp',
        '    type: image',
        '    mimeType: image/webp',
        '    relativePath: .attachments/att_stale_photo.webp',
        '    enrichmentStatus: processing',
        '---',
        '',
        'body',
        '',
      ].join('\n');

      const parsed = parseMarkdownToItem(raw, 'item_stale');
      const written = serializeItemToMarkdown({
        id: 'item_write',
        type: 'note',
        title: 'write',
        content: '',
        folder: 'Входящие',
        tags: [],
        createdAt: 1,
        updatedAt: 1,
        attachments: [{
          id: 'att_write',
          name: 'photo.webp',
          type: 'image' as const,
          mimeType: 'image/webp',
          size: 10,
          relativePath: '.attachments/att_write_photo.webp',
          enrichmentStatus: 'processing' as const,
        }],
      });

      return {
        read: parsed.attachments?.[0]?.enrichmentStatus,
        writesProcessing: written.includes('enrichmentStatus: processing'),
      };
    });

    // Read: a spinner nobody is turning becomes "no text yet, try again".
    expect(result.read).toBe('idle');
    // Write: the next save does not poison the note with a promise that cannot outlive the app.
    expect(result.writesProcessing).toBe(false);
  });
});
