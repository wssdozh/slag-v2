import { expect, test } from './support/selfhostFixture';
import type { SlagItem } from '../src/types';

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
      const { SyncEngine, storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      const engine = new SyncEngine();
      // Real incoming legacy handler and buffered storage apply. The synthetic peer's
      // plaintext envelope stands in for the relay socket; no cache writes or UI signals here.
      const roomId = 'room_feed_motion_fixture';
      engine.activeRoomId = roomId;
      engine.activeVaultKey = {};
      engine.status.authRequired = false;
      const sent: string[] = [];
      engine.ws = { readyState: WebSocket.OPEN, send: (value: string) => sent.push(value), close: () => {} };
      const current: SlagItem[] = storage.getItems();
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
      const changes: { type: 'item'; action: 'delete' | 'upsert'; id: string; payload: { deletedAt: number } | SlagItem }[] =
        removed.map((id) => ({ type: 'item', action: 'delete', id, payload: { deletedAt: Date.now() } }));
      if (change === 'height') {
        const note = current.find(({ id }) => id === alteredId)!;
        changes.push({ type: 'item', action: 'upsert', id: note.id, payload: { ...note,
          updatedAt: Date.now(), content: `${note.content}\n\n${'Tall incoming paragraph.\n\n'.repeat(5)}` } });
      }
      if (change === 'batch') changes.push({ type: 'item', action: 'upsert', id: inserted.id, payload: inserted });
      const samples: { t: number; top: number }[] = [];
      let appliedAt: number | undefined;
      const onApplied = () => { appliedAt ??= performance.now(); };
      window.addEventListener('slag-sync-updated', onApplied);
      try {
        await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle: {
          roomId, bundleId: 'feed-motion-bundle', fromDeviceId: 'synthetic-peer', changes,
        } }));
        const start = performance.now();
        do {
          const t = await new Promise<number>(requestAnimationFrame);
          const card = document.getElementById(`item-${anchorId}`);
          if (!card || !el.contains(card)) throw new Error('Anchor left the rendered window');
          samples.push({ t, top: card.getBoundingClientRect().top });
        } while (performance.now() - (appliedAt ?? start) < (appliedAt === undefined ? 2500 : 420));
        if (appliedAt === undefined) throw new Error('Incoming bundle did not publish');
        const drift = samples.map(({ top }) => Math.abs(top - topBefore));
        const frameGaps = samples.slice(1).map(({ t }, i) => ({ ms: t - samples[i].t, fromApplyMs: t - appliedAt! }));
        const worstGap = frameGaps.reduce((a, b) => b.ms > a.ms ? b : a);
        return { removed, alteredId, anchorId, max: Math.max(...drift), settled: drift.at(-1),
          frames: samples.length, worstGap, acks: sent.filter((msg) => JSON.parse(msg).bundleId === 'feed-motion-bundle').length };
      } finally {
        window.removeEventListener('slag-sync-updated', onApplied);
        engine.disconnect();
      }
    }, change);
    if (change === 'batch') await expect(feed.locator('#item-batch-inserted')).toBeAttached();
    if (change === 'height') await expect(feed.locator(`#item-${result.alteredId}`)).toContainText('Tall incoming paragraph.');
    for (const id of result.removed) await expect(feed.locator(`#item-${id}`)).toHaveCount(0);
    expect(result.acks).toBe(1);
    expect(result.frames).toBeGreaterThan(2);
    await test.info().attach('feed-motion', { contentType: 'application/json', body: JSON.stringify(result) });
    console.log(`[feed-motion] ${change}: ${result.max.toFixed(2)} px drift, ${result.frames} rAF samples, largest gap ${result.worstGap.ms.toFixed(1)} ms ending ${result.worstGap.fromApplyMs.toFixed(1)} ms from apply`);
    expect(result.max, `maximum drift of ${result.anchorId}`).toBeLessThan(2);
    expect(result.settled, `settled drift of ${result.anchorId}`).toBeLessThan(2);
    if (change === 'batch') await page.screenshot({ path: 'test-results/screenshots/feed-sync-batch-anchor.png' });
  });
}
