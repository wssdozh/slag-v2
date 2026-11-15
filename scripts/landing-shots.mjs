// Landing screenshots: five surfaces of the app, rendered at 2x from a fresh browser profile, so
// the vault is the demo one and not whatever the machine has been used for.
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

const boot = async (page) => {
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(5000);
};

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const log = (...a) => console.log('[landing-shots]', ...a);

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: 'ru-RU',
  colorScheme: 'dark',
});
const page = await desktop.newPage();

await boot(page);
await page.screenshot({ path: `${out}/feed.png` });
log('feed');

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
