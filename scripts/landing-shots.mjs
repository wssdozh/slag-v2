// Landing screenshots: five surfaces of the app, rendered at 2x from a fresh browser profile, so
// the vault is the demo one and not whatever the machine has been used for.
//
// The feed shot is the hero frame: one screen, one note. Its folder rail and the empty Info tab are
// closed through dockview's own tab action and the layout is reloaded before the capture, so the
// image shows the resting state the site uses. The other surfaces keep the default layout.
//
//   npm run build && npx vite preview --port 4199 &
//   BASE_URL=http://127.0.0.1:4199/ node scripts/landing-shots.mjs
//
// Then frame them: bash scripts/landing-frames.sh (needs imagemagick) and copy the .webp into
// slag-site/public/shots/.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:4199/';
const out = path.resolve(process.env.OUT || 'shots-out');

// Panels that turn the hero frame into a dashboard rather than one screen with one note. The folder
// rail on the left stays: it is what makes the feed read as a place with structure.
const HIDDEN_PANELS = ['panel_assistant', 'panel_info'];

const boot = async (page) => {
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(5000);
};

// Close a dockview tab the way a person would: hover the tab, press its close action.
const closeTab = async (page, panelId) => {
  const tab = page.locator(`.dv-tab[data-tab-panel-id="${panelId}"]`).first();
  if ((await tab.count()) === 0) return false;
  await tab.hover();
  await tab.locator('.dv-default-tab-action').first().click();
  return true;
};

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const log = (...a) => console.log('[landing-shots]', ...a);

const desktopContext = () =>
  browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'ru-RU',
    colorScheme: 'dark',
  });

// Hero frame on its own profile: the rail and the Info tab are gone for good there, while the
// surfaces below keep the stock three-column layout.
const feedDesktop = await desktopContext();
const feedPage = await feedDesktop.newPage();
await boot(feedPage);
const closed = [];
for (const panelId of HIDDEN_PANELS) {
  if (await closeTab(feedPage, panelId)) {
    closed.push(panelId);
    await feedPage.waitForTimeout(900);
  }
}
if (closed.length > 0) {
  await feedPage.reload({ waitUntil: 'load' });
  await boot(feedPage);
}
log(`feed (layout without ${closed.join(', ') || 'nothing'})`);
await feedPage.screenshot({ path: `${out}/feed.png` });
await feedDesktop.close();

const desktop = await desktopContext();
const page = await desktop.newPage();

await boot(page);

try {
  await page.getByRole('button', { name: 'Открыть в фокус-редакторе' }).first().click();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/editor.png` });
  log('editor');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} catch (e) {
  log('editor failed:', e.message.split('\n')[0]);
}

await boot(page);
try {
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(1200);
  await page.keyboard.type('заметочников', { delay: 110 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/search.png` });
  log('search');
} catch (e) {
  log('search failed:', e.message.split('\n')[0]);
}

await boot(page);
try {
  await page.getByRole('button', { name: 'Проекты', exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}/folder.png` });
  log('folder');
} catch (e) {
  log('folder failed:', e.message.split('\n')[0]);
}
await desktop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  locale: 'ru-RU',
  colorScheme: 'dark',
  isMobile: true,
  hasTouch: true,
});
const mp = await phone.newPage();
await boot(mp);
await mp.screenshot({ path: `${out}/phone.png` });
log('phone');
await phone.close();

await browser.close();
