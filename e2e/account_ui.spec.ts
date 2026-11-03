import type { BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { test, expect } from './support/accountHarness';

test.use({ fullAccountApp: true });

async function seedIsolatedBrowser(context: BrowserContext, relayUrl: string, vaultId: string, deviceId: string, deviceName: string) {
  await context.addInitScript(({ relayUrl, vaultId, deviceId, deviceName }) => {
    if (localStorage.getItem('account-ui-initialized')) return;
    const vault = { id: vaultId, name: 'Account integration vault', mode: 'indexeddb', isCurrent: true };
    const config = {
      enabled: true, autoSync: false, serverUrl: relayUrl, deviceId, deviceName,
      seedPhrase: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
      trustedDevices: [], bgSyncIntervalMinutes: 0, localSyncMode: 'read-write',
    };
    localStorage.setItem('slag_vaults_v2', JSON.stringify([vault]));
    localStorage.setItem('slag_current_vault_v2', JSON.stringify(vault));
    localStorage.setItem(`slag_items_${vaultId}`, '[]');
    localStorage.setItem(`slag_sync_config_v2_${vaultId}`, JSON.stringify(config));
    localStorage.setItem('slag_sync_config_v2', JSON.stringify(config));
    localStorage.setItem('account-ui-initialized', 'true');
  }, { relayUrl, vaultId, deviceId, deviceName });
}

async function openCabinet(page: Page, origin: string, relayUrl: string) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if ([origin, relayUrl].includes(url.origin)) return route.continue();
    return route.abort('blockedbyclient');
  });
  await page.goto(`${origin}/?page=account`);
  await expect(page.getByRole('heading', { name: 'SLAG ID' })).toBeVisible({ timeout: 90_000 });
}

test('account cabinet registration, approval, sharing and same-name vault sidebar', async ({ browser, accountHarness }) => {
  test.setTimeout(240_000);
  const origin = new URL(accountHarness.appUrl).origin;
  const { relayUrl } = accountHarness;
  const hostVaultId = randomUUID();
  const guestVaultId = randomUUID();
  const hostDeviceId = randomUUID();
  const guestDeviceId = randomUUID();
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const failures: string[] = [];
  host.on('pageerror', (error) => failures.push(error.message));
  guest.on('pageerror', (error) => failures.push(error.message));
  try {
    await seedIsolatedBrowser(hostContext, relayUrl, hostVaultId, hostDeviceId, 'Account host browser');
    await seedIsolatedBrowser(guestContext, relayUrl, guestVaultId, guestDeviceId, 'Account guest browser');
    await openCabinet(host, origin, relayUrl);
    await host.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    const seed = await host.getByTestId('account-generated-seed').locator(':scope > span').evaluateAll(
      (entries) => entries.map((entry) => entry.childNodes[1].textContent).join(' '),
    );
    expect(seed.split(' ')).toHaveLength(12);
    const create = host.getByRole('button', { name: 'Создать аккаунт', exact: true }).last();
    await expect(create).toBeDisabled();
    await host.getByRole('checkbox', { name: /Я сохранил seed/ }).check();
    await create.click();
    await expect(host.getByRole('heading', { name: 'Подписка', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(host.getByTestId('account-generated-seed')).toHaveCount(0);
    await host.screenshot({ path: 'test-results/screenshots/account-registered.png', fullPage: true });

    await openCabinet(guest, origin, relayUrl);
    await guest.getByTestId('account-seed-input').fill(seed);
    await guest.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(guest.getByRole('status')).toContainText('Запрос отправлен', { timeout: 30_000 });
    await host.getByRole('button', { name: 'Обновить', exact: true }).click();
    await expect(host.getByText('ожидает подтверждения', { exact: false })).toBeVisible();
    await host.screenshot({ path: 'test-results/screenshots/account-device-pending.png', fullPage: true });
    await host.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await expect(host.getByRole('status')).toContainText('Устройство подтверждено');
    await guest.getByRole('button', { name: 'Повторить вход после подтверждения' }).click();
    await expect(guest.getByRole('heading', { name: 'Подписка', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(guest.getByTestId('account-seed-input')).toHaveCount(0);

    await host.getByLabel('Устройство', { exact: true }).selectOption(guestDeviceId);
    await host.getByRole('checkbox', { name: 'Только чтение', exact: true }).check();
    await host.getByRole('button', { name: 'Предоставить доступ', exact: true }).click();
    await expect(host.getByRole('status')).toContainText('Приглашение отправлено', { timeout: 30_000 });
    await guest.getByRole('button', { name: 'Обновить', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Приглашения', exact: true })).toBeVisible();
    await guest.screenshot({ path: 'test-results/screenshots/account-vault-invitation.png', fullPage: true });
    await guest.getByRole('button', { name: 'Подключить', exact: true }).click();
    await expect(guest.getByRole('status')).toContainText('Хранилище подключено', { timeout: 30_000 });
    await expect(guest.getByRole('heading', { name: 'Приглашения', exact: true })).toHaveCount(0);
    const vaults = await guest.evaluate(() => JSON.parse(localStorage.getItem('slag_vaults_v2')!));
    expect(vaults).toHaveLength(2);
    expect(vaults.map((vault: { name: string }) => vault.name)).toEqual(['Account integration vault', 'Account integration vault']);
    await expect(guest.getByText(/Account integration vault · /)).toHaveCount(2);
    await guest.screenshot({ path: 'test-results/screenshots/account-vault-connected.png', fullPage: true });
    await guest.getByRole('button', { name: 'Открыть приложение', exact: true }).click();
    const currentVault = await guest.evaluate(() => JSON.parse(localStorage.getItem('slag_current_vault_v2')!));
    const suffix = currentVault.id.replace(/^vault_/, '').replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase();
    await guest.getByRole('button', { name: `Account integration vault · ${suffix}`, exact: true }).click();
    await expect(guest.getByText('Хранилища (Vaults)', { exact: true })).toBeVisible();
    await expect(guest.getByRole('button', { name: /Account integration vault · / })).toHaveCount(3);
    await guest.screenshot({ path: 'test-results/screenshots/account-sidebar-vaults.png', fullPage: true });
    expect(failures).toEqual([]);
    expect(vaults.every((vault: { id: string }) => vault.id !== 'default_vault')).toBe(true);
    expect(await guest.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith('slag_items_'))
      .every((key) => JSON.parse(localStorage.getItem(key)!).length === 0))).toBe(true);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('hosted sync is locked without an account while local empty vault remains usable', async ({ browser, accountHarness }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const origin = new URL(accountHarness.appUrl).origin;
    await seedIsolatedBrowser(context, accountHarness.relayUrl, randomUUID(), randomUUID(), 'Locked account browser');
    await openCabinet(page, origin, accountHarness.relayUrl);
    await page.getByRole('button', { name: 'Открыть приложение', exact: true }).click();
    await page.getByTestId('sidebar-settings-btn').click();
    await page.getByTestId('settings-tab-sync').click();
    await expect(page.getByRole('heading', { name: 'Для синхронизации нужен SLAG ID' })).toBeVisible();
    await expect(page.getByTestId('btn-open-pair-modal')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Сменить ключ', exact: true })).toBeDisabled();
    await expect(page.getByTestId('sync-open-account')).toBeEnabled();
    await page.screenshot({ path: 'test-results/screenshots/account-hosted-locked.png', fullPage: true });
    await page.getByTestId('sync-open-account').click();
    await expect(page.getByTestId('account-seed-input')).toBeVisible();
  } finally {
    await context.close();
  }
});
