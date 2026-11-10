/**
 * Снимает фичи, параметры и цвет с треков через лабораторию.
 *
 *   node demo/capture.mjs "track.m4a" --continuous 60
 *   node demo/capture.mjs a.m4a b.m4a --points 20,60 --window 8 --out test-results/tracks
 *
 * --continuous N  играет N секунд без seek (нормализация успевает набрать историю);
 * --points/--window  быстрый проход по точкам для сравнения секций;
 * статистика по нормализованным фичам печатается в конце.
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
  console.error('usage: node demo/capture.mjs <audio...> [--continuous 60] [--points 20,70] [--window 8] [--out dir]');
  process.exit(1);
}

const continuous = flag('continuous', '');
const points = flag('points', '20,70,140').split(',').map(Number);
const windowMs = Number(flag('window', '8')) * 1000;
const outDir = flag('out', 'test-results/tracks');
const valence = argv.includes('--valence');
const settleMs = 2500;
const sampleMs = 200;

mkdirSync(outDir, { recursive: true });

const pct = (list, p) => {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))];
};

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
  if (valence) await page.evaluate(() => window.__lab.setValence(true));

  const rows = [];
  const slug = basename(input).replace(/\.[^.]+$/, '').replace(/[^\wа-яА-ЯёЁ]+/g, '-');

  const takeSample = async (label) => {
    const state = await page.evaluate(() => ({
      status: window.__lab.status(),
      raw: window.__lab.raw(),
      normalized: window.__lab.normalized(),
      color: window.__lab.color(),
      params: window.__lab.params(),
    }));
    rows.push({
      label,
      track: state.status.time,
      raw: state.raw,
      normalized: state.normalized,
      color: state.color,
      params: state.params,
    });
  };

  if (continuous) {
    await page.evaluate(() => window.__lab.seek(0));
    await page.waitForTimeout(settleMs);
    const deadline = Date.now() + Number(continuous) * 1000;
    while (Date.now() < deadline) {
      await takeSample('all');
      await page.waitForTimeout(sampleMs);
    }
    await page.locator('#canvas-mood').screenshot({ path: join(outDir, `${slug}-continuous.png`) });
  } else {
    for (const point of points) {
      await page.evaluate((seconds) => window.__lab.seek(seconds), point);
      await page.waitForTimeout(settleMs);
      const started = Date.now();
      while (Date.now() - started < windowMs) {
        await takeSample(String(point));
        await page.waitForTimeout(sampleMs);
      }
      await page.locator('#canvas-mood').screenshot({ path: join(outDir, `${slug}-${point}.png`) });
    }
  }

  const first = rows[0];
  const rawKeys = Object.keys(first?.raw ?? {});
  const normKeys = Object.keys(first?.normalized ?? {});
  const paramKeys = Object.keys(first?.params ?? {});
  const header = [
    'trackTime',
    'label',
    ...rawKeys,
    ...normKeys.map((key) => key + '_n'),
    ...paramKeys.map((key) => key + '_p'),
    'hue',
    'sat',
    'val',
  ];
  const lines = rows.map((row) =>
    [
      row.track.toFixed(2),
      row.label,
      ...rawKeys.map((key) => Number(row.raw[key] ?? 0).toFixed(4)),
      ...normKeys.map((key) => Number(row.normalized[key] ?? 0).toFixed(4)),
      ...paramKeys.map((key) => Number(row.params?.[key] ?? 0).toFixed(4)),
      row.color.hue.toFixed(2),
      row.color.sat.toFixed(4),
      row.color.val.toFixed(4),
    ].join(','),
  );
  const out = join(outDir, `${slug}.csv`);
  writeFileSync(out, [header.join(','), ...lines].join('\n'), 'utf8');

  const stats = {};
  for (const key of normKeys) {
    const values = rows.map((row) => row.normalized[key]).filter(Number.isFinite);
    stats[key] = {
      p5: +pct(values, 0.05).toFixed(2),
      p50: +pct(values, 0.5).toFixed(2),
      p95: +pct(values, 0.95).toFixed(2),
    };
  }

  const hues = rows.map((row) => row.color.hue);
  const profile = await page.evaluate(() => window.__lab.profile());
  summary.push({
    track: basename(input),
    rows: rows.length,
    profile,
    hue: [+Math.min(...hues).toFixed(1), +Math.max(...hues).toFixed(1)],
    stats,
    errors,
  });
  await page.close();
}

console.log(JSON.stringify({ outDir, summary }, null, 2));
await browser.close();
