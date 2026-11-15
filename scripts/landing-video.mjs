// Records the hero clip: a note is written, found again through the palette, and ticked off.
// Three beats, each with a reason a person would actually have.
//
//   BASE_URL=http://127.0.0.1:5199/ node scripts/landing-video.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:5199/';
const out = path.resolve(process.env.OUT || 'video-out');
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'ru-RU',
  colorScheme: 'dark',
  recordVideo: { dir: out, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();

await page.goto(base, { waitUntil: 'load' });
await page.locator('main').first().waitFor({ state: 'visible', timeout: 120000 });
await page.waitForTimeout(5500);

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

await ctx.close();
await browser.close();
console.log('recorded into', out);
