// Records the hero clip: a note is written, found again through the palette, and ticked off.
// Three beats, each with a reason a person would actually have.
//
// The frame is not a dashboard: the folder rail and the empty Info tab are closed through
// dockview's own tab action, the saved layout is reloaded, and only then does the clip start
// mattering — its first useful frame is the resting one-screen view.
//
//   BASE_URL=http://127.0.0.1:5199/ node scripts/landing-video.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:5199/';
const out = path.resolve(process.env.OUT || 'video-out');
await mkdir(out, { recursive: true });

// Panels that make the frame look like a dashboard rather than one screen with one note.
const HIDDEN_PANELS = ['panel_sidebar', 'panel_info'];

const boot = async (page) => {
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(5500);
};

// Close a dockview tab the way a person would: hover the tab, press its close action.
const closeTab = async (page, panelId) => {
  const tab = page.locator(`.dv-tab[data-tab-panel-id="${panelId}"]`).first();
  if ((await tab.count()) === 0) return false;
  await tab.hover();
  await tab.locator('.dv-default-tab-action').first().click();
  return true;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'ru-RU',
  colorScheme: 'dark',
  recordVideo: { dir: out, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
const startedAt = Date.now();

await page.goto(base, { waitUntil: 'load' });
await boot(page);

// Drop the rail and the empty Info tab, then reload so the saved layout restores without them.
const closed = [];
for (const panelId of HIDDEN_PANELS) {
  if (await closeTab(page, panelId)) {
    closed.push(panelId);
    await page.waitForTimeout(900);
  }
}
if (closed.length > 0) {
  await page.reload({ waitUntil: 'load' });
  await boot(page);
}
const readyAt = Date.now();
console.log(
  `closed [${closed.join(', ')}] — settled screen at +${((readyAt - startedAt) / 1000).toFixed(2)}s of the recording`
);
await writeFile(
  path.join(out, 'meta.json'),
  JSON.stringify({ startedAt, readyAt, closed, viewport: { width: 1440, height: 900 } }, null, 2)
);

// 1. write it down: the date is parsed out of the sentence as it is typed
const input = page.locator('textarea').last();
await input.click();
await page.waitForTimeout(400);
await page.keyboard.type('позвонить в сервис завтра в 15:00', { delay: 62 });
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(2200);

// 2. make sure it will be found later: same word, same note
await page.keyboard.press('Control+k');
await page.waitForTimeout(700);
await page.keyboard.type('сервис', { delay: 95 });
await page.waitForTimeout(1600);
await page.keyboard.press('Escape');
await page.waitForTimeout(900);

// 3. the call is done — tick it off
const status = page.locator('button[aria-label^="Изменить статус"]').last();
try {
  await status.click({ timeout: 5000 });
  await page.waitForTimeout(1600);
} catch (e) {
  console.log('tick failed:', e.message.split('\n')[0]);
}
await page.waitForTimeout(1400);

const video = page.video();
await ctx.close();
await browser.close();
console.log('recorded into', out, video ? await video.path() : '');
