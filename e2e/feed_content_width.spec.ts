import { test, expect } from '@playwright/test';
import { setupSlag } from './support/slagSetup';

test('feed cards hug content and keep a shared left edge', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setupSlag(page, testInfo);
  const input = page.locator('main textarea');
  const texts = ['мк', 'форма помогает узнавать заметку', 'длинная заметка '.repeat(40)];
  for (const text of texts) {
    await input.fill(text);
    await input.press('Enter');
  }
  const cards = texts.map(text => page.locator('[data-flip-id]').filter({ has: page.getByText(text.trim(), { exact: true }) }).first());
  for (const card of cards) await expect(card).toBeVisible();
  const boxes = await Promise.all(cards.map(card => card.boundingBox()));
  const [short, medium, long] = boxes;
  expect(short).not.toBeNull();
  expect(medium).not.toBeNull();
  expect(long).not.toBeNull();
  expect(short!.width).toBeLessThan(medium!.width);
  expect(medium!.width).toBeLessThan(long!.width);
  expect(short!.height).toBeLessThan(45);
  expect(medium!.height).toBeCloseTo(short!.height, 0);
  expect(long!.y - medium!.y - medium!.height).toBeCloseTo(6, 0);
  expect(short!.x).toBeCloseTo(long!.x, 0);
  for (const [index, card] of cards.entries()) {
    const time = await card.getByTestId('item-time').boundingBox();
    expect(time).not.toBeNull();
    const box = boxes[index]!;
    expect(box.x + box.width - time!.x - time!.width).toBeCloseTo(12, 0);
    expect(box.y + box.height - time!.y - time!.height).toBeCloseTo(12, 0);
  }
  await page.screenshot({ path: 'test-results/screenshots/feed-content-width.png', fullPage: true });
});
