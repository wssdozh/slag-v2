import { test, expect } from '@playwright/test';

test.setTimeout(240_000);

test('a card with several tracks: names on rows, real seeking, one playhead at a time', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 90000 });

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
        attachments: [
          { ...track('probe_a', 'babypills - первый_трек.wav'), extractedText: 'О чём этот трек' },
          track('probe_b', 'babypills - второй_трек.wav'),
        ],
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
  await expect(page.locator('main').first()).toBeVisible({ timeout: 90000 });

  const card = page.locator('.group').filter({ hasText: 'первый_трек' }).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card.locator('text=первый_трек')).toBeVisible();
  await expect(card.locator('text=второй_трек')).toBeVisible();
  // Title and author sit above the line, not under it.
  await expect(card.locator('text=babypills').first()).toBeVisible();
  await expect(card.locator('text=.wav')).toHaveCount(0);

  const strip = card.locator('[title="Перемотка"]').first();
  // A ready transcript stays folded until asked for.
  const accordion = card.locator('.motion-accordion').filter({ hasText: 'О чём этот трек' }).first();
  await expect(accordion).toHaveAttribute('data-expanded', 'false');
  await expect(card.getByText('О чём этот трек')).toHaveCount(1);
  await card.locator('button[aria-label="Расшифровка"]').first().click();
  await expect(accordion).toHaveAttribute('data-expanded', 'true');
  await card.locator('button[aria-label="Расшифровка"]').first().click();
  await expect(accordion).toHaveAttribute('data-expanded', 'false');
  const headerBox = await card.locator('text=первый_трек').first().boundingBox();
  const stripBox = await strip.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(stripBox).not.toBeNull();
  expect(headerBox!.y + headerBox!.height).toBeLessThan(stripBox!.y + 4);
  // `hover()` waits until the strip holds still at its current centre: a box measured
  // earlier can be stale while the card reflows, and a stale point misses the strip —
  // the drag then moves no playhead at all. The seek itself is read off the element,
  // with a budget, because the browser may deliver the pointer events late under load.
  await strip.hover();
  const box = await strip.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.75, box!.y + box!.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() => card.locator('audio').first().evaluate((el: HTMLAudioElement) => el.currentTime), {
      message: 'dragging the strip moves the real playhead',
      timeout: 5000,
    })
    .toBeGreaterThan(2.4);

  // One player at a time: starting the second pauses the first, and the first says so.
  const players = card.locator('audio');
  const firstButton = card.locator('button[title*="Воспроизвести"], button[title*="Пауза"]').nth(0);
  const secondButton = card.locator('button[title*="Воспроизвести"], button[title*="Пауза"]').nth(1);
  await firstButton.click();
  // `paused` on the element is the state the row is armed in; the title only follows it
  // after the `play` event. The collision guard pauses the first row synchronously inside
  // the second row's `play` event, so the invariant is polled instead of slept on.
  await expect
    .poll(() => players.nth(0).evaluate((el: HTMLAudioElement) => el.paused), {
      message: 'the first row actually starts playing',
      timeout: 5000,
    })
    .toBe(false);
  await secondButton.click();
  await expect
    .poll(() => players.evaluateAll((els: HTMLAudioElement[]) => els.map(el => el.paused)), {
      message: 'starting the second row leaves exactly one playhead',
      timeout: 5000,
    })
    .toEqual([true, false]);
  const pausedStates = await players.evaluateAll((els: HTMLAudioElement[]) => els.map(el => el.paused));
  console.log('PAUSED', JSON.stringify(pausedStates));
  expect(pausedStates[0]).toBe(true);
  expect(pausedStates[1]).toBe(false);
  // The paused row says so on its own button, not just in the media element.
  await expect
    .poll(
      () =>
        card
          .locator('button[title*="Воспроизвести"], button[title*="Пауза"]')
          .evaluateAll((els: HTMLButtonElement[]) => els.map(el => el.title)),
      { message: 'buttons follow the playhead', timeout: 5000 },
    )
    .toEqual(['Воспроизвести', 'Пауза']);

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

test('a track whose bytes never arrived says so instead of arming a dead play button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 90000 });

  await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('slag_items_')) continue;
      const items = JSON.parse(localStorage.getItem(key) || '[]');
      items.unshift({
        id: 'probe_missing_audio',
        type: 'note',
        title: 'Трек с другого устройства',
        content: '',
        folder: 'Входящие',
        tags: [],
        // Metadata only: sync carried the note but the bytes are still on the other device.
        attachments: [{
          id: 'probe_missing_track',
          name: 'nostalgia - пропавший трек.wav',
          type: 'audio',
          mimeType: 'audio/wav',
          size: 64000,
          duration: 4,
          relativePath: '.attachments/nostalgia - пропавший трек.wav',
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      localStorage.setItem(key, JSON.stringify(items));
      break;
    }
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 90000 });

  const card = page.locator('.group').filter({ hasText: 'пропавший трек' }).first();
  await expect(card).toBeVisible({ timeout: 10000 });
  const play = card.locator('button[title="Файла нет на устройстве"]').first();
  await expect(play).toBeVisible();
  await expect(play).toBeDisabled();
  await expect(card.getByText('файла нет', { exact: true }).first()).toBeVisible();
  await card.screenshot({ path: 'test-results/screenshots/audio-missing-file.png' });
});
