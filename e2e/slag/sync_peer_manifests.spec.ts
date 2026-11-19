import { test, expect } from '../support/selfhostFixture';

/**
 * The room answers with one manifest per device now, so a check is "my root against every peer's
 * root", not "my root against the room's single row".
 *
 * `decideManifest` is the whole policy, and these are the promises: every peer agrees is silence, a
 * diverged peer gets one resend aimed at it, the same peer root twice is a report, a receive-only
 * device never resends, and the room's old anonymous row can only ever say "no data". The answer
 * formats are pinned beside it, because a relay older than this app answers one row for the room.
 * Two safety rules on auto-resolve are pinned at the end: a row without `at` (old relay) and a row
 * older than our resend mean "has not seen it yet", never "refused it".
 */
test('a manifest check decides per peer, not against one room row', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  const outcomes = await page.evaluate(async () => {
    const { decideManifest } = await import('/src/lib/sync/manifest/channel.ts');
    const { parsePeerManifests } = await import('/src/lib/sync/manifest/peers.ts');
    const { resolveRejected } = await import('/src/lib/sync/manifest/resolve.ts');

    type Row = {
      deviceId: string | null;
      at: number | null;
      root: string;
      folders: Record<string, string>;
      leaves?: Record<string, string>;
    };
    const local = { root: 'root-local', folders: {}, leaves: { item_old: 'leaf-a' } };
    const peer = (
      deviceId: string | null,
      root: string,
      overrides: Partial<Pick<Row, 'at' | 'leaves'>> = {},
    ): Row => ({ deviceId, at: null, root, folders: {}, leaves: {}, ...overrides });
    const quiet = { reconciledRoot: null, receiveOnly: false };
    // Two peers, the second one behind; the first already agrees and must not win the verdict.
    const split = [peer('dev-a', 'root-local'), peer('dev-b', 'root-other')];
    // Notes this device holds and the peer's row does not: a refused note, if the row is current.
    const drift = { rootMatch: false, folders: [], missing: [], extra: ['item_old'], conflict: [] };
    const decisionFor = (candidate: Row) => ({ action: 'report' as const, peer: candidate, drift, resendTo: null });
    const engine = { manifestResentAt: 5_000 };
    const noAt = peer('dev-a', 'root-other', { leaves: { item_old: 'leaf-a' } });
    const stale = peer('dev-a', 'root-other', { leaves: { item_old: 'leaf-a' }, at: 4_000 });

    return {
      split: decideManifest(local, split, quiet),
      repeated: decideManifest(local, split, { reconciledRoot: 'root-other', receiveOnly: false }),
      agreed: decideManifest(local, [peer('dev-a', 'root-local'), peer('dev-b', 'root-local')], quiet),
      empty: decideManifest(local, [], quiet),
      receiveOnly: decideManifest(local, split, { reconciledRoot: null, receiveOnly: true }),
      anonymousOnly: decideManifest(local, [peer('dev-a', 'root-local'), peer(null, 'root-old')], quiet),
      anonymousAndReal: decideManifest(local, [peer(null, 'root-old'), peer('dev-b', 'root-other')], quiet),
      perDevice: parsePeerManifests({
        v: 1,
        manifests: [
          { deviceId: 'dev-a', at: 1_700_000_000_000, root: 'root-a', folders: {}, leaves: {}, syncId: 7 },
          { deviceId: 'dev-b', root: 'root-b', folders: { Проекты: 'f' }, syncId: 8 },
        ],
        anonymous: { root: 'root-old', folders: {}, syncId: 3 },
      }),
      oldRelay: parsePeerManifests({ v: 1, root: 'root-room', folders: {}, syncId: 3 }),
      // Auto-resolve must not fire: no row date, a row older than the resend, or nobody to ask.
      resolveWithoutAt: resolveRejected(engine, local, decisionFor(noAt)),
      resolveStaleAt: resolveRejected(engine, local, decisionFor(stale)),
      resolveAnonymous: resolveRejected(
        engine,
        local,
        decisionFor(parsePeerManifests({ v: 1, root: 'root-old', folders: {}, syncId: 3 })[0]),
      ),
    };
  });

  // Two peers, one behind: the diverged one is named, and it is who the resend is aimed at.
  expect(outcomes.split.action).toBe('reconcile');
  expect(outcomes.split.peer?.deviceId).toBe('dev-b');
  expect(outcomes.split.resendTo).toBe('dev-b');
  // The same peer root after a resend is a report, not a second resend.
  expect(outcomes.repeated.action).toBe('report');
  expect(outcomes.repeated.resendTo).toBeNull();
  // Every peer agrees with the local root: nothing to do, and the row is still named for the panel.
  expect(outcomes.agreed.action).toBe('none');
  expect(outcomes.agreed.drift?.rootMatch).toBe(true);
  expect(outcomes.empty).toEqual({ action: 'none', peer: null, drift: null, resendTo: null });
  // A receive-only device reports a divergence and never resends.
  expect(outcomes.receiveOnly.action).toBe('report');
  expect(outcomes.receiveOnly.resendTo).toBeNull();

  // The old room-wide row disagrees, every named peer agrees: "no data", never a resend.
  expect(outcomes.anonymousOnly.action).toBe('none');
  expect(outcomes.anonymousOnly.peer?.deviceId).toBeNull();
  expect(outcomes.anonymousOnly.peer?.root).toBe('root-old');
  expect(outcomes.anonymousOnly.drift?.rootMatch).toBe(false);
  expect(outcomes.anonymousOnly.resendTo).toBeNull();
  // A named peer that disagrees outranks the anonymous one: the real divergence is the verdict.
  expect(outcomes.anonymousAndReal.action).toBe('reconcile');
  expect(outcomes.anonymousAndReal.peer?.deviceId).toBe('dev-b');
  expect(outcomes.anonymousAndReal.resendTo).toBe('dev-b');

  // Both relay answers become peers: rows by device (with the row's own date), plus the old row.
  expect(outcomes.perDevice.map((entry: { deviceId: string | null }) => entry.deviceId))
    .toEqual(['dev-a', 'dev-b', null]);
  expect(outcomes.perDevice[1].folders).toEqual({ Проекты: 'f' });
  expect(outcomes.perDevice[0].at).toBe(1_700_000_000_000);
  // A row from a relay that does not date its rows carries no date at all.
  expect(outcomes.perDevice[1].at).toBeNull();
  // An old relay answers one row for the whole room: one anonymous peer, no leaves, no date.
  expect(outcomes.oldRelay.length).toBe(1);
  expect(outcomes.oldRelay[0].deviceId).toBeNull();
  expect(outcomes.oldRelay[0].root).toBe('root-room');
  expect(outcomes.oldRelay[0].at).toBeNull();
  expect(outcomes.oldRelay[0].leaves).toBeUndefined();

  // Auto-resolve: without a row date, or with a row older than our resend, silence is "not yet".
  expect(outcomes.resolveWithoutAt).toEqual([]);
  expect(outcomes.resolveStaleAt).toEqual([]);
  // And an old client's row names no note to act on.
  expect(outcomes.resolveAnonymous).toEqual([]);
});
