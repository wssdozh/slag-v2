import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });

test('the feed preserves reading position during prepend and incoming notes', async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem('slag_items_default_vault', JSON.stringify(Array.from({ length: 45 }, (_, i) => ({
      id: `scroll-${i}`, type: 'note', folder: 'Входящие', content: `Запись ${i}\n\nПроверка позиции в ленте`,
      createdAt: now - (45 - i) * 60_000, updatedAt: now, tags: [], attachments: [],
    }))));
  });
  await page.goto('/');
  const feed = page.getByTestId('feed-list-container');
  const cards = feed.locator('[data-flip-id]');
  await expect(cards).toHaveCount(15);
  const anchor = feed.locator('#item-scroll-30');
  const top = await anchor.evaluate(el => {
    const list = el.closest<HTMLElement>('[data-testid="feed-list-container"]')!;
    list.scrollTop = 0;
    return el.getBoundingClientRect().top;
  });
  await expect(cards).toHaveCount(30);
  await expect.poll(() => anchor.evaluate((el, before) => Math.abs(el.getBoundingClientRect().top - before), top)).toBeLessThan(2);

  await feed.evaluate(el => { el.scrollTop = el.scrollHeight - el.clientHeight - 100; });
  const nearEnd = feed.locator('#item-scroll-42');
  const before = await nearEnd.evaluate(el => el.getBoundingClientRect().top);
  await page.evaluate(() => {
    const { storage } = window as typeof window & { storage: typeof import('../src/lib/storage').storage };
    const now = Date.now();
    storage.saveItems([{ id: 'scroll-incoming', type: 'note', folder: 'Входящие', title: 'Входящая запись', content: '', createdAt: now, updatedAt: now, tags: [], attachments: [] }], 'remote');
    window.dispatchEvent(new CustomEvent('slag-sync-updated', { detail: { hasItemsChanged: true } }));
  });
  await expect(feed.locator('#item-scroll-incoming')).toHaveCount(1);
  await expect.poll(() => nearEnd.evaluate((el, y) => Math.abs(el.getBoundingClientRect().top - y), before)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/screenshots/feed-scroll-anchor.png' });
});
