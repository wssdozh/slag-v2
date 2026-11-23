import { expect, test } from '@playwright/test';
import type { SlagItem } from '../src/types';
import type { storage as appStorage } from '../src/lib/storage';

test.use({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });

const cases = ['batch', 'height', 'remove anchor'] as const;
for (const change of cases) {
  test(`a sync ${change} keeps a surviving reading anchor still from the first frame`, async ({ page }) => {
    const notes: SlagItem[] = Array.from({ length: 30 }, (_, index) => ({
      id: `batch-${index}`, type: 'note', title: `Note ${index}`,
      content: `Body ${index}\n\nSeed line.\nSeed line.`, folder: 'Входящие',
      tags: [], attachments: [], createdAt: 1_700_001_000_000 + index * 60_000,
      updatedAt: 1_700_001_000_000 + index * 60_000,
    }));
    await page.addInitScript((items) => {
      localStorage.setItem('slag_items_default_vault', JSON.stringify(items));
    }, notes);
    await page.goto('/');
    const feed = page.getByTestId('feed-list-container');
    await expect(feed.locator('[data-flip-id]')).toHaveCount(15);
    // Emit scroll before the test update so the feed leaves bottom-follow mode.
    await feed.evaluate((el) => {
      el.scrollTop = Math.max(0, el.scrollTop - 200);
      el.dispatchEvent(new Event('scroll'));
    });
    const result = await feed.evaluate(async (el, change) => {
      const { storage } = window as typeof window & { storage: typeof appStorage };
      const current = storage.getItems();
      const cards = [...el.querySelectorAll<HTMLElement>('[data-flip-id]')];
      const viewport = el.getBoundingClientRect();
      const anchor = cards.find((card) => {
        const top = card.getBoundingClientRect().top;
        return top >= viewport.top && top < viewport.bottom;
      });
      if (!anchor?.dataset.flipId) throw new Error('Missing reading anchor');
      const index = cards.indexOf(anchor);
      if (index < 2) throw new Error('Need two older cards above the anchor');
      const readCard = change === 'remove anchor' ? cards[index + 1] : anchor;
      const anchorId = readCard.dataset.flipId!;
      const removed = change === 'batch' ? cards.slice(0, 2).map((card) => card.dataset.flipId!)
        : change === 'remove anchor' ? [anchor.dataset.flipId] : [];
      const item = current.find(({ id }) => id === anchorId)!;
      const inserted = { ...item, id: 'batch-inserted', title: 'Inserted note', content: 'Inserted inside the visible window', createdAt: item.createdAt - 30_000 };
      const topBefore = readCard.getBoundingClientRect().top;
      const alteredId = cards[index - 1].dataset.flipId;
      const replacement = current.filter(({ id }) => !removed.includes(id)).map((note) =>
        change === 'height' && note.id === alteredId
          ? { ...note, content: `${note.content}\n\n${'Tall incoming paragraph.\n\n'.repeat(5)}` }
          : note,
      );
      if (change === 'batch') replacement.push(inserted);
      storage.cacheItems(storage.getItemsKey(), replacement);
      window.dispatchEvent(new CustomEvent('slag-sync-updated', { detail: { hasItemsChanged: true } }));
      const samples: number[] = [];
      const start = performance.now();
      do {
        await new Promise(requestAnimationFrame);
        const card = document.getElementById(`item-${anchorId}`);
        if (!card || !el.contains(card)) throw new Error('Anchor left the rendered window');
        samples.push(Math.abs(card.getBoundingClientRect().top - topBefore));
      } while (performance.now() - start < 420);
      return { removed, alteredId, anchorId, max: Math.max(...samples), settled: samples.at(-1) };
    }, change);
    if (change === 'batch') await expect(feed.locator('#item-batch-inserted')).toBeAttached();
    if (change === 'height') await expect(feed.locator(`#item-${result.alteredId}`)).toContainText('Tall incoming paragraph.');
    for (const id of result.removed) await expect(feed.locator(`#item-${id}`)).toHaveCount(0);
    expect(result.max, `maximum drift of ${result.anchorId}`).toBeLessThan(2);
    expect(result.settled, `settled drift of ${result.anchorId}`).toBeLessThan(2);
    if (change === 'batch') await page.screenshot({ path: 'test-results/screenshots/feed-sync-batch-anchor.png' });
  });
}
