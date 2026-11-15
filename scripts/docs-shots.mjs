// Detail shots for the documentation: ten narrow fragments of the real interface, rendered at 2x
// from a fresh browser profile. The docs column is 680px wide, so a full window capture would
// shrink to 5px text — these are crops of the element itself, no frame and no caption.
//
//   npm run build && npx vite preview --port 4199 &
//   BASE_URL=http://127.0.0.1:4199/ node scripts/docs-shots.mjs
//
// Output goes to shots-out/docs/. Copy the .webp into slag-site/public/shots/docs/.
//
// Two frames cannot come from the browser preview: device pairing needs the Tauri runtime, so the
// pairing shot is the "Устройства" tab with the button, not the PIN dialog. Everything else is the
// real interface.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:4199/';
const out = path.resolve(process.env.OUT || 'shots-out/docs');
const log = (...a) => console.log('[docs-shots]', ...a);

await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: 'ru-RU',
  colorScheme: 'dark',
});
const page = await context.newPage();
page.setDefaultTimeout(12000);

const boot = async () => {
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 120000 });
  // The demo vault indexes on first paint; the feed is empty until it finishes.
  await page.waitForTimeout(6000);
};

/** Crop an element, or a horizontal band of it, with a little air around. */
const shot = async (name, locator, band) => {
  try {
    const box = await locator.first().boundingBox();
    if (!box) throw new Error('no box');
    const pad = 8;
    const x = Math.max(0, box.x - pad);
    const width = Math.min(box.width + pad * 2, 1440 - x);
    const clip = band
      ? {
          x,
          width,
          y: Math.max(0, box.y + band.from),
          height: Math.min(band.height, box.height - band.from),
        }
      : {
          x,
          width,
          y: Math.max(0, box.y - pad),
          height: Math.min(box.height + pad * 2, 900 - Math.max(0, box.y - pad)),
        };
    // JPEG, not PNG: these are photographs of a UI in a documentation column, and 85% quality at
    // 2x is indistinguishable from lossless here while staying under 40 KB a frame.
    await page.screenshot({ path: `${out}/${name}.jpg`, clip, type: 'jpeg', quality: 85 });
    log(name, `${Math.round(clip.width)}x${Math.round(clip.height)}`);
    return true;
  } catch (error) {
    log(`${name} failed:`, String(error).split('\n')[0]);
    return false;
  }
};

/** Click if the target exists and is actually clickable; a dead end must not kill the run. */
const clickIfAny = async (target, wait = 900) => {
  try {
    const locator = typeof target === 'string' ? page.locator(target).first() : target.first();
    if ((await locator.count()) === 0) return false;
    if (await locator.isDisabled()) return false;
    await locator.click({ timeout: 4000 });
    await page.waitForTimeout(wait);
    return true;
  } catch (error) {
    log('click skipped:', String(error).split('\n')[0].slice(0, 120));
    return false;
  }
};

/** The card that holds a given line of text, so a shot is a whole card and not a slice of one. */
const cardOf = (text) =>
  page.getByText(text, { exact: false }).first().locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');

await boot();

// 1. composer: the one field the whole product is built around.
await shot('composer', page.locator('[data-testid="composer-dock"]'));

// 2. folders: the sidebar down to the last folder row.
await shot('folders', page.locator('aside').first(), { from: 0, height: 300 });

// 3. one task card, whole: checkbox, subtasks, folder, date, priority, tags.
await shot('task-card', cardOf('Синхронизация по архитектуре баз данных'));

// 4 and 5. Kanban and the week grid live behind "Вид и фильтры папки".
const pickView = async (label) => {
  const opened = await clickIfAny('[aria-label="Вид и фильтры папки"]', 900);
  if (!opened) return false;
  const option = page.getByText(label, { exact: true }).first();
  const picked = await clickIfAny(option, 1600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  return picked;
};

if (await pickView('Канбан')) {
  await shot('kanban', page.locator('[data-testid="kanban-columns-container"]'), { from: 0, height: 560 });
}

// The switcher itself: three modes on one screen. A week grid with two tasks on it explains less
// than the control that picks the grid.
await clickIfAny('[aria-label="Вид и фильтры папки"]', 1000);
await shot('views', page.locator('[role="dialog"] > div').first());
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// Back to the feed: the search and editor shots below expect messages, not a board.
await pickView('Лента');

await page.keyboard.press('Control+k');
await page.waitForTimeout(1200);
await page.keyboard.type('чай', { delay: 90 });
await page.waitForTimeout(1500);
await shot('search', page.locator('[role="dialog"] > div').first());
await page.keyboard.press('Escape');
await page.waitForTimeout(700);

// 7. the editor header: type, date, tags.
const article = page.getByText('Вернулся к обычному .txt', { exact: false }).first();
if (await clickIfAny(article, 2200)) {
  await shot('editor', page.locator('[data-testid="fullscreen-editor-modal"]'), { from: 0, height: 250 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
} else {
  log('editor failed: no article card in the feed');
}

// 8. devices: where pairing lives. The PIN dialog itself needs the Tauri runtime.
await boot();
if (await clickIfAny('[data-testid="sidebar-settings-btn"]', 1300)) {
  if (await clickIfAny('[data-testid="settings-tab-devices"]', 1000)) {
    await shot('devices', page.locator('[role="dialog"] > div').first(), { from: 0, height: 340 });
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// 9. inbox triage: the offers the model makes.
await boot();
if (await clickIfAny('[aria-label="Запустить ИИ-Сортировку"]', 3000)) {
  await shot('triage', page.locator('[role="dialog"] > div').last());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
} else {
  log('triage failed: no unsorted items or no AI connection');
}

// 10. logs, the first thing support asks for.
await boot();
if (await clickIfAny('[data-testid="sidebar-logs-btn"]', 1500)) {
  await shot('logs', page.locator('[data-testid="log-viewer"]').first(), { from: 0, height: 430 });
}

await context.close();
await browser.close();
log('done');
