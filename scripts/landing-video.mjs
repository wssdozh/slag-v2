// Records a short loop for the landing hero: a thought is typed into the composer, Enter sends it,
// the card lands in the feed, a checkbox gets ticked. Real app, no mock.
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
await page.waitForTimeout(6000);

// the composer sits at the bottom of the feed
const input = page.locator('textarea').last();
await input.click();
await page.waitForTimeout(600);

const text = 'Позвонить в сервис завтра в 15:00';
await page.keyboard.type(text, { delay: 75 });
await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForTimeout(2600);

// tick one checkbox on the fresh card
const box = page.locator('button[aria-label^="Изменить статус"]').first();
try {
  await box.click({ timeout: 4000 });
  await page.waitForTimeout(1800);
} catch (e) {
  console.log('checkbox click failed:', e.message.split('\n')[0]);
}

await page.waitForTimeout(1200);
await ctx.close();
await browser.close();
console.log('recorded into', out);
