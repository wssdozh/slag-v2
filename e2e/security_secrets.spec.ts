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

  test('migrates seed, session and device key out of plaintext localStorage', async ({ page }) => {
    const state = await page.evaluate(() => {
      const secure = Object.entries(localStorage).filter(([key]) => key.startsWith('slag_secure_v1:'));
      return {
        secureKeys: secure.map(([key]) => key),
        secureValues: secure.map(([, value]) => value),
        session: localStorage.getItem('slag_account_session_v1'),
        deviceKey: localStorage.getItem('slag_account_device_v1:legacy-device'),
        config: localStorage.getItem('slag_sync_config_v2_default_vault'),
      };
    });

    expect(state.session).toBeNull();
    expect(state.deviceKey).toBeNull();
    expect(state.config).not.toContain(SEED);
    expect(state.config).not.toContain('seedPhrase');
    expect(state.secureKeys).toEqual(expect.arrayContaining([
      'slag_secure_v1:vault-seed:default_vault',
      'slag_secure_v1:account-session',
      'slag_secure_v1:device-key:legacy-device',
    ]));

    const ciphertext = state.secureValues.join('\n');
    expect(ciphertext).not.toContain(SEED);
    expect(ciphertext).not.toContain(TOKEN);
    expect(ciphertext).not.toContain(PRIVATE_KEY_D);
  });

  test('is idempotent across reloads and keeps the seed available to sync', async ({ page }) => {
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
    expect(after.seed).toBe(SEED);
    expect(after.storedConfig).not.toContain(SEED);
  });

  test('new seed writes go to the secure store, never back into the config JSON', async ({ page }) => {
    const nextSeed = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
    const result = await page.evaluate(async (seed) => {
      const { syncEngine } = await import('/src/lib/sync/syncEngine.ts');
      await syncEngine.setVaultSeedPhrase('default_vault', seed);
      return {
        config: localStorage.getItem('slag_sync_config_v2_default_vault'),
        secure: Object.keys(localStorage).filter((key) => key.startsWith('slag_secure_v1:')),
        seed: syncEngine.getConfig().seedPhrase,
      };
    }, nextSeed);

    expect(result.seed).toBe(nextSeed);
    expect(result.config).not.toContain(nextSeed);
    expect(result.config).not.toContain('seedPhrase');
    expect(result.secure).toContain('slag_secure_v1:vault-seed:default_vault');
  });
});
