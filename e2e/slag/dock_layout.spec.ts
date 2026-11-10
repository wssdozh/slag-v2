import { test, expect } from '@playwright/test';
import { setupSlag } from '../support/slagSetup';

const groups = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.dv-groupview')).map(group => {
      const box = group.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        right: Math.round(box.right),
        tab: group.querySelector('.dv-default-tab-content')?.textContent || '',
      };
    })
  );

const widestEdge = (measured: { right: number }[]) => Math.max(...measured.map(group => group.right));

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

test('panes squeeze inside the window instead of staying columns wider than it', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await setupSlag(page, testInfo);
  await page.waitForTimeout(2500);
  await splitAudioIntoColumn(page);

  const wide = await groups(page);
  expect(wide.length).toBeGreaterThanOrEqual(4);
  await page.screenshot({ path: 'test-results/screenshots/dock-wide.png' });

  // Four columns cannot keep their comfortable minimums at 950; they squeeze, nothing is clipped.
  await page.setViewportSize({ width: 950, height: 900 });
  await page.waitForTimeout(1000);
  const narrow = await groups(page);
  expect(narrow).toHaveLength(wide.length);
  // the grid must end inside the frame: no pane pushed past the right edge
  expect(widestEdge(narrow)).toBeLessThanOrEqual(952);
  expect(narrow.every(group => group.width > 120)).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/dock-narrow.png' });

  // and back: the panes return to their comfortable widths
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(1000);
  const back = await groups(page);
  expect(back).toHaveLength(wide.length);
  expect(widestEdge(back)).toBeLessThanOrEqual(1602);
});

test('a layout saved in a narrow window is stretched to the current one', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  await setupSlag(page, testInfo);
  await page.waitForTimeout(2500);

  const key = 'slag_workspace_layout_v2';
  const shrinkSizes = (storageKey: string) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const layout = JSON.parse(raw);
    const walk = (node: { size?: number; data?: unknown[] }) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.size === 'number') node.size = Math.round(node.size * 0.6);
      if (Array.isArray(node.data)) (node.data as { size?: number; data?: unknown[] }[]).forEach(walk);
    };
    walk(layout?.grid?.root);
    localStorage.setItem(storageKey, JSON.stringify(layout));
    return true;
  };
  expect(await page.evaluate(shrinkSizes, key)).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const restored = await groups(page);
  // 0.6 of 1600 is 960: without the rescale the grid stops at 960 and leaves a blank strip.
  expect(restored.reduce((sum, group) => sum + group.width, 0)).toBeGreaterThan(1500);
});
