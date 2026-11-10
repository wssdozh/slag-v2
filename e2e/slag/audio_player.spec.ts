import { test, expect } from '@playwright/test';

test.setTimeout(120_000);

test('a card with several tracks: names on rows, real seeking, one playhead at a time', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20000 });

  await page.evaluate(() => {
    // A 4-second silent wav, built here so there is something real to seek in.
    const rate = 8000;
    const samples = rate * 4;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    const ascii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, samples * 2, true);

    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;
    const track = (id: string, name: string) => ({
      id,
      name,
      type: 'audio',
      mimeType: 'audio/wav',
      size: bytes.length,
      duration: 4,
      relativePath: `.attachments/${name}`,
      dataUrl,
    });

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('slag_items_')) continue;
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      const note = (id: string, title: string, attachments: object[]) => ({
        id,
        type: 'note',
        title,
        content: '',
        folder: 'Входящие',
        tags: [],
        attachments,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      items.unshift({
        id: 'probe_two_tracks',
        type: 'note',
        title: 'Два трека',
        content: '',
        folder: 'Входящие',
        tags: [],
        attachments: [track('probe_a', 'babypills - первый_трек.wav'), track('probe_b', 'babypills - второй_трек.wav')],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      // One song: it carries metadata, so the row grows a title/author header.
      items.unshift(note('probe_single_song', 'Одна песня', [track('probe_song', 'beatles - Hey Jude.wav')]));
      // One recorded memo: its name is a machine stamp, so the row stays label-free.
      items.unshift(
        note('probe_single_memo', 'Голосовое', [{ ...track('probe_memo', 'voice_11-22-33.webm'), duration: 7 }]),
      );
      localStorage.setItem(key, JSON.stringify(items));
      break;
    }
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20000 });

  const card = page.locator('.group').filter({ hasText: 'первый_трек' }).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card.locator('text=первый_трек')).toBeVisible();
  await expect(card.locator('text=второй_трек')).toBeVisible();
  // Title and author sit above the line, not under it.
  await expect(card.locator('text=babypills').first()).toBeVisible();
  await expect(card.locator('text=.wav')).toHaveCount(0);

  const strip = card.locator('[title="Перемотка"]').first();
  const headerBox = await card.locator('text=первый_трек').first().boundingBox();
  const stripBox = await strip.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(stripBox).not.toBeNull();
  expect(headerBox!.y + headerBox!.height).toBeLessThan(stripBox!.y + 4);
  const box = await strip.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const time = await card.locator('audio').first().evaluate((el: HTMLAudioElement) => el.currentTime);
  console.log('SEEK', time.toFixed(2));
  expect(time).toBeGreaterThan(2.4);

  // One player at a time: starting the second pauses the first, and the first says so.
  const players = card.locator('audio');
  const firstButton = card.locator('button[title*="Воспроизвести"], button[title*="Пауза"]').nth(0);
  const secondButton = card.locator('button[title*="Воспроизвести"], button[title*="Пауза"]').nth(1);
  await firstButton.click();
  await page.waitForTimeout(300);
  await secondButton.click();
  await page.waitForTimeout(300);
  const pausedStates = await players.evaluateAll((els: HTMLAudioElement[]) => els.map(el => el.paused));
  const titles = await card.locator('button[title*="Воспроизвести"], button[title*="Пауза"]').evaluateAll(
    (els: HTMLButtonElement[]) => els.map(el => el.title),
  );
  console.log('PAUSED', JSON.stringify(pausedStates), 'TITLES', JSON.stringify(titles));
  expect(pausedStates[0]).toBe(true);
  expect(pausedStates[1]).toBe(false);

  await card.screenshot({ path: 'test-results/screenshots/voice-card-names.png' });

  // A single named track gets the same header + line as a multi-track card.
  const single = page.locator('.group').filter({ hasText: 'Hey Jude' }).first();
  await expect(single).toBeVisible({ timeout: 10000 });
  await expect(single.locator('text=beatles')).toBeVisible();
  await expect(single.locator('text=.wav')).toHaveCount(0);
  await expect(single.getByTestId('voice-progress')).toHaveCount(0);
  await expect(single.getByTestId('audio-row-meta')).toBeVisible();

  const singleStrip = single.locator('[title="Перемотка"]').first();
  await expect(singleStrip).toBeVisible();
  const songTitle = await single.locator('text=Hey Jude').first().boundingBox();
  const songStrip = await singleStrip.boundingBox();
  expect(songTitle).not.toBeNull();
  expect(songStrip).not.toBeNull();
  expect(songTitle!.y + songTitle!.height).toBeLessThan(songStrip!.y + 4);

  // The play button and the right-hand block are the same height: one row, not two.
  const playBox = await single.locator('button[title*="Воспроизвести"]').first().boundingBox();
  const metaBox = await single.getByTestId('audio-row-meta').boundingBox();
  expect(playBox).not.toBeNull();
  expect(metaBox).not.toBeNull();
  expect(Math.abs(playBox!.height - metaBox!.height)).toBeLessThanOrEqual(1);
  await single.screenshot({ path: 'test-results/screenshots/voice-single-song.png' });

  // A recorded memo has a machine name: no header, but it still owns a real line.
  const audioCount = await page.locator('audio').count();
  await expect(page.locator('[title="Перемотка"]')).toHaveCount(audioCount);
  await expect(page.locator('[data-testid="audio-row-meta"]')).toHaveCount(audioCount - 1);
  await expect(page.locator('text=voice_11-22-33')).toHaveCount(0);
});
