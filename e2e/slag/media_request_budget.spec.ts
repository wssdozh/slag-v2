import { test, expect, type Page } from '@playwright/test';
import { setupSlag } from '../support/slagSetup';
import { generatePhotoDataUrl, installAttachmentReadProbe, readAttachmentProbe, type AttachmentProbe } from '../support/mediaProbe';

/**
 * The media request budget of the default desktop shell, in one pass: the feed's cards resolve the
 * window they show, the folder pane resolves the tiles it can see, the audio and file rows wait for
 * their tab, and the viewer resolves a slide when paging reaches it — nothing outside that.
 *
 * Fixture: 32 notes with three photos each in «Входящие» (the feed window mounts the newest 15, so
 * 51 photos sit outside it) plus one audio and one file on the oldest note, which never mounts.
 */

const FOLDER = 'Входящие';
const NOTES = 32;
const PER_NOTE = 3;
const ATTACHMENTS = NOTES * PER_NOTE;
const WINDOW_CHUNK = 15;
const AUDIO = { id: 'budget_audio', name: 'budget-voice.webm', type: 'audio' as const, mimeType: 'audio/webm', size: 1024, relativePath: '.attachments/budget_voice.webm' };
const FILE = { id: 'budget_file', name: 'budget-notes.txt', type: 'file' as const, mimeType: 'text/plain', size: 256, relativePath: '.attachments/budget_notes.txt' };

const photoId = (note: number, slot: number) => `budget_${note}_${slot}`;
const photosOf = (notes: number[]) => notes.flatMap((note) => [0, 1, 2].map((slot) => photoId(note, slot)));
const idsOf = (probe: AttachmentProbe, source: string) =>
  Array.from(new Set(probe.asks.filter((ask) => ask.source === source).map((ask) => ask.id)));

async function seedFolder(page: Page): Promise<string> {
  const photo = await generatePhotoDataUrl(page);
  await page.evaluate(async ({ folder, notes, perNote, photoUrl, audio, file }) => {
    const { storage } = await import('/src/lib/storage/index.ts');
    // The inbox view, not «all folders»: the deck the spec pages through must be this folder's.
    storage.saveWorkspaceState({ inboxMode: 'unsorted' });
    const now = Date.now();
    const photoSet = (prefix: string, note: number) => Array.from({ length: perNote }, (_, slot) => ({
      id: `${prefix}_${note}_${slot}`,
      name: `photo-${note}-${slot}.webp`,
      type: 'image' as const,
      mimeType: 'image/webp',
      size: 1000,
      relativePath: `.attachments/${prefix}_${note}_${slot}.webp`,
      dataUrl: photoUrl,
    }));
    for (let note = 0; note < notes; note += 1) {
      const extra = note === 0
        ? [{ ...audio, dataUrl: 'data:audio/webm;base64,AAAAHGZ0eXBpc29tAAACAGlzb21pc28y' },
          { ...file, dataUrl: 'data:text/plain;base64,cGFuZQ==' }]
        : [];
      storage.saveItem({
        id: `budget_note_${note}`,
        type: 'note',
        title: `Заметка ${note}`,
        content: '',
        folder,
        tags: [],
        attachments: [...photoSet('budget', note), ...extra],
        createdAt: now - (notes - note) * 1_000,
        updatedAt: now - (notes - note) * 1_000,
      });
      // A second folder with the same number of photos: switching to it replaces every tile and
      // the same-length list must not inherit what the first folder had already seen.
      storage.saveItem({
        id: `other_note_${note}`,
        type: 'note',
        title: `Другая ${note}`,
        content: '',
        folder: 'Проекты',
        tags: [],
        attachments: photoSet('other', note),
        createdAt: now - (notes - note) * 1_000,
        updatedAt: now - (notes - note) * 1_000,
      });
    }
    await storage.attachments.flush();
  }, { folder: FOLDER, notes: NOTES, perNote: PER_NOTE, photoUrl: photo, audio: AUDIO, file: FILE });
  return photo;
}

test('default shell: feed, folder pane, audio/file tabs and paging stay inside their budget', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAttachmentReadProbe(page);
  await setupSlag(page, testInfo);
  const photo = await seedFolder(page);

  // A cold mount: only a reload empties the session url cache the seeding just filled.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.feed-card-contain').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('folder-media-grid')).toBeVisible({ timeout: 60_000 });
  // Bytes are in when every rendered grid image has a source and the pane's first screen has its
  // tiles: the attribute is set as soon as the card or the tile resolves, below-the-fold or not.
  await expect.poll(async () => page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="item-attachment-grid"] img'));
    const tiles = Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="folder-media-grid"] img'));
    return cards.length > 0 && cards.every((image) => Boolean(image.getAttribute('src'))) && tiles.length >= 12;
  }), { timeout: 60_000 }).toBe(true);

  const probe = await readAttachmentProbe(page);
  const windowNotes = Array.from({ length: WINDOW_CHUNK }, (_, index) => NOTES - 1 - index);
  const offWindowNotes = Array.from({ length: NOTES - WINDOW_CHUNK }, (_, note) => note);
  const feedIds = idsOf(probe, 'feed');
  const paneIds = idsOf(probe, 'on-demand');
  const geometry = await page.evaluate(() => {
    const column = document.querySelector('[data-testid="folder-media-grid"]')?.closest('.overflow-y-auto');
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-media-tile]'));
    const columnBox = column?.getBoundingClientRect();
    return {
      tiles: tiles.length,
      visibleTiles: columnBox
        ? tiles.filter((tile) => {
          const box = tile.getBoundingClientRect();
          return box.bottom > columnBox.top && box.top < columnBox.bottom;
        }).length
        : 0,
      tilesWithSrc: tiles.filter((tile) => Boolean(tile.querySelector('img[src^="data:"]'))).length,
    };
  });

  const summary = {
    feedIds: feedIds.length,
    feedWindowAttachments: windowNotes.length * PER_NOTE,
    feedOffWindow: feedIds.filter((id) => photosOf(offWindowNotes).includes(id)).length,
    paneIds: paneIds.length,
    paneVisibleTiles: geometry.visibleTiles,
    paneTiles: geometry.tiles,
    paneTilesWithSrc: geometry.tilesWithSrc,
    audioBeforeTabs: paneIds.filter((id) => id === AUDIO.id).length,
    fileBeforeTabs: paneIds.filter((id) => id === FILE.id).length,
    readIds: Object.keys(probe.payloadCharsById).length,
    readBytes: Object.values(probe.payloadCharsById).reduce((total, chars) => total + Math.floor((chars * 3) / 4), 0),
  };
  console.log('[media-request-budget]', JSON.stringify(summary));
  await testInfo.attach('media-request-budget', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });

  // The feed's budget: fifteen mounted cards, not one attachment from outside the window.
  expect(feedIds.length).toBe(windowNotes.length * PER_NOTE);
  expect(summary.feedOffWindow).toBe(0);
  // The pane lists every photo, resolves the ones near its column, and nothing else.
  expect(geometry.tiles).toBe(ATTACHMENTS);
  expect(geometry.visibleTiles).toBeGreaterThan(0);
  expect(paneIds.length).toBeGreaterThan(0);
  expect(paneIds.length).toBeLessThan(ATTACHMENTS);
  expect(paneIds.length).toBeLessThanOrEqual(geometry.tilesWithSrc);
  // Closed tabs asked for nothing.
  expect(summary.audioBeforeTabs).toBe(0);
  expect(summary.fileBeforeTabs).toBe(0);

  // The tabs still work: their bytes arrive when the tab is opened.
  await page.locator('[data-media-tab="audio"]').click();
  await expect.poll(async () => idsOf(await readAttachmentProbe(page), 'on-demand')).toContain(AUDIO.id);
  await page.locator('[data-media-tab="files"]').click();
  await expect.poll(async () => idsOf(await readAttachmentProbe(page), 'on-demand')).toContain(FILE.id);
  await expect.poll(async () => page.locator('[data-testid="folder-profile"] a[download="budget-notes.txt"]').getAttribute('href')).toMatch(/^data:text\/plain/);

  // The same folder edited: one photo added. Tiles that kept their node stay loaded and are not
  // observed again, the added tile resolves when it is reached, and nothing is forgotten.
  await page.locator('[data-media-tab="media"]').click();
  await expect(page.getByTestId('folder-media-grid')).toBeVisible();
  await page.evaluate(async ({ photoBytes }) => {
    const { storage } = await import('/src/lib/storage/index.ts');
    const note = storage.getItemById('budget_note_31');
    if (!note) throw new Error('fixture note is gone');
    storage.saveItem({
      ...note,
      attachments: [...(note.attachments ?? []), {
        id: 'budget_added',
        name: 'photo-added.webp',
        type: 'image',
        mimeType: 'image/webp',
        size: 1000,
        relativePath: '.attachments/budget_added.webp',
        dataUrl: photoBytes,
      }],
    });
    await storage.attachments.flush();
  }, { photoBytes: photo });
  await expect(page.locator('[data-media-tile]')).toHaveCount(ATTACHMENTS + 1, { timeout: 20_000 });
  await expect.poll(async () => page.evaluate(() => (
    document.querySelectorAll('[data-testid="folder-media-grid"] img[src^="data:"]').length
  )), { timeout: 20_000 }).toBeGreaterThan(11);
  await page.locator('[data-media-tile="budget_added"]').scrollIntoViewIfNeeded();
  await expect.poll(async () => page.evaluate(() => Boolean(
    document.querySelector('[data-media-tile="budget_added"] img[src^="data:"]'),
  )), { timeout: 20_000 }).toBe(true);

  // Paging reaches a note outside the feed window, and the viewer resolves only the slide it lands on.
  await page.locator('[data-media-tab="media"]').click();
  const newest = NOTES - 1;
  const targetIndex = (NOTES - WINDOW_CHUNK) * PER_NOTE - 1;
  const targetNote = Math.floor(targetIndex / PER_NOTE);
  const targetName = `photo-${targetNote}-${targetIndex % PER_NOTE}.webp`;
  await expect(page.locator(`#item-budget_note_${targetNote}`)).toHaveCount(0);
  await page.locator(`#item-budget_note_${newest} [data-testid="item-attachment-grid"] button[aria-label="photo-${newest}-0.webp"]`).click();
  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible();
  for (let press = 0; press < newest * PER_NOTE - targetIndex; press += 1) await page.keyboard.press('ArrowLeft');
  await expect(lightbox.getByTestId('viewer-chrome-top').locator('p').first()).toHaveText(targetName);
  const slide = lightbox.locator(`img[alt="${targetName}"]`);
  await expect(slide).toHaveAttribute('src', /^data:image\/webp;base64,/);
  await expect.poll(async () => slide.evaluate((image) => (image as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(idsOf(await readAttachmentProbe(page), 'on-demand')).toContain(photoId(targetNote, targetIndex % PER_NOTE));
  // Evidence: the deck on a slide of a note outside the feed window, resolved on demand.
  await page.screenshot({
    path: 'test-results/screenshots/media-request-budget-offwindow-slide.png',
    animations: 'disabled',
  });

  // Replace every tile with another folder of the same size: the new grid resolves its own photos,
  // which only happens if the observer survived the swap and the seen ids followed the new list.
  await page.keyboard.press('Escape');
  await expect(lightbox).toBeHidden();
  await page.locator('[data-testid="folder-tree-row"][data-folder-path="Проекты"]').click();
  await expect(page.locator('[data-media-tile]')).toHaveCount(ATTACHMENTS, { timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => (
    document.querySelectorAll('[data-testid="folder-media-grid"] img[src^="data:"]').length
  )), { timeout: 30_000 }).toBeGreaterThan(11);
  const replaced = idsOf(await readAttachmentProbe(page), 'on-demand').filter((id) => id.startsWith('other_'));
  expect(replaced.length).toBeGreaterThan(11);
});
