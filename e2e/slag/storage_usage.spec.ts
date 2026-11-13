import { test, expect } from '@playwright/test';

/**
 * Settings → «Хранилище & Бэкап» answers the one question a heavy vault asks: what is eating
 * the space? Sizes come from attachment metadata, so the list is exact without reading a single
 * blob — the numbers below are seeded with known weights and checked against `formatBytes`.
 */

const MB = 1024 * 1024;

const NOTES = [
  {
    id: 'usage_heavy',
    type: 'note',
    title: 'тяжёлое видео',
    content: '',
    folder: 'Входящие',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attachments: [
      {
        id: 'big_video',
        name: 'lecture.mp4',
        type: 'video',
        mimeType: 'video/mp4',
        size: 4 * MB,
        relativePath: '.attachments/lecture.mp4',
      },
    ],
  },
  {
    id: 'usage_photo',
    type: 'note',
    title: 'фотография',
    content: '',
    folder: 'Входящие',
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attachments: [
      {
        id: 'photo',
        name: 'poster.webp',
        type: 'image',
        mimeType: 'image/webp',
        size: Math.round(1.5 * MB),
        relativePath: '.attachments/poster.webp',
      },
    ],
  },
];

const MEMORY = [
  {
    id: 'mem_1',
    text: 'предпочитает короткие ответы по делу',
    normalized: 'предпочита предпоч коротк ответ дел',
    kind: 'pref',
    tag: null,
    importance: 4,
    mentions: 1,
    usedCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usedAt: 0,
  },
];

async function seedVault(page: import('@playwright/test').Page) {
  await page.evaluate(
    ({ notes, memory }) => {
      // A known vault, not the demo one: totals below must be the seeded numbers.
      localStorage.setItem('slag_items_default_vault', JSON.stringify(notes));
      localStorage.setItem('slag_memory_default_vault', JSON.stringify(memory));
    },
    { notes: NOTES, memory: MEMORY },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('settings show what occupies the vault and the heaviest files first', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await seedVault(page);

  await page.getByTestId('sidebar-settings-btn').click();
  const scope = page.locator('.fixed.z-50').filter({ has: page.locator('[data-tab="vault"]') });
  await scope.locator('[data-tab="vault"]').click();

  const usage = scope.getByTestId('storage-usage');
  await expect(usage).toBeVisible({ timeout: 15000 });

  // Media is 5.5 MB across two files, and neither number is a guess.
  await expect(usage.getByTestId('storage-total')).toContainText('MB');
  const heavy = usage.getByTestId('heavy-file-big_video');
  const photo = usage.getByTestId('heavy-file-photo');
  await expect(heavy).toContainText('4.0 MB');
  await expect(photo).toContainText('1.5 MB');
  await expect(usage).toContainText('lecture.mp4');
  await expect(usage).toContainText('poster.webp');

  // Heaviest first, and the copy is text, not NaN.
  const heavyBox = await heavy.boundingBox();
  const photoBox = await photo.boundingBox();
  expect(heavyBox?.y ?? 0).toBeLessThan(photoBox?.y ?? 0);
  await expect(usage).not.toContainText('NaN');

  // The ring speaks in percentages: a composition without shares is just a list.
  await expect(usage.getByTestId('media-kind-video')).toContainText('73%');
  await expect(usage.getByTestId('media-kind-video')).toContainText('4.0 MB');
  await expect(usage.getByTestId('media-kind-image')).toContainText('27%');

  // The settings surface scrolls its tab, so one picture cannot hold the whole section: the
  // totals and the heavy-file list are two screenshots of the same run.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await usage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/storage-usage-desktop.png' });
  await usage.getByText('Самые тяжёлые файлы').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/screenshots/storage-usage-heavy.png' });

  // The row is a door: it opens the note the file came from. The editor is a lazy chunk, so on a
  // cold dev graph it lands well after the click.
  await photo.click();
  await expect(page.getByTestId('fullscreen-editor-modal')).toBeVisible({ timeout: 60000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('fullscreen-editor-modal')).toHaveCount(0, { timeout: 15000 });
});
