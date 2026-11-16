import { test, expect } from './support/selfhostFixture';

test.setTimeout(180_000);

// Профиль (имя и аватар) лежит в workspace state и едет в workspace-канале бандла. На приёмнике
// он не применялся вовсе: движок складывал staged workspace в буфер под именем `workspace`, а
// `importSyncedVaultData` читал `workspaceState`. Поле просто не доезжало до хранилища.
test('the profile rides the workspace channel and lands on the other device', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 120_000 });

  const result = await page.evaluate(async () => {
    const { SyncEngine, storage, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const { decryptBundle } = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');
    const { persistIncomingBundle } = await import(/* @vite-ignore */ '/src/lib/sync/applyBundle.ts');
    const originals = {
      getToken: accountClient.getToken, getSession: accountClient.getSession,
      refresh: accountClient.refresh, getState: accountClient.getState, subscribe: accountClient.subscribe,
    };
    Object.assign(accountClient, {
      getToken: () => null,
      getSession: () => ({ deviceId: 'profile-sender' }),
      refresh: async () => {},
      getState: () => ({ devices: [], vaults: [] }),
      subscribe: () => () => {},
    });
    const sender = new SyncEngine();
    sender.refreshServerAuth = async () => true;
    sender.connectWebSocket = () => {};
    sender.startIntervals = () => {};
    sender.fetchPendingBundlesHttp = async () => {};
    const posted: unknown[] = [];
    const realFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (opts && opts.method === 'POST') {
        posted.push(JSON.parse(String(opts.body)));
        return new Response('{}', { status: 200 });
      }
      return Response.json({ bundles: [] });
    };
    const profile = { name: 'Мори', avatar: 'data:image/jpeg;base64,PROFILE' };
    try {
      sender.saveConfig({ enabled: true, seedPhrase: 'profile seed phrase', deviceId: 'profile-sender' });
      await sender.init();
      storage.saveWorkspaceState({ profile });
      await new Promise((resolve) => setTimeout(resolve, 600));
      await sender.pushLocalChanges();
      await new Promise((resolve) => setTimeout(resolve, 300));

      const bundle = await decryptBundle(posted[posted.length - 1] as never, sender.activeVaultKey!);
      const workspaceChange = bundle.changes.find((change) => change.type === 'workspace');

      // A second engine stands in for the phone that has just paired.
      const receiver = new SyncEngine();
      receiver.refreshServerAuth = async () => true;
      receiver.connectWebSocket = () => {};
      receiver.startIntervals = () => {};
      receiver.fetchPendingBundlesHttp = async () => {};
      receiver.pushLocalChanges = async () => {};
      receiver.saveConfig({ enabled: true, seedPhrase: 'profile seed phrase', deviceId: 'profile-receiver' });
      await receiver.init();
      storage.saveWorkspaceState({ profile: { name: '' } });
      await persistIncomingBundle(receiver, posted[posted.length - 1]);
      await new Promise((resolve) => setTimeout(resolve, 700));
      const landed = storage.getWorkspaceState().profile ?? null;
      receiver.disconnect();

      return {
        sent: workspaceChange?.payload?.profile ?? null,
        landed,
        expected: profile,
      };
    } finally {
      window.fetch = realFetch;
      sender.disconnect();
      Object.assign(accountClient, originals);
    }
  });

  expect(result.sent).toEqual(result.expected);
  expect(result.landed).toEqual(result.expected);
});

// Блок профиля в настройках читал хранилище один раз при монтировании, поэтому имя, приехавшее
// с другого устройства при открытых настройках, не появлялось до их переоткрытия.
test('the settings block picks up a profile that arrived after it mounted', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.locator('nav[aria-label="Мобильная навигация"] button[aria-label="Настройки"]').click();
  await expect(page.getByTestId('mobile-settings-root')).toBeVisible({ timeout: 120_000 });

  const nameInput = page.getByLabel('Имя профиля');
  await expect(nameInput).toHaveValue('');

  await page.evaluate(async () => {
    const { storage } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    // What the sync flush does: the state is already in storage, the event is what redraws.
    storage.saveWorkspaceState({ profile: { name: 'Мори' } });
    window.dispatchEvent(new CustomEvent('slag-sync-updated', {
      detail: { hasItemsChanged: false, hasFoldersChanged: false, hasWorkspaceChanged: true, hasDraftsChanged: false },
    }));
  });

  await expect(nameInput).toHaveValue('Мори');
  // Without a photo the block draws the initials of the name it just received.
  await expect(page.locator('span[class*="rounded-full"]').first()).toHaveText('М');
  await page.screenshot({ path: 'test-results/screenshots/settings-profile-synced-375.png' });
});
