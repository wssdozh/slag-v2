import { test, expect } from '../support/selfhostFixture';

/**
 * The room answers with one manifest per device now, so a check is "my root against every peer's
 * root", not "my root against the room's single row".
 *
 * `decideManifest` is the whole policy, and these are the promises: every peer agrees is silence, a
 * diverged peer gets one resend aimed at it, the same peer root twice is a report, and a
 * receive-only device never resends. The two answer formats are pinned beside it, because a relay
 * older than this app still answers one row for the room and the client has to understand that.
 */
test('a manifest check decides per peer, not against one room row', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });

  const outcomes = await page.evaluate(async () => {
    const { decideManifest } = await import('/src/lib/sync/manifest/channel.ts');
    const { parsePeerManifests } = await import('/src/lib/sync/manifest/peers.ts');
    const local = { root: 'root-local', folders: {}, leaves: {} };
    const peer = (deviceId: string | null, root: string) => ({ deviceId, root, folders: {}, leaves: {} });
    // Two peers, the second one behind; the first already agrees and must not win the verdict.
    const split = [peer('dev-a', 'root-local'), peer('dev-b', 'root-other')];
    return {
      split: decideManifest(local, split, { reconciledRoot: null, receiveOnly: false }),
      repeated: decideManifest(local, split, { reconciledRoot: 'root-other', receiveOnly: false }),
      agreed: decideManifest(local, [peer('dev-a', 'root-local'), peer('dev-b', 'root-local')], {
        reconciledRoot: null,
        receiveOnly: false,
      }),
      empty: decideManifest(local, [], { reconciledRoot: null, receiveOnly: false }),
      receiveOnly: decideManifest(local, split, { reconciledRoot: null, receiveOnly: true }),
      perDevice: parsePeerManifests({
        v: 1,
        manifests: [
          { deviceId: 'dev-a', root: 'root-a', folders: {}, leaves: {}, syncId: 7 },
          { deviceId: 'dev-b', root: 'root-b', folders: { Проекты: 'f' }, syncId: 8 },
        ],
        anonymous: { root: 'root-old', folders: {}, syncId: 3 },
      }),
      oldRelay: parsePeerManifests({ v: 1, root: 'root-room', folders: {}, syncId: 3 }),
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

  // Both relay answers become peers: rows by device, plus the room's old single row.
  expect(outcomes.perDevice.map((entry: { deviceId: string | null }) => entry.deviceId))
    .toEqual(['dev-a', 'dev-b', null]);
  expect(outcomes.perDevice[1].folders).toEqual({ Проекты: 'f' });
  // An old relay answers one row for the whole room: one anonymous peer, no leaves to name.
  expect(outcomes.oldRelay.length).toBe(1);
  expect(outcomes.oldRelay[0].deviceId).toBeNull();
  expect(outcomes.oldRelay[0].root).toBe('root-room');
  expect(outcomes.oldRelay[0].leaves).toBeUndefined();
});
