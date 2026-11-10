import { test, expect } from '@playwright/test';

// The first navigation of a run pays for the dev server's whole module graph.
test.setTimeout(120_000);

test('pulling up past the newest note opens search, and lets go of the list alone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // A phone opens on the folder list; the feed lives behind a folder.
  await page.locator('button', { hasText: 'Входящие' }).first().click();
  const list = page.locator('[data-testid="feed-list-container"]');
  await expect(list).toBeVisible({ timeout: 15000 });

  const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
  await expect(searchInput).toHaveCount(0);

  // The gesture only exists at the end of the list: the feed pins itself there once it settles.
  await expect
    .poll(() => list.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 2))
    .toBe(true);

  const box = await list.boundingBox();
  expect(box).not.toBeNull();
  const x = Math.round(box!.x + box!.width / 2);
  const startY = Math.round(box!.y + box!.height * 0.75);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
  for (let step = 1; step <= 8; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: startY - step * 12 }],
    });
    await page.waitForTimeout(16);
  }

  // The hint appears while the finger is down, the modal does not: that is the whole point.
  await expect(page.locator('[data-testid="feed-pull-search"]')).toBeVisible();
  await expect(searchInput).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screenshots/feed-pull-search-hint.png' });

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(searchInput).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'test-results/screenshots/feed-pull-search.png' });
});
