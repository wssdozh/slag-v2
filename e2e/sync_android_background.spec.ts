import { devices, type Page } from '@playwright/test';
import { test, expect, serverUrl } from './support/selfhostFixture';

const { defaultBrowserType: _browser, ...android } = devices['Pixel 7'];
test.use({ ...android, reducedMotion: 'reduce' });

async function openMobileSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Назад к папкам' }).click({ timeout: 120_000 });
  await page.getByRole('navigation', { name: 'Мобильная навигация' }).getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByTestId('mobile-settings-root')).toBeVisible();
}

const backgroundSwitch = (page: Page) => page.getByRole('switch', { name: 'Фоновая синхронизация', exact: true });

async function mockNativePlatform(page: Page): Promise<void> {
  // Keep web boot and isolated browser preferences; only Android/Tauri platform detection is mocked.
  await page.evaluate(() => { Object.assign(window, { isTauri: true }); });
}

test('Android browser does not show the native background sync switch', async ({ page }) => {
  await page.goto('/');
  await openMobileSettings(page);
  await page.getByTestId('mobile-settings-sync').click();
  await expect(page.getByTestId('sync-refresh-btn')).toBeVisible();
  await expect(backgroundSwitch(page)).toHaveCount(0);
});

test('Android app background sync defaults to on and remembers the switch across reload', async ({ page }) => {
  await page.goto('/');
  await openMobileSettings(page);
  await mockNativePlatform(page);
  await page.getByTestId('mobile-settings-sync').click();
  const toggle = backgroundSwitch(page);
  await expect(toggle).toBeChecked();
  await expect(toggle).toHaveAccessibleDescription(/Doze.*принудительной.*батареи.*автозапуск/);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.screenshot({ path: 'test-results/screenshots/android-background-sync.png', animations: 'disabled' });

  await page.reload();
  await openMobileSettings(page);
  await mockNativePlatform(page);
  await page.getByTestId('mobile-settings-sync').click();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
});

test('Android background preference notifies only on changes and unsubscribes', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/lib/sync/androidBackgroundPreference.ts';
    const { getAndroidBackgroundSyncEnabled, setAndroidBackgroundSyncEnabled, subscribeAndroidBackgroundSyncPreference } = await import(/* @vite-ignore */ path);
    const notifications: boolean[] = [];
    const initial = getAndroidBackgroundSyncEnabled();
    const unsubscribe = subscribeAndroidBackgroundSyncPreference((enabled: boolean) => notifications.push(enabled));
    setAndroidBackgroundSyncEnabled(true);
    setAndroidBackgroundSyncEnabled(false);
    setAndroidBackgroundSyncEnabled(false);
    const disabled = getAndroidBackgroundSyncEnabled();
    setAndroidBackgroundSyncEnabled(true);
    unsubscribe();
    setAndroidBackgroundSyncEnabled(false);
    return { initial, disabled, notifications, afterUnsubscribe: getAndroidBackgroundSyncEnabled() };
  });
  expect(result).toEqual({ initial: true, disabled: false, notifications: [false, true], afterUnsubscribe: false });
});

test('Android pauses automatic relay traffic when disabled in background and catches up once on return', async ({ page }) => {
  let connections = 0;
  let socketFrames = 0;
  let roomRequests = 0;
  let pulls = 0;
  await page.routeWebSocket(/127\.0\.0\.1:18321\/ws\//, (socket) => {
    connections++;
    socket.onMessage(() => { socketFrames++; });
    socket.send(JSON.stringify({ type: 'welcome', connectedDevices: 1 }));
  });
  await page.route(`${serverUrl}/api/rooms/**`, (route) => {
    roomRequests++;
    if (new URL(route.request().url()).pathname.endsWith('/bundles')) pulls++;
    return route.fulfill({ json: { bundles: [] } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Назад к папкам' })).toBeVisible({ timeout: 120_000 });
  await page.clock.install();
  const session = await page.evaluate(async () => {
    const { SyncEngine, storage, syncEngine } = await import('/src/lib/sync/syncEngine.ts');
    const { writeManifestAutoCheck } = await import('/src/lib/sync/manifest/prefs.ts');
    const { setAndroidBackgroundSyncEnabled } = await import('/src/lib/sync/androidBackgroundPreference.ts');
    syncEngine.disconnect();
    writeManifestAutoCheck(false);
    const engine = new SyncEngine();
    engine.saveConfig({ enabled: true, autoSync: true, localSyncMode: 'receive-only' });
    // Stub only native disk access. Leave session init, visibility listeners, timers and transport intact.
    storage.getCurrentVaultRecovery = async () => ({ kind: 'ready', fresh: true });
    storage.files.getVaultDir = () => '';
    storage.files.finishSyncMigration = async () => {};
    storage.readNoteRegistry = async () => undefined;
    Object.assign(window, { isTauri: true });
    await engine.init();
    const key = engine.activeVaultKey;
    Object.assign(window, {
      androidSyncProbe: {
        snapshot: () => ({ room: engine.activeRoomId, generation: engine.initGeneration, hasSameKey: key !== null && key === engine.activeVaultKey }),
        setPreference: setAndroidBackgroundSyncEnabled,
        armRetry: () => engine.scheduleRetry(),
      },
    });
    return { room: engine.activeRoomId, generation: engine.initGeneration, hasSameKey: key !== null };
  });
  expect(session.room).toMatch(/^room_/);
  expect(session.hasSameKey).toBe(true);
  await expect.poll(() => connections).toBe(1);
  await expect.poll(() => pulls).toBeGreaterThan(0);

  const setVisibility = (hidden: boolean) => page.evaluate((value) => {
    Object.defineProperties(document, { hidden: { configurable: true, value }, visibilityState: { configurable: true, value: value ? 'hidden' : 'visible' } });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  type ProbeWindow = Window & { androidSyncProbe: { snapshot: () => typeof session; setPreference: (enabled: boolean) => void; armRetry: () => void } };
  const outgoing = () => ({ connections, socketFrames, roomRequests });

  // Default-on is a positive control: the live background socket still produces a heartbeat.
  await setVisibility(true);
  await page.clock.runFor(26_000);
  await expect.poll(() => socketFrames).toBeGreaterThan(0);

  // Turn it off in the background with a retry already armed; none of the automatic work may escape.
  const beforePause = outgoing();
  await page.evaluate(() => {
    const probe = (window as ProbeWindow).androidSyncProbe;
    probe.armRetry();
    probe.setPreference(false);
  });
  await page.clock.runFor(60_000);
  expect(outgoing()).toEqual(beforePause);
  expect(await page.evaluate(() => (window as ProbeWindow).androidSyncProbe.snapshot())).toEqual(session);

  const beforeResume = pulls;
  await setVisibility(false);
  await setVisibility(false);
  await expect.poll(() => pulls).toBe(beforeResume + 1);
  await page.clock.runFor(1_000);
  expect(pulls).toBe(beforeResume + 1);
  expect(await page.evaluate(() => (window as ProbeWindow).androidSyncProbe.snapshot())).toEqual(session);
});
