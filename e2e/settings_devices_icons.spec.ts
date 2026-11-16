import { test, expect, serverUrl } from './support/selfhostFixture';
import { deviceKind } from '../src/lib/sync/deviceKind';

// The relay keeps `platform` free-form: this client reports the coarse three, another build may
// name a form factor outright. A row still has to wear one mark, and it must not be the same
// laptop for a phone, a PC, a tablet and a browser.
const DEVICES = [
  { id: 'icons-phone', name: 'телефон', platform: 'mobile', lastSeenAt: 'Только что' },
  { id: 'icons-laptop', name: 'ноутбук', platform: 'laptop', lastSeenAt: 'Только что' },
  { id: 'icons-pc', name: 'пк', platform: 'desktop', lastSeenAt: '2025-11-16T10:00:00.000Z' },
  { id: 'icons-tablet', name: 'планшет', platform: 'tablet', lastSeenAt: '' },
  { id: 'icons-web', name: 'браузер', platform: 'web', lastSeenAt: '' },
  { id: 'icons-unknown', name: 'неизвестное устройство', platform: 'plan9', lastSeenAt: '' },
];

test('platform values classify into one of six kinds, with a default', () => {
  expect(deviceKind('mobile')).toBe('phone');
  expect(deviceKind('Phone')).toBe('phone');
  expect(deviceKind('ipad')).toBe('tablet');
  expect(deviceKind('notebook')).toBe('laptop');
  expect(deviceKind('desktop')).toBe('desktop');
  expect(deviceKind('browser')).toBe('web');
  expect(deviceKind('  WEB ')).toBe('web');
  expect(deviceKind('plan9')).toBe('unknown');
  expect(deviceKind(null)).toBe('unknown');
  expect(deviceKind(undefined)).toBe('unknown');
});

test('device rows wear a glyph per form factor and the header pairs a new one', async ({ page }) => {
  await page.addInitScript((config) => {
    localStorage.setItem('slag_sync_config_v2', JSON.stringify(config));
    localStorage.setItem('slag_sync_config_v2_default_vault', JSON.stringify(config));
  }, {
    enabled: false,
    serverUrl,
    deviceId: 'icons-current',
    deviceName: 'мой компьютер',
    seedPhrase: 'abandon ability able about above absent absorb abstract absurd abuse access accident',
    autoSync: false,
    trustedDevices: DEVICES.map((device) => ({
      ...device,
      isCurrent: false,
      syncMode: 'read-write',
      canRunAiLease: false,
      pairedAt: '',
      allowedVaults: [],
    })),
  });
  await page.route('**/api/pair/create', (route) => route.fulfill({
    json: { pin: '123-456', sessionId: 'icons-test', expiresIn: 300, hostDeviceId: 'host', hostPublicKey: 'key', qrPayload: 'slag://pair?pin=123-456' },
  }));

  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('sidebar-settings-btn').click();
  const settings = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Настройки', exact: true }) });
  await expect(settings).toBeVisible();
  await settings.getByTestId('settings-tab-devices').click();
  await settings.locator('.motion-settings-tab').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });

  const expected: Record<string, string> = {
    'icons-phone': 'entity.phone',
    'icons-laptop': 'entity.desktop',
    'icons-pc': 'entity.computer',
    'icons-tablet': 'entity.tablet',
    'icons-web': 'entity.browser',
    'icons-unknown': 'entity.deviceUnknown',
  };
  for (const [id, icon] of Object.entries(expected)) {
    await expect(settings.getByTestId(`device-row-${id}`).locator('[data-icon]')).toHaveAttribute('data-icon', icon);
  }
  const rendered = await settings.locator('[data-icon]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-icon')));
  expect(new Set(rendered).size).toBe(6);

  await page.screenshot({ path: 'test-results/screenshots/devices-icons.png' });

  // The gear is the affordance for the vault-access surface; it must open over the viewport,
  // not be cropped to the settings card it used to live inside.
  await settings.getByRole('button', { name: 'Доступ телефон к хранилищам' }).click();
  const access = page.getByRole('dialog', { name: 'Доступ к хранилищам' });
  await expect(access).toBeVisible();
  const viewport = page.viewportSize();
  const box = await access.boundingBox();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);
  await access.getByRole('button', { name: 'Закрыть доступ' }).click();
  await expect(access).toBeHidden();

  // The plus in the section header starts the same pairing flow; the bottom button stays put.
  const headerPair = settings.getByTestId('btn-pair-device-header');
  await expect(headerPair).toHaveAccessibleName('Привязать устройство');
  await headerPair.click();
  const pairModal = page.getByTestId('pair-device-modal');
  await expect(pairModal).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть привязку' }).click();
  await expect(pairModal).toBeHidden();
  await expect(settings.getByTestId('btn-open-pair-modal')).toHaveText('Привязать устройство');
});
