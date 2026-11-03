import type { Page } from '@playwright/test';
import { test, expect } from './support/accountHarness';

type AccountModules = typeof import('../src/lib/sync/account') & typeof import('../src/lib/sync/accountCrypto') & typeof import('../src/lib/sync/crypto');
declare global { interface Window { accountTest: AccountModules } }

async function openDevice(page: Page, appUrl: string, relayUrl: string) {
  // Fail closed: neither application boot nor an accidental default server can reach user data.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if ([new URL(appUrl).origin, relayUrl].includes(url.origin)) return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto(appUrl);
  await page.evaluate(async () => {
    const clientPath = '/src/lib/sync/account.ts';
    const cryptoPath = '/src/lib/sync/accountCrypto.ts';
    const bundleCryptoPath = '/src/lib/sync/crypto.ts';
    window.accountTest = { ...await import(clientPath), ...await import(cryptoPath), ...await import(bundleCryptoPath) };
  });
}

test('seed account authentication, approved device and encrypted vault invitation against isolated relay', async ({ browser, accountHarness }) => {
  test.setTimeout(90_000);
  const { appUrl, relayUrl } = accountHarness;
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const guest = await guestContext.newPage();
  const wire: { url: string; body: string }[] = [];
  for (const page of [owner, guest]) {
    page.on('request', (request) => {
      if (request.url().startsWith(relayUrl)) wire.push({ url: request.url(), body: request.postData() || '' });
    });
  }
  try {
    await openDevice(owner, appUrl, relayUrl);
    await openDevice(guest, appUrl, relayUrl);
    const seeds = await owner.evaluate(() => ({
      account: window.accountTest.generateMnemonic(), vault: window.accountTest.generateMnemonic(),
    }));
    expect(await owner.evaluate((url) => window.accountTest.accountClient.detectServer(url), relayUrl)).toBe(true);
    const registered = await owner.evaluate(async ({ seed, url }) => {
      const api = window.accountTest;
      const identity = await api.getOrCreateDeviceIdentity('owner-device', 'Owner browser', 'web');
      const result = await api.accountClient.register(seed, url, identity);
      const derived = await api.generateAccountIdentity(seed.toUpperCase().replaceAll(' ', '  '));
      return { result, accountId: derived.accountId, state: api.accountClient.getState() };
    }, { seed: seeds.account, url: relayUrl });
    expect(registered.result).toBe('authenticated');
    expect(registered.state.account!.id).toBe(registered.accountId);
    expect(registered.state.devices).toEqual([expect.objectContaining({ id: 'owner-device', status: 'active' })]);

    const foreignRequests: { authorization: string | null; url: string }[] = [];
    const foreignUrl = new URL(appUrl).origin;
    await owner.route(`${foreignUrl}/health`, async (route) => {
      foreignRequests.push({ authorization: route.request().headers()['authorization'] ?? null, url: route.request().url() });
      await route.fulfill({ json: { authRequired: false } });
    });
    const switched = await owner.evaluate(async (url) => {
      const api = window.accountTest.accountClient;
      const original = api.getSession();
      await api.detectServer(url);
      await api.refresh();
      return { token: api.getToken(), authHeader: api.authHeader, authenticated: api.isAuthenticated(), session: api.getSession(), original };
    }, foreignUrl);
    expect(switched.token).toBeNull();
    expect(switched.authHeader).toBeNull();
    expect(switched.authenticated).toBe(false);
    expect(switched.session).toEqual(switched.original);
    expect(foreignRequests).toEqual([{ authorization: null, url: `${foreignUrl}/health` }]);
    await owner.evaluate((url) => window.accountTest.accountClient.detectServer(url), relayUrl);

    const pending = await guest.evaluate(async ({ seed, url }) => {
      const api = window.accountTest;
      const device = await api.getOrCreateDeviceIdentity('guest-device', 'Guest browser', 'web');
      return { result: await api.accountClient.login(seed, url, device), session: api.accountClient.getSession() };
    }, { seed: seeds.account, url: relayUrl });
    expect(pending).toEqual({ result: 'pending_device', session: null });
    await owner.evaluate(() => window.accountTest.accountClient.refresh());
    expect(await owner.evaluate(() => window.accountTest.accountClient.getState().devices)).toContainEqual(
      expect.objectContaining({ id: 'guest-device', status: 'pending' }),
    );
    await owner.evaluate(() => window.accountTest.accountClient.approveDevice('guest-device'));
    expect(await guest.evaluate(() => window.accountTest.accountClient.completePendingLogin())).toBe('authenticated');
    await owner.evaluate(() => window.accountTest.accountClient.renameDevice('guest-device', 'Approved browser'));
    expect(await owner.evaluate(() => window.accountTest.accountClient.getState().devices)).toContainEqual(
      expect.objectContaining({ id: 'guest-device', name: 'Approved browser', status: 'active' }),
    );

    const encrypted = await owner.evaluate(async (vaultSeed) => {
      const api = window.accountTest;
      await api.accountClient.registerVault('integration-vault', 'Integration vault');
      const device = api.accountClient.getState().devices.find((entry) => entry.id === 'guest-device')!;
      const envelope = await api.encryptVaultKeyForDevice(vaultSeed, device.publicKey);
      await api.accountClient.grantVault('integration-vault', device.id, 'receive-only', envelope);
      let wrongDeviceRejected = false;
      try { await api.decryptVaultKeyForDevice('owner-device', envelope); }
      catch { wrongDeviceRejected = true; }
      return { envelope, wrongDeviceRejected };
    }, seeds.vault);
    expect(encrypted.wrongDeviceRejected).toBe(true);
    expect(encrypted.envelope).not.toContain(seeds.vault);
    const invitation = await guest.evaluate(async () => {
      const api = window.accountTest;
      await api.accountClient.refresh();
      return api.accountClient.getState().invitations;
    });
    expect(invitation).toEqual([expect.objectContaining({
      vaultId: 'integration-vault', vaultName: 'Integration vault', mode: 'receive-only', encryptedKey: encrypted.envelope,
    })]);
    const accepted = await guest.evaluate(async () => {
      const api = window.accountTest;
      const invitation = api.accountClient.getState().invitations[0];
      await api.accountClient.acceptVault(invitation.vaultId);
      return { seed: await api.decryptVaultKeyForDevice('guest-device', invitation.encryptedKey), state: api.accountClient.getState() };
    });
    expect(accepted.seed).toBe(seeds.vault);
    expect(accepted.state.invitations).toEqual([]);
    expect(accepted.state.vaults).toEqual([expect.objectContaining({
      id: 'integration-vault', grants: expect.arrayContaining([expect.objectContaining({ deviceId: 'guest-device', status: 'accepted', mode: 'receive-only' })]),
    })]);

    const published = await owner.evaluate(async ({ url, seed }) => {
      const api = window.accountTest;
      const roomId = await api.deriveRoomId(seed);
      const content = 'Synthetic receive-only encrypted note';
      const hash = await api.computeHash(content);
      const bundle = {
        bundleId: crypto.randomUUID(), roomId, fromDeviceId: 'owner-device', sequence: 1,
        stateRootHash: hash, timestamp: new Date().toISOString(),
        changes: [{ id: 'synthetic-note', type: 'item' as const, action: 'upsert' as const, version: 1, hash, payload: { content } }],
      };
      const encrypted = await api.encryptBundle(bundle, await api.deriveVaultKey(seed));
      const response = await fetch(`${url}/api/rooms/${roomId}/bundle?vault=integration-vault`, {
        method: 'POST', headers: { Authorization: `Bearer ${api.accountClient.getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: encrypted }),
      });
      return { status: response.status, bundle, encrypted };
    }, { url: relayUrl, seed: seeds.vault });
    expect(published.status).toBe(200);
    const received = await guest.evaluate(async ({ url, roomId }) => {
      const api = window.accountTest;
      const response = await fetch(`${url}/api/rooms/${roomId}/bundles?vault=integration-vault`, {
        headers: { Authorization: `Bearer ${api.accountClient.getToken()}` },
      });
      const body = await response.json();
      return { status: response.status, bundles: body.bundles };
    }, { url: relayUrl, roomId: published.bundle.roomId });
    expect(received.status).toBe(200);
    expect(received.bundles).toEqual([expect.objectContaining({
      bundleId: published.bundle.bundleId, payload: published.encrypted,
    })]);
    const exchange = await guest.evaluate(async ({ url, roomId, seed, encrypted }) => {
      const api = window.accountTest;
      const key = await api.deriveVaultKey(seed);
      const bundle = await api.decryptBundle(encrypted, key);
      // Use a fresh, correctly attributed encrypted bundle so denial cannot be a replay or device mismatch.
      const write = await api.encryptBundle({ ...bundle, bundleId: crypto.randomUUID(), fromDeviceId: 'guest-device' }, key);
      const response = await fetch(`${url}/api/rooms/${roomId}/bundle?vault=integration-vault`, {
        method: 'POST', headers: { Authorization: `Bearer ${api.accountClient.getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: write }),
      });
      return { bundle, writeStatus: response.status, writeError: await response.json() };
    }, { url: relayUrl, roomId: published.bundle.roomId, seed: accepted.seed, encrypted: received.bundles[0].payload });
    expect(exchange.bundle).toEqual(published.bundle);
    expect(exchange.writeStatus).toBe(403);
    expect(exchange.writeError).toEqual({ error: 'vault_access_denied' });
    const bundleRequests = wire.filter((entry) => /\/bundle\?vault=integration-vault$/.test(entry.url));
    expect(bundleRequests).toHaveLength(2);
    for (const request of bundleRequests) {
      expect(request.body).not.toContain('Synthetic receive-only encrypted note');
      expect(JSON.parse(request.body).bundle).not.toHaveProperty('changes');
    }

    const logout = await guest.evaluate(async (url) => {
      const api = window.accountTest.accountClient;
      const token = api.getToken()!;
      await api.logout();
      return {
        session: api.getSession(), authenticated: api.isAuthenticated(),
        stored: localStorage.getItem('slag_account_session_v1'),
        oldTokenStatus: (await fetch(`${url}/api/account`, { headers: { Authorization: `Bearer ${token}` } })).status,
      };
    }, relayUrl);
    expect(logout).toEqual({ session: null, authenticated: false, stored: null, oldTokenStatus: 401 });
    const denied = await guest.evaluate(async (url) => {
      const requests = [
        ['/api/account', 'GET'], ['/api/vaults', 'GET'],
        ['/api/pair/create', 'POST'], ['/api/rooms/integration-vault/bundles?device=anonymous', 'GET'],
      ];
      return Promise.all(requests.map(async ([path, method]) => (await fetch(url + path, { method })).status));
    }, relayUrl);
    expect(denied).toEqual([401, 401, 401, 401]);
    expect(await guest.evaluate((url) => new Promise<boolean>((resolve) => {
      const socket = new WebSocket(`${url.replace('http:', 'ws:')}/ws/integration-vault?device=anonymous`);
      socket.onopen = () => { socket.close(); resolve(false); };
      socket.onerror = () => resolve(true);
    }), relayUrl)).toBe(true);
    await owner.evaluate(() => window.accountTest.accountClient.revokeDevice('guest-device'));
    expect(await owner.evaluate(() => window.accountTest.accountClient.getState().devices)).toContainEqual(
      expect.objectContaining({ id: 'guest-device', status: 'revoked' }),
    );

    const authBodies = wire.filter((entry) => /\/api\/auth\/(register|login)$/.test(entry.url)).map((entry) => JSON.parse(entry.body));
    expect(authBodies).toHaveLength(2);
    const completionBodies = wire.filter((entry) => /\/api\/auth\/device-requests\/[^/]+\/complete$/.test(entry.url)).map((entry) => JSON.parse(entry.body));
    expect(completionBodies).toHaveLength(1);
    expect(completionBodies[0].deviceSignature).toMatch(/^[a-f0-9]{128}$/);
    expect(completionBodies[0].signature).toBeUndefined();
    for (const body of authBodies) {
      expect(body.signature).toMatch(/^[a-f0-9]{128}$/);
      expect(body.deviceSignature).toMatch(/^[a-f0-9]{128}$/);
      expect(body.publicKey).toMatch(/^(02|03)[a-f0-9]{64}$/);
      expect(body).not.toHaveProperty('seed');
    }
    for (const request of wire) {
      expect(JSON.stringify(request)).not.toContain(seeds.account);
      expect(JSON.stringify(request)).not.toContain(seeds.vault);
      expect(request.body).not.toContain('"d":');
    }
  } finally {
    await ownerContext.close();
    await guestContext.close();
  }
});
