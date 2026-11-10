import { test, expect, type Page } from '@playwright/test';

test.setTimeout(90_000);

type OrbBands = { volume: number; bass: number; mid: number; high: number };
type OrbDebug = { time: number; frames: number; bands: OrbBands };

const TONE = 'tone';
const SILENCE = 'silence';
type TrackKind = typeof TONE | typeof SILENCE;

/**
 * A real 2 s wav, because the orb reads the actual Web Audio spectrum: a
 * generated 100 Hz + 2 kHz signal puts energy in bass and mid, an all-zero
 * buffer proves the orb does not invent motion out of silence.
 */
async function seedTrack(page: Page, kind: TrackKind): Promise<void> {
  await page.evaluate((trackKind: TrackKind) => {
    const sampleRate = 44_100;
    const seconds = trackKind === 'tone' ? 6 : 2;
    const samples = sampleRate * seconds;
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
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, samples * 2, true);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const fade = Math.min(1, t * 50, (seconds - t) * 50);
      const sample =
        trackKind === 'tone'
          ? (Math.sin(2 * Math.PI * 100 * t) * 0.5 + Math.sin(2 * Math.PI * 2000 * t) * 0.15) * fade
          : 0;
      view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

    const item = {
      id: `orb_probe_${trackKind}`,
      type: 'note',
      title: `Орб ${trackKind}`,
      content: '',
      folder: 'Входящие',
      tags: [],
      attachments: [
        {
          id: `att_orb_${trackKind}`,
          name: `orb_${trackKind}.wav`,
          type: 'audio',
          mimeType: 'audio/wav',
          size: bytes.length,
          duration: seconds,
          relativePath: `.attachments/orb_${trackKind}.wav`,
          dataUrl: `data:audio/wav;base64,${btoa(binary)}`,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith('slag_items_'));
    const storageKey = key ?? 'slag_items_default_vault';
    const items = JSON.parse(localStorage.getItem(storageKey) || '[]') as unknown[];
    items.unshift(item);
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, kind);
}

async function openAudioPanel(page: Page) {
  const addTab = page
    .locator('.dv-groupview')
    .nth(1)
    .locator('button[title="Добавить вкладку в эту группу"]');
  await expect(addTab).toBeVisible({ timeout: 10_000 });
  await addTab.click();

  const option = page.locator('button', { hasText: 'Аудиоплеер' }).first();
  await expect(option).toBeVisible({ timeout: 5_000 });
  await option.click();

  const canvas = page.locator('canvas[data-testid="chatgpt-orb-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 10_000 });
  return canvas;
}

async function boot(page: Page, kind: TrackKind) {
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });
  await seedTrack(page, kind);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 });
  return openAudioPanel(page);
}

function readOrb(page: Page): Promise<OrbDebug | null> {
  return page.evaluate(() => {
    const debug = (window as Window & { __orbDebug?: OrbDebug }).__orbDebug;
    return debug ? { ...debug, bands: { ...debug.bands } } : null;
  });
}

async function play(page: Page) {
  await page.locator('button[title^="Воспроизведение"]').first().click();
}

test.describe('liquid orb motion', () => {
  test('reads bass and mid from a real tone, not the top of the spectrum', async ({ page }) => {
    const canvas = await boot(page, TONE);
    await play(page);

    // Poll the bass itself: the FFT needs one full window (~40 ms) before the
    // first spectrum exists, while loudness is already non-zero.
    await expect
      .poll(async () => (await readOrb(page))?.bands.bass ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(0.5);

    const bands = (await readOrb(page))!.bands;
    expect(bands.volume).toBeGreaterThan(0.2);
    expect(bands.bass).toBeGreaterThan(bands.mid);
    expect(bands.high).toBeLessThan(0.1);

    await page.waitForTimeout(400);
    await canvas.screenshot({ path: 'test-results/screenshots/audio-orb-react.png' });
    await page.screenshot({ path: 'test-results/screenshots/audio-orb-panel.png' });
  });

  test('does not fabricate motion while the track is silent', async ({ page }) => {
    await boot(page, SILENCE);
    await play(page);
    await page.waitForTimeout(1_500);

    const bands = (await readOrb(page))!.bands;
    expect(bands.volume).toBeLessThan(0.08);
    expect(bands.bass).toBeLessThan(0.08);
    expect(bands.mid).toBeLessThan(0.08);
    expect(bands.high).toBeLessThan(0.08);
  });

  test('time runs in seconds, the shape moves, and a pause settles the loop', async ({ page }) => {
    const canvas = await boot(page, TONE);
    await play(page);
    await page.waitForTimeout(300);

    const first = (await readOrb(page))!;
    await page.waitForTimeout(1_000);
    const second = (await readOrb(page))!;

    expect(second.time - first.time).toBeGreaterThan(0.85);
    expect(second.time - first.time).toBeLessThan(1.15);

    const beforeShot = await canvas.screenshot();
    await page.waitForTimeout(1_200);
    const afterShot = await canvas.screenshot();
    expect(beforeShot.equals(afterShot)).toBe(false);

    await page.locator('button[title^="Пауза"]').first().click();
    await page.waitForTimeout(1_200);
    const paused = (await readOrb(page))!;
    await page.waitForTimeout(500);
    const still = (await readOrb(page))!;
    expect(still.frames).toBe(paused.frames);
  });

  test('reduced motion draws one calm frame and never animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const canvas = await boot(page, TONE);

    const first = (await readOrb(page))!;
    const beforeShot = await canvas.screenshot();
    await page.waitForTimeout(800);
    const afterShot = await canvas.screenshot();
    const second = (await readOrb(page))!;

    expect(second.frames).toBe(first.frames);
    expect(beforeShot.equals(afterShot)).toBe(true);
  });
});
