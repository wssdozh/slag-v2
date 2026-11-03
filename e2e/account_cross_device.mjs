// Authorized public account acceptance check. Only ephemeral browser contexts and new test vaults.
// Run on Windows: node e2e/account_cross_device.mjs
// Linux worker receives secrets only through encrypted SSH stdin; stdout contains no secrets.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

const relay = 'http://152.53.199.71:8320';
const app = 'http://127.0.0.1:5173';
const worker = process.argv.includes('--worker');
let browser;
let page;

async function open(config) {
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(({ runId, role }) => {
    const id = `account-other-${role}-${runId}`;
    const vault = { id, name: 'isolated other test vault', mode: 'indexeddb', isCurrent: true };
    localStorage.setItem('slag_allow_insecure_account_test', 'true');
    localStorage.setItem('slag_vaults_v2', JSON.stringify([vault]));
    localStorage.setItem('slag_current_vault_v2', JSON.stringify(vault));
    localStorage.setItem(`slag_items_${id}`, '[]');
    localStorage.setItem(`slag_sync_config_v2_${id}`, JSON.stringify({ enabled: false, deviceId: `${role}-${runId}`, serverUrl: 'http://152.53.199.71:8320' }));
  }, config);
  page = await context.newPage();
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (![app, relay].includes(url.origin)) return route.abort('blockedbyclient');
    if (url.pathname === '/account-cross-device') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>isolated account cross-device check</title>' });
    return route.continue();
  });
  await page.goto(`${app}/account-cross-device`);
  await page.evaluate(async ({ runId, role }) => {
    // Follow Vite's exact timestamped graph: bare imports after HMR can instantiate a second singleton.
    const sharingPath = '/src/lib/sync/vaultSharing.ts';
    const sharingSource = await (await fetch(sharingPath)).text();
    const enginePath = sharingSource.match(/from ["']([^"']*\/syncEngine\.ts[^"']*)["']/)[1];
    const engineSource = await (await fetch(enginePath)).text();
    const accountPath = engineSource.match(/from ["']([^"']*\/account\.ts[^"']*)["']/)[1];
    const accountSource = await (await fetch(accountPath)).text();
    const cryptoPath = accountSource.match(/from ["']([^"']*\/accountCrypto\.ts[^"']*)["']/)[1];
    const engine = await import(enginePath);
    const account = await import(accountPath);
    const crypto = await import(cryptoPath);
    const sharing = await import(sharingPath);
    window.fixture = { ...engine, ...account, ...crypto, ...sharing, runId, role };
  }, config);
}

async function act(action, data = {}) {
  return page.evaluate(async ({ action, data, relay }) => {
    const f = window.fixture;
    const api = f.accountClient;
    const engine = f.syncEngine;
    const store = f.storage;
    const vaultId = `account-shared-${f.runId}`;
    const deviceId = `${f.role}-${f.runId}`;
    const noteId = `host-note-${f.runId}`;
    const note = (id, title) => ({ id, title, content: 'synthetic cross-device data only', type: 'note', folder: 'Входящие', tags: [], attachments: [], createdAt: Date.now(), updatedAt: Date.now() });
    if (action === 'register' || action === 'login') {
      const identity = await f.getOrCreateDeviceIdentity(deviceId, `test ${f.role}`, 'web');
      const seed = data.seed || f.generateMnemonic();
      const result = await api[action](seed, relay, identity);
      // Only the local owner returns its new seed to the orchestrator's memory, never stdout.
      return action === 'register' ? { result, seed, accountId: api.getState().account.id } : { result };
    }
    if (action === 'logout') { engine.disconnect(); await api.logout(); return true; }
    if (action === 'refresh') { await api.refresh(); return true; }
    if (action === 'approve') { await api.approveDevice(`guest-${f.runId}`); return true; }
    if (action === 'prepare') {
      store.createVault('shared account test', 'indexeddb', undefined, vaultId);
      const seed = f.generateMnemonic();
      engine.setVaultSeedPhrase(vaultId, seed);
      await engine.switchVault(vaultId);
      engine.saveConfig({ enabled: true, autoSync: false, deviceId, serverUrl: relay });
      await api.registerVault(vaultId, 'shared account test');
      await api.refresh();
      const guest = api.getState().devices.find(d => d.id === `guest-${f.runId}`);
      const envelope = await f.encryptVaultKeyForDevice(seed, guest.publicKey);
      if (envelope.includes(seed)) throw new Error('unencrypted vault key');
      let wrongDeviceRejected = false;
      try { await f.decryptVaultKeyForDevice(deviceId, envelope); } catch { wrongDeviceRejected = true; }
      if (!wrongDeviceRejected) throw new Error('wrong-device key decryption succeeded');
      await api.grantVault(vaultId, guest.id, 'read-write', envelope);
      store.saveItem(note(noteId, 'windows → linux: кириллица 🔒'));
      await engine.init();
      return { vaultId, wrongDeviceRejected, initialCount: store.getItems().length };
    }
    if (action === 'install') {
      await api.refresh();
      const invitation = api.getState().invitations.find(v => v.vaultId === vaultId);
      if (!invitation) throw new Error('missing invitation');
      f.invitation = invitation;
      await api.acceptVault(vaultId);
      const actions = { createVault: (...args) => store.createVault(...args), switchVault: id => store.switchVault(id) };
      const result = await f.installSharedVault(invitation, deviceId, actions, false);
      store.switchVault(vaultId);
      await engine.switchVault(vaultId);
      engine.saveConfig({ enabled: true, autoSync: false, deviceId, serverUrl: relay });
      await engine.init();
      const countBefore = store.getVaults().length;
      const merge = await f.installSharedVault(invitation, deviceId, actions, false);
      return { result, merge, countBefore, countAfter: store.getVaults().length };
    }
    if (action === 'edit') {
      const original = store.getItemById(noteId);
      if (!original) throw new Error('missing host note');
      store.saveItem({ ...original, title: 'linux → windows: подтверждено ✅', updatedAt: Math.max(Date.now(), original.updatedAt + 1) });
      store.saveItem(note(`guest-note-${f.runId}`, 'linux synthetic note'));
      await engine.pushLocalChanges();
      return true;
    }
    if (action === 'revoke') { await api.revokeVaultGrant(vaultId, `guest-${f.runId}`); return true; }
    if (action === 'probe') {
      const roomId = engine.getStatus().currentRoomId;
      const query = `device=${encodeURIComponent(deviceId)}&vault=${encodeURIComponent(vaultId)}`;
      const response = await fetch(`${relay}/api/rooms/${roomId}/bundles?${query}`, { headers: { Authorization: api.authHeader } });
      const pushResponse = await fetch(`${relay}/api/rooms/${roomId}/bundle?vault=${encodeURIComponent(vaultId)}`, {
        method: 'POST', headers: { Authorization: api.authHeader, 'Content-Type': 'application/json' }, body: '{}',
      });
      const localCount = store.getItems().length;
      await api.refresh();
      await engine.init();
      return { httpStatus: response.status, pushHttpStatus: pushResponse.status, localCount, localCountAfter: store.getItems().length, state: engine.getStatus().state, error: engine.getStatus().error };
    }
    if (action === 'snapshot') {
      const other = `account-other-${f.role}-${f.runId}`;
      const items = store.getItems();
      return { count: items.length, ids: items.map(n => n.id), hostUpdated: items.some(n => n.id === noteId && n.title === 'linux → windows: подтверждено ✅'), otherCount: JSON.parse(localStorage.getItem(`slag_items_${other}`)).length, defaultVaultCreated: localStorage.getItem('slag_items_default_vault') !== null, state: engine.getStatus().state, error: engine.getStatus().error, roomId: engine.getStatus().currentRoomId, deviceId: engine.getConfig().deviceId, trusted: engine.getConfig().trustedDevices.map(d => ({ id: d.id, vaults: d.allowedVaults })) };
    }
    if (action === 'proof') {
      const summary = document.createElement('pre');
      summary.style.cssText = 'padding:40px;background:#08090a;color:#eee;font:18px monospace;white-space:pre-wrap';
      summary.textContent = `isolated account check: ${f.role}\n${vaultId}\nnotes: ${store.getItems().length}\nother test vault: 0 notes\nnew sync denied after revoke; local copy retained`;
      document.body.replaceChildren(summary);
      return true;
    }
    throw new Error('unknown test action');
  }, { action, data, relay });
}

async function waitNotes(call, predicate) {
  const deadline = Date.now() + 45000;
  let snapshot;
  while (Date.now() < deadline) {
    snapshot = await call('snapshot');
    if (predicate(snapshot)) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`cross-device note delivery timed out: ${JSON.stringify(snapshot)}`);
}

if (worker) {
  const input = createInterface({ input: process.stdin });
  for await (const line of input) {
    const message = JSON.parse(line);
    try {
      let result;
      if (message.action === 'open') { await open(message.data); result = true; }
      else if (message.action === 'close') { await browser.close(); process.stdout.write(JSON.stringify({ id: message.id, result: true }) + '\n'); break; }
      else result = await act(message.action, message.data);
      process.stdout.write(JSON.stringify({ id: message.id, result }) + '\n');
    } catch {
      // Never serialize browser exceptions or command payloads: they can contain credentials.
      process.stdout.write(JSON.stringify({ id: message.id, error: `worker ${message.action} failed` }) + '\n');
    }
  }
  if (browser) await browser.close();
} else {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const remote = spawn('ssh', ['-i', 'C:\\Users\\morii\\.ssh\\id_laptop', 'psycho@192.168.0.103', 'cd /home/psycho/GitHub/slag-v2 && node e2e/account_cross_device.mjs --worker'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let serial = 0;
  const output = createInterface({ input: remote.stdout });
  output.on('line', line => {
    const reply = JSON.parse(line);
    const entry = pending.get(reply.id);
    if (!entry) return;
    pending.delete(reply.id);
    clearTimeout(entry.timer);
    if (reply.error) entry.reject(new Error(reply.error)); else entry.resolve(reply.result);
  });
  remote.stderr.resume(); // Do not forward remote diagnostics, which could accidentally expose a URL token.
  remote.on('exit', () => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('linux worker exited')); }
    pending.clear();
  });
  const guest = (action, data = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`linux ${action} timed out`)); }, 60000);
    pending.set(id, { resolve, reject, timer });
    remote.stdin.write(JSON.stringify({ id, action, data }) + '\n');
  });
  try {
    assert.equal((await (await fetch(`${relay}/health`)).json()).authRequired, true);
    await open({ role: 'host', runId });
    await guest('open', { role: 'guest', runId });
    const registered = await act('register');
    assert.equal(registered.result, 'authenticated');
    assert.equal((await guest('login', { seed: registered.seed })).result, 'pending_device');
    await act('approve');
    assert.equal((await guest('login', { seed: registered.seed })).result, 'authenticated');
    registered.seed = null;
    const vault = await act('prepare');
    const installed = await guest('install');
    assert.equal(installed.result, 'created');
    assert.equal(installed.merge, 'merged');
    assert.equal(installed.countBefore, installed.countAfter);
    await waitNotes(guest, s => s.count === 1);
    await act('refresh');
    await guest('edit');
    const host = await waitNotes(act, s => s.count === 2 && s.hostUpdated);
    const beforeRevoke = await guest('snapshot');
    await act('revoke');
    const revoked = await guest('probe');
    assert.equal(revoked.httpStatus, 403);
    assert.equal(revoked.pushHttpStatus, 403);
    assert.equal(revoked.localCount, 2);
    assert.equal(revoked.localCountAfter, 2);
    assert.notEqual(revoked.state, 'connected');
    assert.equal(host.otherCount, 0);
    assert.equal(beforeRevoke.otherCount, 0);
    assert.equal(host.defaultVaultCreated, false);
    assert.equal(beforeRevoke.defaultVaultCreated, false);
    await act('proof');
    await page.screenshot({ path: 'test-results/screenshots/account-cross-device.png' });
    await guest('logout');
    await act('logout');
    process.stdout.write(JSON.stringify({ runId, accountId: registered.accountId, vaultId: vault.vaultId, ownerDevice: `host-${runId}`, guestDevice: `guest-${runId}`, pendingApproved: true, encryptedGrant: true, wrongDeviceRejected: vault.wrongDeviceRejected, installed: installed.result, sameIdMerge: installed.merge, hostCount: host.count, guestCount: beforeRevoke.count, noteIds: host.ids, isolatedOtherCounts: [host.otherCount, beforeRevoke.otherCount], defaultVaultCreated: false, revoke: revoked, success: true }) + '\n');
  } finally {
    if (browser) await browser.close();
    if (remote.exitCode === null) {
      try { await guest('close'); } catch { remote.kill(); }
    }
    remote.stdin.end();
    output.close();
  }
}
