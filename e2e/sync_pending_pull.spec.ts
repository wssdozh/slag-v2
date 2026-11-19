import { test, expect } from './support/selfhostFixture';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The first page load in a cold run pays Vite's transform of the whole module graph.
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120000 });
});

test('concurrent pending pulls share one request until applying finishes, then allow another pull', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    engine.activeRoomId = 'room_single_flight';
    engine.activeVaultKey = {};
    const originalFetch = window.fetch;
    let requests = 0;
    let releaseFetch!: () => void;
    let releaseApply!: () => void;
    let applying!: () => void;
    const fetchGate = new Promise<void>(resolve => { releaseFetch = resolve; });
    const applyGate = new Promise<void>(resolve => { releaseApply = resolve; });
    const applyStarted = new Promise<void>(resolve => { applying = resolve; });
    engine.applyIncomingBundle = async () => { applying(); await applyGate; };
    window.fetch = async () => {
      requests++;
      await fetchGate;
      return Response.json({ bundles: [{ syncId: 1, payload: { bundleId: 'one' } }] });
    };
    try {
      const first = engine.fetchPendingBundlesHttp();
      const second = engine.fetchPendingBundlesHttp();
      const sameWhileFetching = first === second;
      const requestsWhileFetching = requests;
      releaseFetch();
      await applyStarted;
      const third = engine.fetchPendingBundlesHttp();
      const sameWhileApplying = first === third;
      const requestsWhileApplying = requests;
      releaseApply();
      await Promise.all([first, second, third]);
      const cleared = engine.pendingPull === null;
      await engine.fetchPendingBundlesHttp();
      return { sameWhileFetching, sameWhileApplying, requestsWhileFetching, requestsWhileApplying, cleared, requests };
    } finally {
      window.fetch = originalFetch;
      engine.disconnect();
    }
  });
  expect(result).toEqual({ sameWhileFetching: true, sameWhileApplying: true, requestsWhileFetching: 1, requestsWhileApplying: 1, cleared: true, requests: 2 });
});

test('pending pull drains more than 100 bundles using the highest syncId as since', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    engine.activeRoomId = 'room_pagination';
    engine.activeVaultKey = {};
    engine.currentVaultId = 'vault / pagination';
    engine.config.deviceId = 'device / pagination';
    const originalFetch = window.fetch;
    const requests: { room: string; device: string | null; vault: string | null; since: string | null }[] = [];
    const applied: number[] = [];
    const bundles = Array.from({ length: 137 }, (_, index) => ({ syncId: (index + 1) * 7, payload: { index } }));
    engine.applyIncomingBundle = async (payload: { index: number }) => { applied.push(payload.index); };
    window.fetch = async (input) => {
      const url = new URL(String(input));
      requests.push({ room: url.pathname, device: url.searchParams.get('device'), vault: url.searchParams.get('vault'), since: url.searchParams.get('since') });
      if (requests.length > 2) throw new Error('pagination did not terminate');
      const since = Number(url.searchParams.get('since') || 0);
      return Response.json({ bundles: bundles.filter(bundle => bundle.syncId > since).slice(0, 100) });
    };
    try {
      await engine.fetchPendingBundlesHttp();
      return { requests, applied };
    } finally {
      window.fetch = originalFetch;
      engine.disconnect();
    }
  });
  expect(result.requests).toEqual([
    { room: '/api/rooms/room_pagination/bundles', device: 'device / pagination', vault: 'vault / pagination', since: null },
    { room: '/api/rooms/room_pagination/bundles', device: 'device / pagination', vault: 'vault / pagination', since: '700' },
  ]);
  expect(result.applied).toEqual(Array.from({ length: 137 }, (_, index) => index));
});

test('byte-budget timeout retries the same cursor and drains short pages', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    engine.activeRoomId = 'room_byte_pages';
    engine.activeVaultKey = {};
    const originalFetch = window.fetch;
    const requests: [string | null, string | null][] = [];
    const applied: number[] = [];
    engine.applyIncomingBundle = async (payload: { id: number }) => { applied.push(payload.id); };
    window.fetch = async (input) => {
      const params = new URL(String(input)).searchParams;
      const since = params.get('since');
      requests.push([since, params.get('maxBytes')]);
      if (requests.length === 2) throw new DOMException('timed out', 'TimeoutError');
      if (requests.length > 3) throw new Error('pagination did not terminate');
      const next = Number(since) + 1;
      return Response.json({ head: 2, bundles: [{ syncId: next, payload: { id: next } }] });
    };
    try {
      await engine.fetchPendingBundlesHttp();
      return { requests, applied };
    } finally {
      window.fetch = originalFetch;
      engine.disconnect();
    }
  });
  expect(result).toEqual({ requests: [[null, '2000000'], ['1', '2000000'], ['1', '1000000']], applied: [1, 2] });
});

test('HTTP pull failure rejects all callers, reports error and permits retry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    engine.activeRoomId = 'room_failure';
    engine.activeVaultKey = {};
    const originalFetch = window.fetch;
    let requests = 0;
    let applied = 0;
    engine.applyIncomingBundle = async () => { applied++; };
    window.fetch = async () => {
      requests++;
      return requests === 1 ? new Response('unavailable', { status: 503 }) : Response.json({ bundles: [] });
    };
    try {
      const outcomes = await Promise.allSettled([engine.fetchPendingBundlesHttp(), engine.fetchPendingBundlesHttp()]);
      const errors = outcomes.map(outcome => outcome.status === 'rejected' ? outcome.reason.message : 'unexpected success');
      const failed = { state: engine.status.state, error: engine.status.error, cleared: engine.pendingPull === null, requests };
      await engine.fetchPendingBundlesHttp();
      return { errors, failed, requests, applied, cleared: engine.pendingPull === null };
    } finally {
      window.fetch = originalFetch;
      engine.disconnect();
    }
  });
  expect(result).toEqual({ errors: ['Sync pull failed: HTTP 503', 'Sync pull failed: HTTP 503'], failed: { state: 'error', error: 'Sync pull failed: HTTP 503', cleared: true, requests: 1 }, requests: 2, applied: 0, cleared: true });
});

for (const staleStatus of [200, 503]) {
  test(`generation switch ignores stale HTTP ${staleStatus} and preserves the new single-flight pull`, async ({ page }) => {
    const result = await page.evaluate(async (status) => {
      const path = '/src/lib/sync/syncEngine.ts';
      const { SyncEngine } = await import(/* @vite-ignore */ path);
      const engine = new SyncEngine();
      engine.activeRoomId = 'room_old';
      engine.activeVaultKey = {};
      const originalFetch = window.fetch;
      const releases: ((response: Response) => void)[] = [];
      const urls: string[] = [];
      const applied: string[] = [];
      engine.applyIncomingBundle = async (payload: { bundleId: string }) => { applied.push(payload.bundleId); };
      window.fetch = (input) => {
        urls.push(String(input));
        return new Promise<Response>(resolve => { releases.push(resolve); });
      };
      try {
        const oldPull = engine.fetchPendingBundlesHttp();
        engine.disconnect();
        engine.activeRoomId = 'room_new';
        engine.activeVaultKey = {};
        engine.currentVaultId = 'vault_new';
        const newPull = engine.fetchPendingBundlesHttp();
        releases[0](Response.json({ bundles: [{ syncId: 1, payload: { bundleId: 'stale' } }] }, { status }));
        await oldPull;
        const staleState = { state: engine.status.state, error: engine.status.error, applied: [...applied] };
        const newPullPreserved = engine.fetchPendingBundlesHttp() === newPull;
        releases[1](Response.json({ bundles: [{ syncId: 2, payload: { bundleId: 'fresh' } }] }));
        await newPull;
        return { urls, staleState, newPullPreserved, applied, cleared: engine.pendingPull === null };
      } finally {
        window.fetch = originalFetch;
        engine.disconnect();
      }
    }, staleStatus);
    expect(result.urls).toHaveLength(2);
    expect(new URL(result.urls[0]).pathname).toBe('/api/rooms/room_old/bundles');
    expect(new URL(result.urls[1]).pathname).toBe('/api/rooms/room_new/bundles');
    expect(new URL(result.urls[1]).searchParams.get('vault')).toBe('vault_new');
    expect(result.staleState).toEqual({ state: 'idle', error: null, applied: [] });
    expect(result.newPullPreserved).toBe(true);
    expect(result.applied).toEqual(['fresh']);
    expect(result.cleared).toBe(true);
  });
}

test('a re-delivered pending bundle is written once and ACKed once, when the write lands', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/syncEngine.ts';
    const { SyncEngine, storage } = await import(/* @vite-ignore */ path);
    const engine = new SyncEngine();
    engine.activeRoomId = 'room_dedup';
    engine.activeVaultKey = {};
    const originalFetch = window.fetch;
    const originalImport = storage.importSyncedVaultData;
    let writes = 0;
    let updates = 0;
    const acks: string[][] = [];
    const acksBeforeWrite: number[] = [];
    let written = 0;
    const onUpdate = () => { updates++; };
    window.addEventListener('slag-sync-updated', onUpdate);
    storage.importSyncedVaultData = async () => { writes++; written++; };
    const bundle = { bundleId: 'redelivered', roomId: 'room_dedup', fromDeviceId: 'other', changes: [{ type: 'item', action: 'upsert', id: 'item', payload: { id: 'item', title: 'remote item' } }] };
    window.fetch = async (input, init) => {
      if (new URL(String(input)).pathname.endsWith('/ack')) {
        acksBeforeWrite.push(written);
        acks.push(JSON.parse(String(init!.body)).bundleIds);
        return Response.json({});
      }
      return Response.json({ bundles: [{ syncId: 1, payload: bundle }] });
    };
    try {
      await engine.fetchPendingBundlesHttp();
      await engine.fetchPendingBundlesHttp();
      // Imports are staged and flushed on a 120 ms timer so a burst of bundles renders once.
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { writes, updates, acks, acksBeforeWrite, applied: [...engine.appliedBundleIds] };
    } finally {
      window.fetch = originalFetch;
      storage.importSyncedVaultData = originalImport;
      window.removeEventListener('slag-sync-updated', onUpdate);
      engine.disconnect();
    }
  });
  // One write for two deliveries, one render, and the single ACK arrives only after the write:
  // the relay keeps its copy until this device actually has the bundle.
  expect(result).toEqual({ writes: 1, updates: 1, acks: [['redelivered']], acksBeforeWrite: [1], applied: ['redelivered'] });
});
