import { test, expect } from '@playwright/test';

const SEED = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
const TOKEN = 'legacy-session-token-should-never-stay-in-localstorage';
const DEVICE_ID = 'legacy-device';
const PRIVATE_KEY_D = 'legacy-private-key-material';

function legacyConfig() {
  return {
    enabled: false,
    autoSync: false,
    serverUrl: 'http://127.0.0.1:1',
    deviceId: DEVICE_ID,
    deviceName: 'Legacy device',
    seedPhrase: SEED,
    trustedDevices: [],
    bgSyncIntervalMinutes: 0,
    localSyncMode: 'read-write',
  };
}

test.describe('secrets at rest', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ token, deviceId, privateKeyD, config }) => {
      if (localStorage.getItem('secrets-at-rest-seeded')) return;
      const vault = { id: 'default_vault', name: 'main', mode: 'indexeddb', isCurrent: true };
      localStorage.setItem('slag_vaults_v2', JSON.stringify([vault]));
      localStorage.setItem('slag_current_vault_v2', JSON.stringify(vault));
      localStorage.setItem('slag_items_default_vault', '[]');
      localStorage.setItem('slag_sync_config_v2_default_vault', JSON.stringify(config));
      localStorage.setItem('slag_sync_config_v2', JSON.stringify(config));
      localStorage.setItem('slag_account_session_v1', JSON.stringify({
        token,
        accountId: 'acc_legacy',
        deviceId,
        serverUrl: 'http://127.0.0.1:1',
      }));
      localStorage.setItem(`slag_account_device_v1:${deviceId}`, JSON.stringify({
        deviceId,
        name: 'Legacy device',
        platform: 'desktop',
        publicKey: { kty: 'EC', crv: 'P-256', x: 'legacy-x', y: 'legacy-y' },
        privateKey: { kty: 'EC', crv: 'P-256', d: privateKeyD },
      }));
      localStorage.setItem('secrets-at-rest-seeded', '1');
    }, { token: TOKEN, deviceId: DEVICE_ID, privateKeyD: PRIVATE_KEY_D, config: legacyConfig() });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 120_000 });
  });

  // The profile used to be scraped for plaintext session, device key and seed, and everything found
  // was moved into the AES store. That migration is gone: a key that is not in the store is not a
  // key, and sync asks for the seed phrase instead of inventing an identity from the leftovers.
  test('does not adopt the plaintext secrets left in the webview profile', async ({ page }) => {
    const state = await page.evaluate(async () => {
      const { accountClient } = await import('/src/lib/sync/account.ts');
      const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
      const scopes = Object.keys(localStorage).filter((key) => key.startsWith('slag_secure_v1:'));
      return {
        session: accountClient.getSession(),
        isAuthenticated: accountClient.isAuthenticated(),
        scopeKeys: scopes,
        seed: syncEngine.getConfig().seedPhrase,
      };
    });

    expect(state.session).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.scopeKeys).not.toContain('slag_secure_v1:account-session');
    expect(state.scopeKeys).not.toContain(`slag_secure_v1:device-key:${DEVICE_ID}`);
    expect(state.seed).not.toBe(SEED);
  });

  test('a seed written through the app goes to the store, never into the config JSON', async ({ page }) => {
    const nextSeed = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    const result = await page.evaluate(async (seed) => {
      const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
      await syncEngine.setVaultSeedPhrase('default_vault', seed);
      return {
        config: localStorage.getItem('slag_sync_config_v2_default_vault'),
        secure: Object.entries(localStorage)
          .filter(([key]) => key.startsWith('slag_secure_v1:'))
          .map(([, value]) => value),
        seed: syncEngine.getConfig().seedPhrase,
      };
    }, nextSeed);

    expect(result.seed).toBe(nextSeed);
    expect(result.config).not.toContain(nextSeed);
    expect(result.config).not.toContain('seedPhrase');
    expect(result.secure.join('\n')).not.toContain(nextSeed);
  });

  test('keeps the seed in the store across reloads', async ({ page }) => {
    const seed = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
    await page.evaluate(async (value) => {
      const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
      await syncEngine.setVaultSeedPhrase('default_vault', value);
    }, seed);
    const before = await page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith('slag_secure_v1:')).sort());

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('main').first()).toBeVisible({ timeout: 120_000 });

    const after = await page.evaluate(async () => {
      const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
      return {
        keys: Object.keys(localStorage).filter((key) => key.startsWith('slag_secure_v1:')).sort(),
        seed: syncEngine.getConfig().seedPhrase,
        storedConfig: localStorage.getItem('slag_sync_config_v2_default_vault'),
      };
    });

    expect(after.keys).toEqual(before);
    expect(after.keys).toContain('slag_secure_v1:vault-seed:default_vault');
    expect(after.seed).toBe(seed);
    expect(after.storedConfig).not.toContain(seed);
  });
});
