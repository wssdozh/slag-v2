import { test, expect } from '@playwright/test';

// The first navigation of a run pays for the dev server's whole module graph.
test.setTimeout(120_000);

test('a real pull past the newest note opens search, a lazy one goes back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // A phone opens on the folder list; the feed lives behind a folder.
  const list = page.locator('[data-testid="feed-list-container"]');
  await expect(list).toBeVisible({ timeout: 15000 });

  const hint = page.locator('[data-testid="feed-pull-search"]');
  const searchInput = page.locator('input[placeholder*="Поиск по заметкам"]');
  await expect(searchInput).toHaveCount(0);
  // The feed slides in on the way from the folder list; a box measured mid-flight is not where
  // the finger will land.
  await page.waitForTimeout(600);

  // The gesture only exists at the end of the list: the feed pins itself there once it settles.
  await expect
    .poll(() => list.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 2))
    .toBe(true);

  const box = await list.boundingBox();
  expect(box).not.toBeNull();
  const x = Math.round(box!.x + box!.width / 2);
  const startY = Math.round(box!.y + box!.height * 0.75);

  const cdp = await page.context().newCDPSession(page);
  const drag = async (travel: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
    for (let step = 1; step <= 10; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: startY - Math.round((travel * step) / 10) }],
      });
      await page.waitForTimeout(16);
    }
  };
  const release = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // 90 px of finger is ~54 px of pull: the rubber band keeps it under the 64 px threshold.
  await drag(90);
  await expect(hint).toBeVisible();
  await release();
  await page.waitForTimeout(300);
  await expect(searchInput).toHaveCount(0);

  // 160 px of finger is ~96 px of pull: past the threshold, so the search opens.
  await drag(160);
  await expect(hint).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/feed-pull-search-hint.png' });
  await release();
  await expect(searchInput).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'test-results/screenshots/feed-pull-search.png' });
});
