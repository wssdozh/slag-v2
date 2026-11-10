/**
 * Поведенческие проверки цвета: устойчивость, детерминизм, стабильность лада.
 *
 *   node demo/valence-probe.mjs "track.m4a"
 *
 * V3  оттенок за 60 с не гуляет больше 60° и не проезжает больше 120°;
 * V4  три разных seek дают один и тот же оттенок (±1°);
 * V2b лад не меняется между началом, серединой и концом трека.
 */
import { chromium } from '@playwright/test';

const input = process.argv[2];
if (!input) {
  console.error('usage: node demo/valence-probe.mjs <audio>');
  process.exit(1);
}

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

await page.goto('file:///D:/bobis/interesting/coding/SLAG%20v2/demo/orb-lab.html');
await page.setInputFiles('#file', input);
await page.waitForFunction(() => window.__lab && window.__lab.status().mode === 'file', null, { timeout: 25000 });
await page.waitForFunction(() => window.__lab.profile() !== null, null, { timeout: 25000 });

const profile = await page.evaluate(() => window.__lab.profile());
const duration = await page.evaluate(() => window.__lab.status().duration);
await page.evaluate(() => window.__lab.setValence(true));

// V2b: лад по трём срезам
const slices = await page.evaluate(() => {
  const cuts = [[0, 0.34], [0.33, 0.67], [0.66, 1]];
  return cuts.map(([from, to]) => {
    const slice = window.__lab.profileSlice(from, to);
    return slice && slice.key
      ? { key: slice.key.key, mode: slice.key.mode, third: +slice.key.thirdScore.toFixed(2), conf: +slice.key.confidence.toFixed(2) }
      : null;
  });
});

// V4: три seek, один и тот же оттенок трека (без дыхания секции)
const hueAt = async (seconds) => {
  await page.evaluate((value) => window.__lab.seek(value), seconds);
  await page.waitForTimeout(2500);
  return page.evaluate(() => window.__lab.color().trackHue);
};
const points = [duration * 0.15, duration * 0.5, duration * 0.85];
const seekHues = [];
for (const point of points) seekHues.push(await hueAt(point));

// V3: минута непрерывного воспроизведения
await page.evaluate(() => window.__lab.seek(0));
await page.waitForTimeout(2500);
const hues = [];
const started = Date.now();
while (Date.now() - started < 60000) {
  hues.push(await page.evaluate(() => window.__lab.color().hue));
  await page.waitForTimeout(250);
}

const circular = (from, to) => {
  const delta = Math.abs(from - to) % 360;
  return delta > 180 ? 360 - delta : delta;
};
let travel = 0;
for (let i = 1; i < hues.length; i += 1) travel += circular(hues[i - 1], hues[i]);
let spread = 0;
for (const hue of hues) for (const other of hues) spread = Math.max(spread, circular(hue, other));

let seekSpread = 0;
for (const hue of seekHues) for (const other of seekHues) seekSpread = Math.max(seekSpread, circular(hue, other));

const modes = slices.filter(Boolean).map((slice) => slice.mode);
const stableMode = modes.length === 3 && modes.every((mode) => mode === modes[0]);
const drift = circular(hues[0], hues[hues.length - 1]);

console.log(
  JSON.stringify(
    {
      track: input.split(/[\\/]/).pop(),
      duration: +duration.toFixed(1),
      key: profile.key,
      valence: profile.valence,
      identity: +profile.identity.toFixed(3),
      V2b: { slices, stable: stableMode },
      V4: { hues: seekHues.map((hue) => +hue.toFixed(1)), spread: +seekSpread.toFixed(1) },
      V3: {
        seconds: Math.round((Date.now() - started) / 1000),
        spread: +spread.toFixed(1),
        travel: +travel.toFixed(1),
        drift: +drift.toFixed(1),
        min: +Math.min(...hues).toFixed(1),
        max: +Math.max(...hues).toFixed(1),
      },
      errors,
    },
    null,
    2,
  ),
);

await browser.close();
