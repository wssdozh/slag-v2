import { test, expect } from '@playwright/test';
import { setupSlag } from '../support/slagSetup';

const groups = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.dv-groupview')).map(group => ({
      width: Math.round(group.getBoundingClientRect().width),
      tabs: Array.from(group.querySelectorAll('.dv-default-tab-content')).map(tab => tab.textContent || ''),
    }))
  );

/** Adds the audio panel and drops its tab on the right half of the feed group. */
async function splitAudioIntoColumn(page: import('@playwright/test').Page) {
  await page.locator('.dv-groupview').nth(1).locator('button[title="Добавить вкладку в эту группу"]').click();
  await page.locator('button', { hasText: 'Аудиоплеер' }).first().click();
  await page.waitForTimeout(700);

  const tab = page.locator('.dv-tab, .dockview-tab').filter({ hasText: 'Аудиоплеер' }).first();
  const tabBox = await tab.boundingBox();
  const feedBox = await page.locator('.dv-groupview').nth(1).boundingBox();
  if (!tabBox || !feedBox) throw new Error('audio panel did not open');

  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(feedBox.x + feedBox.width - 40, feedBox.y + feedBox.height / 2, { steps: 12 });
  await page.mouse.move(feedBox.x + feedBox.width - 20, feedBox.y + feedBox.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

test('side panels fold into the reading pane when the window is too narrow for four columns', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await setupSlag(page, testInfo);
  await page.waitForTimeout(2500);

  await splitAudioIntoColumn(page);
  const wide = await groups(page);
  expect(wide.length).toBeGreaterThanOrEqual(4);
  expect(wide.some(group => group.tabs.includes('Аудиоплеер'))).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/dock-fold-wide.png' });

  // Below 1024 the side panels become tabs of the feed pane instead of clipping at the window edge.
  await page.setViewportSize({ width: 950, height: 900 });
  await page.waitForTimeout(1200);
  const narrow = await groups(page);
  expect(narrow).toHaveLength(2);
  const feedGroup = narrow.find(group => group.tabs.includes('Входящие'));
  expect(feedGroup?.tabs).toEqual(expect.arrayContaining(['Аудиоплеер', 'Ассистент']));
  expect(narrow.reduce((sum, group) => sum + group.width, 0)).toBeLessThanOrEqual(950);
  await page.screenshot({ path: 'test-results/screenshots/dock-fold-narrow.png' });

  // Widening brings the columns back.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(1200);
  const back = await groups(page);
  expect(back.length).toBeGreaterThanOrEqual(4);
  expect(back.reduce((sum, group) => sum + group.width, 0)).toBeLessThanOrEqual(1600);
});
