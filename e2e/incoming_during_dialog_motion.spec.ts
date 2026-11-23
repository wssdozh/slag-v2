// A real incoming note update (sync engine bundle handler, not a synthetic event)
// lands mid-transition: one CSS opacity transition must carry the phase, focus and
// state+opacity at publication and card insertion.
import { test, expect, type Page } from './support/selfhostFixture';
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });

const INCOMING_ID = 'dialog-motion-incoming';
// Desktop Settings is a BaseModal: role=dialog without a label (its title lives in the pane).
const SETTINGS = '[role="dialog"]';
const TAB = 'settings-tab-ai';
const OPENER = 'sidebar-settings-btn';

interface Snapshot { kind: string; state: string | null; opacity: number; focus: string | null; inside: boolean }
interface Probe { events: Snapshot[]; starts: number; cancels: number }
async function openFeed(page: Page) {
  await page.addInitScript(() => {
    const base = 1_700_010_000_000;
    localStorage.setItem('slag_items_default_vault', JSON.stringify(Array.from({ length: 4 }, (_, i) => ({
      id: `dialog-seed-${i}`, type: 'note', title: `Seed note ${i}`, content: `Seed body ${i}`,
      folder: 'Входящие', tags: [], attachments: [], createdAt: base + i, updatedAt: base + i,
    }))));
  });
  await page.goto('/');
  await expect(page.locator('[data-testid="feed-list-container"]')).toBeVisible({ timeout: 240_000 });
  // Slow both tokens so the engine's 120 ms staged flush lands inside a transition.
  await page.addStyleTag({ content: ':root { --slag-motion-slow: 900ms; --slag-motion-base: 900ms; }' });
}
/** Phase sequence, opacity transition starts/cancels, focus, note insertion, sync publication. */
async function installProbe(page: Page) {
  await page.evaluate(({ overlay, incoming }) => {
    interface Event { kind: string; state: string | null; opacity: number; focus: string | null; inside: boolean }
    const host = window as unknown as { __dialogProbe: { events: Event[]; starts: number; cancels: number } };
    const probe = host.__dialogProbe = { events: [] as Event[], starts: 0, cancels: 0 };
    const element = () => document.querySelector<HTMLElement>(overlay);
    const record = (kind: string) => {
      const surface = element();
      const active = document.activeElement as HTMLElement | null;
      probe.events.push({
        kind, state: surface?.dataset.motionState ?? null,
        opacity: surface ? Number(getComputedStyle(surface).opacity) : -1,
        focus: active ? active.getAttribute('data-testid') ?? active.getAttribute('aria-label') ?? active.id ?? active.tagName : null,
        inside: Boolean(surface && active && surface.contains(active)),
      });
    };
    new MutationObserver((records) => {
      for (const mutation of records) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(overlay)) record(`state:${(node as HTMLElement).dataset.motionState}`);
          if (node.id === `item-${incoming}` || node.querySelector(`#item-${incoming}`)) record('note');
        }
        if (mutation.type === 'attributes' && mutation.target instanceof Element && mutation.target.matches(overlay)) {
          record(`state:${(mutation.target as HTMLElement).dataset.motionState}`);
        }
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-motion-state'] });
    for (const type of ['transitionrun', 'transitioncancel']) {
      document.addEventListener(type, (event) => {
        if ((event.target as Element).matches(overlay) && (event as TransitionEvent).propertyName === 'opacity') {
          probe[type === 'transitionrun' ? 'starts' : 'cancels'] += 1;
        }
      }, true);
    }
    window.addEventListener('slag-sync-updated', () => record('sync'));
  }, { overlay: SETTINGS, incoming: INCOMING_ID });
}
/** The real incoming handler: a plaintext synthetic peer bundle through SyncEngine. */
async function applyIncoming(page: Page) {
  await page.evaluate(async (incomingId) => {
    const { SyncEngine, storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const engine = new SyncEngine();
    const roomId = 'room_dialog_motion_fixture';
    engine.activeRoomId = roomId;
    engine.activeVaultKey = {};
    engine.status.authRequired = false;
    engine.ws = { readyState: WebSocket.OPEN, send: () => {}, close: () => {} };
    const stamp = Date.now();
    const item = {
      ...storage.getItems()[0], id: incomingId, title: 'Incoming during dialog motion',
      content: 'This note arrived while the dialog was moving.', folder: 'Входящие',
      tags: [], attachments: [], createdAt: stamp, updatedAt: stamp,
    };
    const published = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('incoming bundle was never published')), 5000);
      window.addEventListener('slag-sync-updated', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    try {
      await engine.handleIncomingMessage(JSON.stringify({
        type: 'bundle',
        bundle: { roomId, bundleId: `dialog-motion-${stamp}`, fromDeviceId: 'synthetic-peer', changes: [{ type: 'item', action: 'upsert', id: incomingId, payload: item }] },
      }));
      // The write is staged for 120 ms; keep the engine alive or disconnect cancels it.
      await published;
    } finally {
      engine.disconnect();
    }
  }, INCOMING_ID);
}
async function settle(page: Page) {
  await expect(page.locator(SETTINGS)).toHaveAttribute('data-motion-state', 'open');
  await expect.poll(() => page.locator(SETTINGS).evaluate(element => Number(getComputedStyle(element).opacity)), { timeout: 10_000 }).toBe(1);
}

for (const direction of ['entrance', 'exit'] as const) {
  test(`an incoming note lands mid-${direction} without restarting the dialog transition`, async ({ page }) => {
    await openFeed(page);
    if (direction === 'entrance') await installProbe(page);

    await page.getByTestId(OPENER).click();
    await page.getByTestId(TAB).focus();
    if (direction === 'exit') {
      await settle(page);
      await installProbe(page);
      await page.locator(`${SETTINGS} button[aria-label="Закрыть"]`).click();
    }

    const before = await page.locator(SETTINGS).evaluate(element => ({
      state: element.getAttribute('data-motion-state'),
      opacity: Number(getComputedStyle(element).opacity),
    }));
    if (direction === 'entrance') {
      // Still in the entrance, with focus already parked inside the dialog.
      expect(['entering', 'open']).toContain(before.state);
      expect(before.opacity).toBeLessThan(1);
    } else {
      expect(before.state).toBe('exiting');
      expect(before.opacity).toBeGreaterThan(0);
    }

    await applyIncoming(page);
    await expect(page.locator(`#item-${INCOMING_ID}`)).toBeAttached({ timeout: 15_000 });
    if (direction === 'entrance') {
      await settle(page);
      await expect(page.getByTestId(TAB)).toBeFocused();
    } else {
      await expect(page.locator(SETTINGS)).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByTestId(OPENER)).toBeFocused();
    }

    const probe: Probe = await page.evaluate(() => (window as unknown as { __dialogProbe: Probe }).__dialogProbe);
    const sequence = probe.events.filter(event => event.kind.startsWith('state:')).map(event => event.kind);
    expect(sequence).toEqual(direction === 'entrance' ? ['state:entering', 'state:open'] : ['state:exiting']);
    expect(probe.starts).toBe(1);
    expect(probe.cancels).toBe(0);

    const sync = probe.events.filter(event => event.kind === 'sync');
    const note = probe.events.filter(event => event.kind === 'note');
    expect(sync).toHaveLength(1);
    expect(note).toHaveLength(1);
    // Both events land inside the one running transition, never after it.
    for (const event of [sync[0], note[0]]) {
      expect(event.state).toBe(direction === 'entrance' ? 'open' : 'exiting');
      expect(event.opacity).toBeGreaterThan(0);
      expect(event.opacity).toBeLessThan(1);
      expect(event.inside).toBe(direction === 'entrance');
      // Focus stays on the active dialog's tab, or returns to the opener; the new card never takes it.
      expect(event.focus).toBe(direction === 'entrance' ? TAB : OPENER);
    }
  });
}
