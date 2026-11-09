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
    await expect(host.getByText('Аккаунт', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(host.getByTestId('account-generated-seed')).toHaveCount(0);
    await host.screenshot({ path: 'test-results/screenshots/account-registered.png', fullPage: true });

    await openCabinet(guest, origin, relayUrl);
    await guest.getByTestId('account-seed-input').fill(seed);
    await guest.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(guest.getByRole('status')).toContainText('Запрос отправлен', { timeout: 30_000 });
    await host.getByRole('button', { name: 'Обновить', exact: true }).click();
    const pendingRow = host.getByTestId(`device-row-${guestDeviceId}`);
    await expect(pendingRow).toContainText('ожидает');
    await host.screenshot({ path: 'test-results/screenshots/account-device-pending.png', fullPage: true });
    await guest.screenshot({ path: 'test-results/screenshots/account-login-waiting.png', fullPage: true });
    await expect(guest.getByTestId('account-seed-input')).toHaveCount(0);
    await pendingRow.getByRole('button', { name: 'Разрешить', exact: true }).click();
    await expect(host.getByRole('status')).toContainText('Устройство разрешено');
    await expect(guest.getByText('Аккаунт', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(guest.getByTestId('account-seed-input')).toHaveCount(0);

    await expect(host.getByText('вы сейчас здесь', { exact: true })).toBeVisible();
    await host.getByTestId(`device-row-${guestDeviceId}`).getByRole('button', { name: 'Account guest browser', exact: true }).click();
    const renameInput = host.getByRole('textbox', { name: 'Название устройства, от 1 до 64 символов' });
    await renameInput.fill('Ноутбук для проверки');
    await renameInput.press('Enter');
    await expect(host.getByRole('status')).toContainText('Название устройства сохранено');
    await host.getByRole('button', { name: 'Выдать доступ', exact: true }).click();
    await host.getByRole('combobox', { name: 'Устройство для хранилища Account integration vault', exact: true }).selectOption(guestDeviceId);
    await host.getByLabel('Права', { exact: true }).selectOption('receive-only');
    await host.getByRole('button', { name: 'Отправить приглашение', exact: true }).click();
    await expect(host.getByRole('status')).toContainText('Приглашение отправлено', { timeout: 30_000 });
    await guest.getByRole('button', { name: 'Обновить', exact: true }).click();
    await expect(guest.getByText('Приглашения', { exact: true })).toBeVisible();
    await guest.screenshot({ path: 'test-results/screenshots/account-vault-invitation.png', fullPage: true });
    await guest.getByRole('button', { name: 'Подключить', exact: true }).click();
    await expect(guest.getByRole('status')).toContainText('Приглашение принято.', { timeout: 30_000 });
    await expect(guest.getByText('Приглашения', { exact: true })).toHaveCount(0);
    const vaults = await guest.evaluate(() => JSON.parse(localStorage.getItem('slag_vaults_v2')!));
    expect(vaults).toHaveLength(2);
    expect(vaults.map((vault: { name: string }) => vault.name)).toEqual(['Account integration vault', 'Account integration vault']);
    await expect(guest.getByText(/Account integration vault · /)).toHaveCount(2);
    await guest.screenshot({ path: 'test-results/screenshots/account-vault-connected.png', fullPage: true });

    // A revoked device stays in the single device list, so the owner can bring it back or drop it.
    host.on('dialog', (dialog) => void dialog.accept());
    const guestRow = host.getByTestId(`device-row-${guestDeviceId}`);
    await guestRow.getByRole('button', { name: 'Отозвать', exact: true }).click();
    await expect(guestRow).toContainText('отозвано');
    await expect(guestRow.getByRole('button', { name: 'Вернуть', exact: true })).toBeVisible();
    await host.screenshot({ path: 'test-results/screenshots/account-devices-revoked.png', fullPage: true });
    await guestRow.getByRole('button', { name: 'Вернуть', exact: true }).click();
    await expect(host.getByRole('status')).toContainText('Устройство снова активно');
    await expect(guestRow).toContainText('активно');
    await host.getByRole('button', { name: /^Вернуть доступ .*Account integration vault$/ }).click();
    await expect(host.getByRole('status')).toContainText('Доступ снова предложен');
    await host.screenshot({ path: 'test-results/screenshots/account-devices-restored.png', fullPage: true });

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
    await page.getByTestId('settings-tab-account').click();
    await expect(page.getByText('Требуется вход в аккаунт SLAG ID.')).toBeVisible();
    await expect(page.getByTestId('sync-open-account')).toBeEnabled();
    await page.screenshot({ path: 'test-results/screenshots/account-hosted-locked.png', fullPage: true });
    await page.getByTestId('sync-open-account').click();
    await expect(page.getByTestId('account-seed-input')).toBeVisible();
  } finally {
    await context.close();
  }
});
