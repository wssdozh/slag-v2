// Manual integration check: run receiver on Linux and sender on Windows with the same run ID.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const [role, runId] = process.argv.slice(2);
assert(['sender', 'receiver'].includes(role) && /^[a-z0-9-]+$/.test(runId));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('slag_sync_config_v2_default_vault', JSON.stringify({ enabled: false }));
  });
  page.on('console', message => {
    const text = message.text();
    if (text.includes('SYNC') || text.includes('CHECK') || message.type() === 'error') console.log(text);
  });
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => localStorage.getItem('slag_items_default_vault') !== null);
  await page.evaluate(async ({ role, runId }) => {
    const syncPath = '/src/lib/sync/syncEngine.ts';
    // Vite may timestamp dependency URLs after HMR; use the engine's exact storage module.
    const source = await (await fetch(syncPath)).text();
    const storagePath = source.match(/from ["']([^"']*\/storage\.ts[^"']*)["']/)[1];
    const { storage } = await import(storagePath);
    const { syncEngine } = await import(syncPath);
    window.checkStorage = storage;
    window.checkEngine = syncEngine;
    const id = `check-vault-${runId}`;
    storage.createVault('проверка синхронизации', 'indexeddb', undefined, id);
    await syncEngine.switchVault(id);
    // Wait for the initialization push before changing credentials in this fixture.
    while (syncEngine.isProcessingSync) await new Promise(resolve => setTimeout(resolve, 20));
    syncEngine.disconnect();
    syncEngine.saveConfig({
      enabled: true,
      deviceId: `check-${role}-${runId}`,
      // Unique synthetic key for the transport check; pairing validation is tested separately.
      seedPhrase: `cross-device-integration-${runId}`, 
      autoSync: false,
    });
    if (role === 'sender') {
      const now = Date.now();
      storage.importVaultData({ items: [{
        id: `note-${runId}`, title: 'windows → linux: кириллица 🔒',
        content: 'изолированная проверка, без пользовательских данных',
        type: 'note', folder: 'Входящие', tags: [], attachments: [], createdAt: now, updatedAt: now,
      }] });
    }
    localStorage.removeItem(`slag_sync_last_state_hash_${id}`);
    await syncEngine.init();
  }, { role, runId });
  await page.waitForFunction(() => window.checkEngine.getStatus().state === 'connected');
  if (role === 'sender') await page.evaluate(() => window.checkEngine.pushLocalChanges());
  if (role === 'receiver') {
    await page.waitForFunction(id => window.checkStorage.getItems().some(item => item.id === `note-${id}`), runId, { timeout: 60000 });
    await page.evaluate(async id => {
      const note = window.checkStorage.getItems().find(item => item.id === `note-${id}`);
      if (note.title !== 'windows → linux: кириллица 🔒') throw new Error('Unicode corruption');
      window.checkStorage.saveItem({ ...note, title: 'linux → windows: подтверждено ✅', updatedAt: Date.now() });
      await window.checkEngine.pushLocalChanges();
    }, runId);
  } else {
    await page.waitForFunction(id => window.checkStorage.getItems().some(item => item.id === `note-${id}` && item.title === 'linux → windows: подтверждено ✅'), runId, { timeout: 60000 });
  }
  await page.waitForTimeout(1000); // Let the peer process the ACK before closing this isolated context.
  const status = await page.evaluate(() => window.checkEngine.getStatus());
  assert.equal(status.error, null);
  console.log(JSON.stringify({ role, runId, bidirectionalSync: true, state: status.state }));
  // Render the verified stored record explicitly: the fixture bypasses AppContext actions.
  await page.evaluate(id => {
    const note = window.checkStorage.getItemById(`note-${id}`);
    const proof = document.createElement('section');
    proof.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#08090a;color:#f4f4f5;padding:60px;font:20px system-ui';
    const heading = document.createElement('h1');
    heading.textContent = note.title;
    const content = document.createElement('p');
    content.textContent = note.content;
    const detail = document.createElement('p');
    detail.textContent = `stored record: ${note.id} • ${window.checkEngine.getStatus().state}`;
    proof.append(heading, content, detail);
    document.body.append(proof);
  }, runId);
  await page.screenshot({ path: `test-results/screenshots/cross-device-${role}.png` });
} finally {
  await browser.close();
}
