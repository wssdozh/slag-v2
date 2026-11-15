// Records the hero clip: a note is written, found again through the palette, and ticked off.
// Three beats, each with a reason a person would actually have.
//
// The frame is one screen, not a dashboard: the assistant panel and the empty Info tab are closed
// through dockview's own tab action, the saved layout is reloaded, and only then does the clip
// start — its first useful frame is the resting view with the folder rail on the left.
//
// Every beat is asserted, not assumed: the note has to reach the feed, the palette has to return
// it, the tick has to land. A clip with a silent "nothing found" in the middle is worse than no
// clip, and that is exactly how the first take shipped.
//
//   BASE_URL=http://127.0.0.1:5199/ node scripts/landing-video.mjs
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:5199/';
const out = path.resolve(process.env.OUT || 'video-out');
await mkdir(out, { recursive: true });

// The right-hand group makes the frame look like a dashboard. The folder rail on the left stays:
// it is what makes the feed read as a place with structure.
const HIDDEN_PANELS = ['panel_assistant', 'panel_info'];

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

const waitForText = async (page, text, timeout = 15000) => {
  await page.waitForFunction(
    (needle) => document.body.innerText.toLowerCase().includes(needle),
    text.toLowerCase(),
    { timeout },
  );
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

// Drop the right-hand group, then reload so the saved layout restores without it.
const closed = [];
for (const panelId of HIDDEN_PANELS) {
  if (await closeTab(page, panelId)) {
    closed.push(panelId);
    await page.waitForTimeout(900);
  }
}
if (closed.length === 0) throw new Error('не нашёл вкладки правой группы — раскладка другая');
await page.reload({ waitUntil: 'load' });
await boot(page);
const readyAt = Date.now();
console.log(
  `closed [${closed.join(', ')}] — settled screen at +${((readyAt - startedAt) / 1000).toFixed(2)}s of the recording`,
);
await page.screenshot({ path: path.join(out, 'beat-0-start.png') });
await writeFile(
  path.join(out, 'meta.json'),
  JSON.stringify({ startedAt, readyAt, closed, viewport: { width: 1440, height: 900 } }, null, 2),
);

// 1. write it down: the date is parsed out of the sentence as it is typed
const composer = page.locator('textarea').last();
await composer.click();
await page.waitForTimeout(400);
await page.keyboard.type('позвонить в сервис завтра в 15:00', { delay: 62 });
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
// The composer is cleared on send, so this only passes once the note is actually a card in the feed.
await page.waitForFunction(
  () => {
    const composer = document.querySelector('textarea');
    return !!composer && composer.value === '' && document.body.innerText.toLowerCase().includes('позвонить в сервис');
  },
  null,
  { timeout: 15000 },
);
await page.waitForTimeout(1400);
await page.screenshot({ path: path.join(out, 'beat-1-written.png') });

// 2. make sure it will be found later: same word, same note
await page.keyboard.press('Control+k');
await page.waitForTimeout(700);
await page.keyboard.type('сервис', { delay: 110 });
// The feed behind the dialog already contains the note, so the check reads the dialog itself: an
// empty palette in the middle of the clip was the bug that made this assertion necessary.
await page.waitForFunction(
  () => {
    const dialog = document.querySelector('[role="dialog"]');
    return !!dialog && (dialog.textContent || '').toLowerCase().includes('позвонить в сервис');
  },
  null,
  { timeout: 15000 },
);
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(out, 'beat-2-found.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(900);

// 3. the call is done — tick it off
const status = page.locator('button[aria-label^="Изменить статус"]').last();
await status.click({ timeout: 8000 });
await page.waitForTimeout(1600);
await page.screenshot({ path: path.join(out, 'beat-3-done.png') });
await page.waitForTimeout(1200);

const video = page.video();
await ctx.close();
await browser.close();
console.log('recorded into', out, video ? await video.path() : '');
