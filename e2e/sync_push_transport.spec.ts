import { test, expect } from './support/selfhostFixture';

test('sync harness restores browser state when initialization fails', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const { storage, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const realFetch = window.fetch;
    const realImport = storage.importSyncedVaultData;
    const methods = ['getToken', 'getSession', 'refresh', 'getState', 'subscribe'] as const;
    const originals = methods.map((method) => accountClient[method]);
    let disconnected = false;
    let error = '';
    try {
      await withSyncHarness(async ({ engine, storage, init }) => {
        const disconnect = engine.disconnect.bind(engine);
        engine.disconnect = () => { disconnected = true; disconnect(); };
        engine.init = async () => { throw new Error('setup failed'); };
        window.fetch = async () => new Response('{}');
        storage.importSyncedVaultData = async () => {};
        await init('synthetic failing seed');
      });
    } catch (caught) {
      error = (caught as Error).message;
    }
    return {
      error, disconnected,
      fetchRestored: window.fetch === realFetch,
      importRestored: storage.importSyncedVaultData === realImport,
      accountRestored: methods.every((method, index) => accountClient[method] === originals[index]),
    };
  });
  expect(result).toEqual({ error: 'setup failed', disconnected: true, fetchRestored: true, importRestored: true, accountRestored: true });
});

test('push uses the open socket (text or binary frame) and only falls back to HTTP', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const { stateHashKey } = await import(/* @vite-ignore */ '/src/lib/sync/localBookkeeping.ts');
    const { getPref, getPrefEntries, removePref } = await import(/* @vite-ignore */ '/src/lib/storage/prefs.ts');
    return withSyncHarness(async ({ engine, push, init }) => {
      const methods: string[] = [];
      const frames: Array<string | Uint8Array> = [];
      let postStatus = 200;
      let postReceipt: Record<string, string> = {};
      window.fetch = async (_url, opts) => {
        const method = (opts && opts.method) || 'GET';
        methods.push(method);
        if (method !== 'POST') return Response.json({ bundles: [], head: 0, oldest: 0 });
        return Response.json(postReceipt, { status: postStatus });
      };
      await init('synthetic push seed');
      const ack = async (bundleId: string) => {
        await engine.handleIncomingMessage(JSON.stringify({ type: 'server_ack', bundleId }));
      };
      const stateKey = () => stateHashKey(engine.bookkeeping);
      const clear = () => {
        removePref(stateKey());
        removePref('slag_sync_last_state_hash');
        for (const [key] of getPrefEntries()) {
          if (key.startsWith('slag_sync_sent_hashes_')) removePref(key);
        }
      };

      // init already pushed whatever it found, and a push with an unchanged state hash is a no-op,
      // so forget the hashes: each phase below must have something to send.
      clear();

      // 1. Old relay (no binary capability): one text frame, zero HTTP requests.
      engine.ws = { readyState: 1, send: (data: string | Uint8Array) => { frames.push(data); }, close: () => {} };
      engine.wsSupportsBinary = false;
      methods.length = 0;
      await push();
      const textOverSocket = methods.length === 0 && frames.length === 1 && typeof frames[0] === 'string';
      const bundleId = textOverSocket ? JSON.parse(frames[0] as string).bundle.bundleId : '';
      await ack(bundleId);
      const committedOnAck = getPref(stateKey()) !== null;

      // 2. Relay that advertises the binary uplink: a raw frame instead of base64 JSON.
      clear();
      engine.wsSupportsBinary = true;
      methods.length = 0;
      const before = frames.length;
      await push();
      const binaryFrame = frames.length === before + 1 && frames[before] instanceof Uint8Array;
      const head = binaryFrame ? (frames[before] as Uint8Array).subarray(0, 2) : [];
      const binaryHeader = head[0] === 1 && head[1] === 1;
      const headerPulledNothing = methods.length === 0;
      const binaryBundleId = binaryFrame
        ? new TextDecoder().decode((frames[before] as Uint8Array).subarray(3, 3 + (frames[before] as Uint8Array)[2]))
        : '';
      await ack(binaryBundleId);

      // 3. No socket at all: HTTP POST, with explicit replay as the only successful 409.
      clear();
      engine.ws = null;
      methods.length = 0;
      await push();
      const firstOverHttp = methods.filter(m => m === 'POST').length === 1;
      const httpCommitted = getPref(stateKey()) !== null;
      clear();
      postStatus = 409;
      postReceipt = { error: 'bundle_replay' };
      methods.length = 0;
      await push();
      const replayAccepted = methods.filter(m => m === 'POST').length === 1
        && engine.status.error === null
        && getPref(stateKey()) !== null;

      clear();
      postReceipt = { error: 'note_room_frozen' };
      methods.length = 0;
      await push();
      const freezeRejected = methods.filter(m => m === 'POST').length === 1
        && engine.status.error !== null
        && getPref(stateKey()) === null;

      return { textOverSocket, committedOnAck, binaryFrame, binaryHeader, headerPulledNothing, firstOverHttp, httpCommitted, replayAccepted, freezeRejected };
    });
  });
  expect(result).toEqual({
    textOverSocket: true,
    committedOnAck: true,
    binaryFrame: true,
    binaryHeader: true,
    headerPulledNothing: true,
    firstOverHttp: true,
    httpCommitted: true,
    replayAccepted: true,
    freezeRejected: true,
  });
});

test('a re-delivered bundleId applies only once', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    return withSyncHarness(async ({ engine, storage, init }) => {
      let applies = 0;
      const origImport = storage.importSyncedVaultData.bind(storage);
      storage.importSyncedVaultData = async (data) => { applies++; return origImport(data); };
      window.fetch = async () => Response.json({ bundles: [] });
      await init('synthetic dedup seed');
      const bundle = {
        bundleId: 'dup-bundle', roomId: engine.activeRoomId, fromDeviceId: 'other-device', sequence: 1,
        stateRootHash: 'x', timestamp: new Date().toISOString(),
        changes: [{ id: 'dup-note', type: 'item', action: 'upsert', version: 1, hash: 'h', payload: { id: 'dup-note', title: 'dup', folder: 'Входящие', type: 'note', content: 'dedup' } }],
      };
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
      // Imports are staged and flushed on a 120 ms timer, so wait past it before counting.
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { applies };
    });
  });
  expect(result).toEqual({ applies: 1 });
});
