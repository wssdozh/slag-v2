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

test('a mixed tab group releases and restores the width cap when switching tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem('slag_workspace_layout_v2', JSON.stringify({
      grid: {
        width: 1200, height: 720, orientation: 'HORIZONTAL',
        root: { type: 'branch', size: 720, data: [
          { type: 'leaf', size: 700, data: { id: 'left', views: ['panel_feed'], activeView: 'panel_feed' } },
          { type: 'leaf', size: 500, data: { id: 'right', views: ['panel_info', 'right_feed'], activeView: 'panel_info' } },
        ] },
      },
      panels: {
        panel_feed: { id: 'panel_feed', contentComponent: 'feed', title: 'Входящие' },
        panel_info: { id: 'panel_info', contentComponent: 'folder-info', title: 'Инфо' },
        right_feed: { id: 'right_feed', contentComponent: 'feed', title: 'Вторая лента' },
      },
      activeGroup: 'right',
    }));
  });
  await page.goto('/');

  const rightGroup = page.locator('.dv-groupview').filter({ hasText: 'Вторая лента' });
  const rightWidth = () => rightGroup.evaluate(el => el.getBoundingClientRect().width);
  const dragLeft = async () => {
    const sash = await page.locator('.dv-horizontal > .dv-sash-container > .dv-sash').boundingBox();
    if (!sash) throw new Error('Missing column divider');
    const x = sash.x + sash.width / 2;
    const y = sash.y + sash.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 180, y, { steps: 8 });
    await page.mouse.up();
  };

  await rightGroup.getByText('Вторая лента', { exact: true }).click();
  await dragLeft();
  await expect.poll(rightWidth).toBeGreaterThan(600);
  await page.screenshot({ path: 'test-results/screenshots/dock-mixed-tabs.png' });

  await rightGroup.getByText('Инфо', { exact: true }).click();
  await dragLeft();
  await expect.poll(rightWidth).toBeLessThanOrEqual(541);
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
