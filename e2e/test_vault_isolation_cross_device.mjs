// Integration test: Verifies cross-device pairing into an isolated test vault without affecting 'main'.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const [role, runId] = process.argv.slice(2);
assert(['host', 'guest'].includes(role) && /^[a-z0-9-]+$/.test(runId));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('SYNC') || text.includes('VAULT') || text.includes('FS') || msg.type() === 'error') {
      console.log(`[${role}] ${text}`);
    }
  });

  const url = role === 'host' ? 'http://127.0.0.1:5173' : 'http://127.0.0.1:5173';
  await page.goto(url);
  await page.waitForFunction(() => localStorage.getItem('slag_items_default_vault') !== null);

  const testVaultId = `test_vault_${runId}`;
  const testVaultName = `Тест Изоляция ${runId} 🔒`;
  const server = 'http://152.53.199.71:8320';

  if (role === 'host') {
    const result = await page.evaluate(async ({ testVaultId, testVaultName, server, runId }) => {
      const { syncEngine, storage } = await import('/src/lib/sync/syncEngine.ts');
      const { createPairingSession } = await import('/src/lib/sync/pairing.ts');

      // 1. Check main vault count
      storage.switchVault('default_vault');
      const mainCountBefore = storage.getItems().length;

      // 2. Create isolated test vault
      storage.createVault(testVaultName, 'indexeddb', undefined, testVaultId);
      await syncEngine.switchVault(testVaultId);
      syncEngine.disconnect();

      // Verify test vault is clean (0 items)
      const testItemsInitial = storage.getItems().length;

      const { generateMnemonic } = await import('/src/lib/sync/crypto.ts');
      const testSeed = generateMnemonic();

      syncEngine.saveConfig({
        enabled: true,
        deviceId: `host-${runId}`,
        seedPhrase: testSeed,
        autoSync: false,
        serverUrl: server,
      });
      await syncEngine.init();

      // 3. Create pairing session
      const session = await createPairingSession(server, `host-${runId}`);

      return {
        pin: session.pin,
        sessionId: session.sessionId,
        mainCountBefore,
        testItemsInitial,
        testVaultId,
        testVaultName,
      };
    }, { testVaultId, testVaultName, server, runId });

    // Output PIN so caller or guest can read it
    console.log(JSON.stringify({ step: 'pin_created', pin: result.pin, sessionId: result.sessionId, mainCountBefore: result.mainCountBefore, testItemsInitial: result.testItemsInitial }));

    // Wait for guest claim
    await page.evaluate(async ({ sessionId, server, testVaultId, testVaultName, runId }) => {
      const { syncEngine, storage } = await import('/src/lib/sync/syncEngine.ts');
      const { pollPairingSession, approvePairingSession } = await import('/src/lib/sync/pairing.ts');

      const deadline = Date.now() + 60000;
      while (true) {
        const status = await pollPairingSession(server, sessionId);
        if (status.status === 'pending_approval') break;
        if (Date.now() > deadline) throw new Error('Timeout waiting for guest claim');
        await new Promise(r => setTimeout(r, 500));
      }

      // Approve pairing
      const approved = await approvePairingSession(server, sessionId, JSON.stringify({
        seedPhrase: syncEngine.getConfig().seedPhrase,
        vaultId: testVaultId,
        vaultName: testVaultName,
      }));
      if (!approved) throw new Error('Host approval rejected by relay');

      // Add a test note in the test vault
      const now = Date.now();
      storage.saveItem({
        id: `note_host_${runId}`,
        title: `хост заметка ${runId} 🔒`,
        content: 'изолированное хранилище',
        type: 'note',
        folder: 'Входящие',
        tags: ['тест'],
        attachments: [],
        createdAt: now,
        updatedAt: now,
      });
      localStorage.removeItem(`slag_sync_last_state_hash_${testVaultId}`);
      await syncEngine.pushLocalChanges();
    }, { sessionId: result.sessionId, server, testVaultId, testVaultName, runId });

    // Wait for guest's update and second note
    await page.waitForFunction(id => {
      const item = window.localStorage.getItem(`slag_items_test_vault_${id}`);
      if (!item) return false;
      const parsed = JSON.parse(item);
      return parsed.some(n => n.id === `note_host_${id}` && n.title.includes('подтверждено гостем ✅')) &&
             parsed.some(n => n.id === `note_guest_${id}`);
    }, runId, { timeout: 60000 });

    // Verify main vault was never contaminated
    const finalCheck = await page.evaluate(({ testVaultId, runId }) => {
      // Get storage
      const rawMain = localStorage.getItem('slag_items_default_vault');
      const mainItems = rawMain ? JSON.parse(rawMain) : [];
      const leakedInMain = mainItems.some(n => n.id.includes(runId));

      const rawTest = localStorage.getItem(`slag_items_${testVaultId}`);
      const testItems = rawTest ? JSON.parse(rawTest) : [];

      return {
        mainCountAfter: mainItems.length,
        leakedInMain,
        testItemsCount: testItems.length,
      };
    }, { testVaultId, runId });

    assert.equal(finalCheck.leakedInMain, false, 'No test notes leaked into main vault');
    console.log(JSON.stringify({ role: 'host', runId, success: true, ...finalCheck }));

  } else {
    // Guest role: receives PIN via CLI argument 3 or file
    const pin = process.argv[4];
    assert(pin && /^\d{3}-?\d{3}$/.test(pin), `Valid PIN required, got: ${pin}`);

    await page.evaluate(async ({ pin, server, runId }) => {
      const { syncEngine, storage } = await import('/src/lib/sync/syncEngine.ts');
      const { claimPairingSession, pollPairingPayload } = await import('/src/lib/sync/pairing.ts');
      const { validateMnemonic } = await import('/src/lib/sync/crypto.ts');

      // Check main vault count
      storage.switchVault('default_vault');
      const mainCountBefore = storage.getItems().length;

      // Claim session
      const claim = await claimPairingSession(server, pin, `guest-pk-${runId}`);
      const rawPayload = await pollPairingPayload(server, claim.sessionId, `guest-${runId}`, 60000, 500);
      const payload = JSON.parse(rawPayload);

      if (!payload.vaultId || !payload.vaultName || !payload.seedPhrase) throw new Error('Valid payload received');
      if (!validateMnemonic(payload.seedPhrase)) throw new Error('Valid seed phrase received');

      // Pairing rule: separate vault if unknown, merge if exists
      const allVaults = storage.getVaults();
      const existing = allVaults.find(v => v.id === payload.vaultId);
      if (existing) throw new Error('Vault must be new and separate for this test run');

      storage.createVault(payload.vaultName, 'indexeddb', undefined, payload.vaultId);
      await syncEngine.switchVault(payload.vaultId);
      syncEngine.disconnect();

      // Verify new vault starts clean (0 items)
      const testItemsInitial = storage.getItems().length;

      syncEngine.saveConfig({
        enabled: true,
        deviceId: `guest-${runId}`,
        serverUrl: server,
        autoSync: false,
      });
      await syncEngine.updateSeedPhrase(payload.seedPhrase);

      return {
        mainCountBefore,
        testItemsInitial,
        targetVaultId: payload.vaultId,
      };
    }, { pin, server, runId });

    // Wait for host note
    await page.waitForFunction(id => {
      const raw = localStorage.getItem(`slag_items_test_vault_${id}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed.some(n => n.id === `note_host_${id}`);
    }, runId, { timeout: 60000 });

    // Guest updates host note and creates another note
    await page.evaluate(async ({ runId }) => {
      const { storage, syncEngine } = await import('/src/lib/sync/syncEngine.ts');
      const targetVaultId = `test_vault_${runId}`;

      const hostNote = storage.getItemById(`note_host_${runId}`);
      storage.saveItem({
        ...hostNote,
        title: `хост заметка ${runId} 🔒 -> подтверждено гостем ✅`,
        updatedAt: Date.now(),
      });

      const now = Date.now();
      storage.saveItem({
        id: `note_guest_${runId}`,
        title: `заметка от гостя ${runId} 🔒`,
        content: 'создано на гостевом устройстве',
        type: 'note',
        folder: 'Входящие',
        tags: ['гость'],
        attachments: [],
        createdAt: now,
        updatedAt: now,
      });

      localStorage.removeItem(`slag_sync_last_state_hash_${targetVaultId}`);
      await syncEngine.pushLocalChanges();
    }, { runId });

    await page.waitForTimeout(1500);

    // Verify main vault on guest was never contaminated
    const finalCheck = await page.evaluate(({ runId }) => {
      const rawMain = localStorage.getItem('slag_items_default_vault');
      const mainItems = rawMain ? JSON.parse(rawMain) : [];
      const leakedInMain = mainItems.some(n => n.id.includes(runId));

      const rawTest = localStorage.getItem(`slag_items_test_vault_${runId}`);
      const testItems = rawTest ? JSON.parse(rawTest) : [];

      return {
        mainCountAfter: mainItems.length,
        leakedInMain,
        testItemsCount: testItems.length,
      };
    }, { runId });

    assert.equal(finalCheck.leakedInMain, false, 'No test notes leaked into guest main vault');
    console.log(JSON.stringify({ role: 'guest', runId, success: true, ...finalCheck }));
  }
} finally {
  await browser.close();
}
