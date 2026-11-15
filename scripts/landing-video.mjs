// Records the hero clip. Story, not a feature tour — each beat is something a person would do for
// their own reason:
//
//   1. пишет строку в поле и жмёт Enter          — не заполняет форму, а говорит вслух
//   2. ищет ту же вещь с опечаткой в палитре     — ищет по памяти, а не по точному слову
//   3. ставит доску рядом с лентой               — окно собирается под его режим
//
// The frame is one screen, not a dashboard: the assistant panel and the empty Info tab are closed
// through dockview's own tab action and the saved layout is reloaded before recording starts, so
// the first useful frame is the resting view with the folder rail on the left.
//
// Every beat is asserted: the note has to reach the feed, the palette has to return it, the drag has
// to produce a second group. A clip with a silent «ничего не найдено» in the middle is worse than no
// clip, and that is how the first take shipped.
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

const browser = await chromium.launch();
const ctx = await browser.newContext({
  // Recorded at the size the hero shows, so nothing has to be rescaled afterwards: this machine has
  // no ffmpeg with a scale filter, and a 1:1 capture is sharper anyway.
  viewport: { width: 1200, height: 750 },
  locale: 'ru-RU',
  colorScheme: 'dark',
  recordVideo: { dir: out, size: { width: 1200, height: 750 } },
});
const page = await ctx.newPage();
const startedAt = Date.now();

await page.goto(base, { waitUntil: 'load' });
await boot(page);

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
console.log(`closed [${closed.join(', ')}] — settled at +${((readyAt - startedAt) / 1000).toFixed(2)}s`);
await page.screenshot({ path: path.join(out, 'beat-0-start.png') });
await writeFile(
  path.join(out, 'meta.json'),
  JSON.stringify({ startedAt, readyAt, closed, viewport: { width: 1440, height: 900 } }, null, 2),
);

// 1. write it down: the date is parsed out of the sentence as it is typed
const composer = page.locator('textarea').last();
await composer.click();
await page.waitForTimeout(350);
await page.keyboard.type('позвонить в сервис завтра в 15:00', { delay: 50 });
await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForFunction(
  () => {
    const box = document.querySelector('textarea');
    return !!box && box.value === '' && document.body.innerText.toLowerCase().includes('позвонить в сервис');
  },
  null,
  { timeout: 15000 },
);
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(out, 'beat-1-written.png') });

// 2. found by a word he does not remember exactly: one wrong letter, same note in the palette
await page.keyboard.press('Control+k');
await page.waitForTimeout(600);
await page.keyboard.type('позванить', { delay: 100 });
await page.waitForFunction(
  () => {
    const dialog = document.querySelector('[role="dialog"]');
    return !!dialog && (dialog.textContent || '').toLowerCase().includes('позвонить в сервис');
  },
  null,
  { timeout: 15000 },
);
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, 'beat-2-found.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 3. the board next to the feed: "+" adds a tab, the tab is dragged out into its own pane
const feedGroup = page
  .locator('.dv-groupview')
  .filter({ has: page.locator('.dv-tab', { hasText: 'Входящие' }) })
  .first();
await feedGroup.locator('button[title="Добавить вкладку в эту группу"]').click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Канбан' }).first().click();
await page.waitForTimeout(1100);
await page.screenshot({ path: path.join(out, 'beat-3-board.png') });

const boardTab = page.locator('.dv-tab', { hasText: 'Канбан' }).first();
const tabBox = await boardTab.boundingBox();
const groupBox = await feedGroup.boundingBox();
if (!tabBox || !groupBox) throw new Error('не нашёл вкладку доски или группу ленты');
const from = { x: tabBox.x + tabBox.width / 2, y: tabBox.y + tabBox.height / 2 };
// Dockview paints the zone the pointer is over, so the path has to end where the panel should land:
// pull straight down out of the tab strip, then across to the right edge, then hold. The old diagonal
// shortcut showed a "top" indicator and dropped the panel on the right, which no viewer can unsee.
const to = { x: groupBox.x + groupBox.width - 24, y: groupBox.y + groupBox.height * 0.5 };
await page.mouse.move(from.x, from.y);
await page.mouse.down();
for (let step = 1; step <= 8; step += 1) {
  await page.mouse.move(from.x, from.y + (72 * step) / 8);
  await page.waitForTimeout(40);
}
const startX = from.x;
const startY = from.y + 72;
for (let step = 1; step <= 16; step += 1) {
  await page.mouse.move(startX + ((to.x - startX) * step) / 16, startY + ((to.y - startY) * step) / 16);
  await page.waitForTimeout(35);
}
await page.mouse.move(to.x - 1, to.y);
await page.waitForTimeout(420);
await page.screenshot({ path: path.join(out, 'beat-3b-hover-zone.png') });
await page.mouse.up();
const groups = await page.evaluate(() => document.querySelectorAll('.dv-groupview').length);
if (groups < 3) throw new Error(`перетаскивание не разделило окно: групп ${groups}`);
await page.waitForTimeout(1400);
await page.screenshot({ path: path.join(out, 'beat-4-split.png') });
await page.waitForTimeout(900);

const video = page.video();
await ctx.close();
await browser.close();
console.log('recorded into', out, video ? await video.path() : '');
