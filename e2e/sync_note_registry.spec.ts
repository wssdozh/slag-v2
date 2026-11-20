import { test, expect, serverUrl } from './support/selfhostFixture';

test('two browser vaults receive accepted notes through the registry, not legacy bundles', async ({ page, browser }) => {
  const second = await browser.newPage();
  const clients = new Set<{ send: (data: string) => void }>();
  const events: Array<Record<string, unknown>> = [];
  let pushes = 0;
  let pulls = 0;
  let registryActive = false;
  let upgrades = 0;
  let holdHealth = false;
  let releaseHealth = () => {};
  const pendingHealth = new Promise<void>((resolve) => { releaseHealth = resolve; });
  try {
    for (const view of [page, second]) {
      await view.route(`${serverUrl}/**`, async (route) => {
        const url = new URL(route.request().url());
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (view === page && url.pathname === '/health' && holdHealth) await pendingHealth;
        if (url.pathname.endsWith('/note-status')) return route.fulfill({ headers, json: {
          mode: registryActive ? 'registry' : 'legacy', generation: Number(registryActive), head: events.length, floor: 0,
        } });
        if (registryActive && url.pathname.endsWith('/bundles') && url.searchParams.get('noteGeneration') !== '1') {
          upgrades++;
          return route.fulfill({ status: 409, headers, json: { error: 'note_upgrade_required' } });
        }
        if (url.pathname.endsWith('/bundle') && route.request().method() === 'POST') {
          return route.fulfill({ status: 409, headers, json: { error: 'note_room_frozen' } });
        }
        if (url.pathname.endsWith('/note-events')) {
          pulls++;
          return route.fulfill({ headers, json: { generation: 1, head: events.length, floor: 0, events: events.slice(Number(url.searchParams.get('since'))) } });
        }
        return route.fulfill({ headers, json: { bundles: [], head: 0, oldest: 0, authRequired: false } });
      });
      await view.routeWebSocket(/127\.0\.0\.1:18321\/ws\//, (socket) => {
        if (!registryActive) {
          socket.send(JSON.stringify({ type: 'welcome', connectedDevices: 1 }));
          return;
        }
        if (new URL(socket.url()).searchParams.get('noteGeneration') !== '1') return socket.close();
        clients.add(socket);
        socket.send(JSON.stringify({ type: 'welcome', connectedDevices: clients.size }));
        socket.onMessage((raw) => {
          const frame = JSON.parse(String(raw));
          if (frame.type !== 'note_ops') return;
          pushes++;
          const batch = frame.ops.map((op: object, i: number) => ({ ...op, revision: events.length + i + 1 }));
          events.push(...batch);
          for (const recipient of clients) recipient.send(JSON.stringify({ type: 'note_events', generation: 1, events: batch }));
          socket.send(JSON.stringify({ type: 'note_results', generation: 1, requestId: frame.requestId,
            results: batch.map(({ opId, revision }: { opId: string; revision: number }) => ({ opId, revision, status: 'accepted' })) }));
        });
        socket.onClose(() => clients.delete(socket));
      });
    }
    // Load the actual sync/storage modules without waiting for the unrelated app shell, fonts or index UI.
    const base = new URL('/__registry_test__', test.info().project.use.baseURL);
    for (const view of [page, second]) {
      await view.route(base.href, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Note registry test</title>' }));
    }
    for (const [i, view] of [page, second].entries()) {
      await view.goto(base.href);
      await view.evaluate(async ({ i, serverUrl }) => {
        const { initSecretStore } = await import(/* @vite-ignore */ '/src/lib/platform/secretStore.ts');
        await initSecretStore();
        const { syncEngine, storage, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
        const vault = storage.getCurrentVault();
        vault.syncId = 'registry-e2e-vault';
        const deviceId = `registry-e2e-${i}`;
        const state = { ...accountClient.getState(), devices: [], vaults: [{ id: vault.syncId, grants: [{ deviceId, mode: 'read-write', status: 'accepted' }] }] };
        accountClient.getToken = () => 'test-token';
        accountClient.getSession = () => ({ deviceId });
        accountClient.refresh = async () => {};
        accountClient.getState = () => state;
        syncEngine.getSyncVaultId = () => vault.syncId;
        syncEngine.saveConfig({ enabled: true, seedPhrase: 'synthetic registry seed', serverUrl, deviceId, autoSync: false });
        await syncEngine.init();
        if (i && !syncEngine.noteGeneration) throw new Error(syncEngine.getStatus().error ?? 'registry not connected');
      }, { i, serverUrl });
      if (i === 0) {
        registryActive = true;
        await view.evaluate(async () => {
          const { syncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
          if (syncEngine.noteGeneration) throw new Error('expected legacy before refresh');
          await syncEngine.retrySync();
          if (syncEngine.noteGeneration !== 1) throw new Error(syncEngine.getStatus().error ?? 'refresh did not renegotiate registry');
        });
        expect(upgrades).toBe(1);
      }
    }
    await expect.poll(() => clients.size).toBe(2);
    const started = performance.now();
    await page.evaluate(async () => {
      const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      storage.saveItems(Array.from({ length: 10 }, (_, i) => ({ id: `registry-${i}`, type: 'note', title: `registry title ${i}`,
        content: 'hello registry', folder: 'Входящие', createdAt: 1, updatedAt: 1, tags: [], attachments: [] })));
    });
    await expect.poll(() => second.evaluate(async () => {
      const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      return storage.getItems().filter(({ id }: { id: string }) => id.startsWith('registry-')).length;
    })).toBe(10);
    await test.info().attach('registry-loopback', { contentType: 'application/json', body: JSON.stringify({
      durationMs: Math.round(performance.now() - started), noteCount: events.length, pushes, pulls,
    }) });
    expect(pushes).toBe(1);
    expect(pulls).toBeLessThanOrEqual(4);

    holdHealth = true;
    const health = page.waitForRequest(`${serverUrl}/health`);
    const restarting = page.evaluate(async () => {
      const { syncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      await syncEngine.init();
    });
    await health;
    await page.evaluate(async () => {
      const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      const item = storage.getItemById('registry-0');
      storage.saveItem({ ...item, content: 'captured before network negotiation' });
    });
    await expect.poll(() => page.evaluate(async () => {
      const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      const local = await storage.readNoteRegistry();
      return local.journal.pending.length;
    })).toBe(1);
    expect(events).toHaveLength(10);
    releaseHealth();
    await restarting;
    await expect.poll(() => second.evaluate(async () => {
      const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      return storage.getItemById('registry-0')?.content;
    })).toBe('captured before network negotiation');
    expect(events).toHaveLength(11);
    await page.evaluate(async () => {
      const { syncEngine } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
      const pending = { bundleId: 'frozen-regression', encrypted: {}, settled: false };
      await syncEngine.deliverPushOverHttp(pending);
      if (pending.settled || !syncEngine.getStatus().error?.includes('409')) {
        throw new Error('frozen bundle was treated as delivered');
      }
    });
  } finally {
    releaseHealth();
    await second.close();
  }
});
