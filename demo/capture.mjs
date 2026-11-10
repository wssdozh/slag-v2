/**
 * Снимает фичи и цвет с треков через лабораторию.
 *
 *   node demo/capture.mjs track1.m4a track2.m4a --points 15,60,120 --window 8 --out test-results/tracks
 *
 * На каждый трек: ставит currentTime в точки, даёт огибающим устояться,
 * пишет raw-фичи и hue/sat/val пять раз в секунду, кладёт CSV и кадр панели.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const argv = process.argv.slice(2);
const isFlagValue = (index) => index > 0 && argv[index - 1].startsWith('--');
const flag = (name, fallback) => {
  const index = argv.indexOf('--' + name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const inputs = argv.filter((value, index) => !value.startsWith('--') && !isFlagValue(index));
if (inputs.length === 0) {
  console.error('usage: node demo/capture.mjs <audio...> [--points 15,60] [--window 8] [--out dir]');
  process.exit(1);
}

const points = flag('points', '20,70,140').split(',').map(Number);
const windowMs = Number(flag('window', '8')) * 1000;
const outDir = flag('out', 'test-results/tracks');
const settleMs = 2500;
const sampleMs = 200;

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

const summary = [];

for (const input of inputs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));

  await page.goto('file:///D:/bobis/interesting/coding/SLAG%20v2/demo/orb-lab.html');
  await page.setInputFiles('#file', input);
  await page.waitForFunction(() => window.__lab && window.__lab.status().mode === 'file', null, { timeout: 25000 });
  await page.waitForTimeout(600);

  const rows = [];
  const slug = basename(input).replace(/\.[^.]+$/, '').replace(/[^\wа-яА-ЯёЁ]+/g, '-');

  for (const point of points) {
    await page.evaluate((seconds) => window.__lab.seek(seconds), point);
    await page.waitForTimeout(settleMs);

    const started = Date.now();
    while (Date.now() - started < windowMs) {
      const state = await page.evaluate(() => ({
        status: window.__lab.status(),
        raw: window.__lab.raw(),
        normalized: window.__lab.normalized(),
        color: window.__lab.color(),
      }));
      rows.push({
        t: point + (Date.now() - started) / 1000,
        track: state.status.time,
        raw: state.raw,
        normalized: state.normalized,
        color: state.color,
      });
      await page.waitForTimeout(sampleMs);
    }

    await page.locator('#canvas-mood').screenshot({ path: join(outDir, `${slug}-${point}.png`) });
  }

  const rawKeys = Object.keys(rows[0]?.raw ?? {});
  const normKeys = Object.keys(rows[0]?.normalized ?? {});
  const lines = rows.map((row) =>
    [
      row.t.toFixed(2),
      row.track.toFixed(2),
      ...rawKeys.map((key) => Number(row.raw[key] ?? 0).toFixed(4)),
      ...normKeys.map((key) => Number(row.normalized[key] ?? 0).toFixed(4)),
      row.color.hue.toFixed(2),
      row.color.sat.toFixed(4),
      row.color.val.toFixed(4),
    ].join(','),
  );
  const out = join(outDir, `${slug}.csv`);
  writeFileSync(out, [['t', 'track', ...rawKeys, ...normKeys.map((key) => key + '_n'), 'hue', 'sat', 'val'].join(','), ...lines].join('\n'), 'utf8');

  const hues = rows.map((row) => row.color.hue);
  const sats = rows.map((row) => row.color.sat);
  summary.push({
    track: basename(input),
    rows: rows.length,
    hue: [Math.min(...hues), Math.max(...hues)].map((value) => +value.toFixed(1)),
    sat: [Math.min(...sats), Math.max(...sats)].map((value) => +value.toFixed(2)),
    errors,
  });
  await page.close();
}

console.log(JSON.stringify({ outDir, summary }, null, 2));
await browser.close();
