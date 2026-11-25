import { test, expect, type Page } from '@playwright/test';

/**
 * A picture whose bytes live in IndexedDB used to arrive in the worst possible way: the card
 * drew «нет файла» while the resolver was still working, then swapped in the photo. The fix is
 * a skeleton with the same box and a fade on load, so the layout never claims the file is gone.
 *
 * The probe runs from document start and watches *added* nodes, not the final DOM: a skeleton
 * that lives for one frame is still a skeleton the user saw.
 */

/** 1×1 PNG. The bytes only have to decode; nothing here judges the picture. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const NOTE = {
  id: 'reveal_note',
  type: 'note',
  title: 'фото из IndexedDB',
  content: '',
  folder: 'Входящие',
  tags: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  attachments: [
    {
      id: 'reveal_attachment',
      name: 'reveal.png',
      type: 'image',
      mimeType: 'image/png',
      size: 68,
      relativePath: '.attachments/reveal.png',
    },
  ],
};

/** The note keeps only metadata; the bytes sit in the same store a real attachment uses. */
async function seedPhotoInIndexedDb(page: Page) {
  await page.evaluate(
    async ({ note, bytes }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('slag_v2_blobs', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('attachments')) db.createObjectStore('attachments', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('attachments', 'readwrite');
          tx.objectStore('attachments').put({ ...note.attachments[0], dataUrl: bytes });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
      const key = 'slag_items_default_vault';
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify([note, ...items]));
    },
    { note: NOTE, bytes: PNG },
  );
}

test('a photo from IndexedDB is a skeleton, then a fade — never «нет файла»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const seen = { skeleton: 0, missing: 0 };
    (window as unknown as { __mediaProbe: typeof seen }).__mediaProbe = seen;
    const scan = (records: MutationRecord[]) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node.matches('[data-testid="media-skeleton"]') || node.querySelector('[data-testid="media-skeleton"]')) {
            seen.skeleton += 1;
          }
          if (node.matches('[data-testid="media-missing"]') || node.querySelector('[data-testid="media-missing"]')) {
            seen.missing += 1;
          }
        }
      }
    };
    new MutationObserver(scan).observe(document, { childList: true, subtree: true });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await seedPhotoInIndexedDb(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  const inbox = page.locator('button', { hasText: 'Входящие' }).first();
  await expect(inbox).toBeVisible({ timeout: 20000 });
  await inbox.click();

  const card = page.locator('#item-reveal_note');
  await expect(card).toBeVisible({ timeout: 15000 });

  const image = card.locator('img[alt="reveal.png"]');
  await expect(image).toHaveJSProperty('naturalWidth', 1, { timeout: 15000 });
  await expect(image).toBeVisible();

  const probe = await page.evaluate(
    () => (window as unknown as { __mediaProbe?: { skeleton: number; missing: number } }).__mediaProbe,
  );
  // The waiting state existed, and the false «нет файла» never did.
  expect(probe?.skeleton ?? 0).toBeGreaterThan(0);
  expect(probe?.missing ?? 0).toBe(0);
  await expect(card.locator('[data-testid="media-missing"]')).toHaveCount(0);

  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/screenshots/media-reveal-desktop.png' });
});
