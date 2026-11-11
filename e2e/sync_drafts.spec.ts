import { test, expect } from './support/selfhostFixture';

test('composer draft emits draft op to outbox and packs into bundle', async ({ page }) => {
  await page.goto('/');
  // The first spec of a run pays the cold Vite transform; wait for the shell, not a 5s default.
  await expect(page.locator('main').first()).toBeVisible({ timeout: 120000 });
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();

  const result = await page.evaluate(async () => {
    const { SyncEngine, storage, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const cryptoMod = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');

    const originals = {
      getToken: accountClient.getToken,
      getSession: accountClient.getSession,
      refresh: accountClient.refresh,
      getState: accountClient.getState,
      subscribe: accountClient.subscribe,
    };
    accountClient.getToken = () => null;
    accountClient.getSession = () => ({ deviceId: 'test-draft-device' });
    accountClient.refresh = async () => {};
    accountClient.getState = () => ({ devices: [], vaults: [] });
    accountClient.subscribe = () => () => {};

    const engine = new SyncEngine();
    engine.refreshServerAuth = async () => true;
    engine.connectWebSocket = () => {};
    engine.startIntervals = () => {};

    const push = engine.pushLocalChanges.bind(engine);
    engine.pushLocalChanges = async () => {};
    const realFetch = window.fetch;

    try {
      engine.saveConfig({ enabled: true, seedPhrase: 'draft test seed phrase', deviceId: 'test-draft-device' });
      await engine.init();

      // Clear any leftover outbox
      engine.getOutbox().clear();

      // Save composer draft
      storage.saveComposerDraft('Входящие', {
        content: 'Срочный черновик для проверки синка',
        itemType: 'note',
        priority: 'high',
        dueDate: '',
        tags: ['черновик'],
        attachments: [],
        replyTarget: null,
        updatedAt: Date.now(),
      });

      const pendingOps = engine.getOutbox().pending();
      const hasDraftOp = pendingOps.some((op) => op.kind === 'draft' && op.id === 'composer:Входящие');

      const key = await cryptoMod.deriveVaultKey('draft test seed phrase');
      let captured: { changes?: Array<{ id: string; type: string; action: string; payload?: unknown }> } = {};

      window.fetch = async (_url, opts: any) => {
        if (!opts || opts.method !== 'POST') return Response.json({ bundles: [] });
        const encrypted = JSON.parse(opts.body);
        captured = await cryptoMod.decryptBundle(encrypted, key);
        return new Response('{}', { status: 200 });
      };

      await push();

      const draftChange = (captured.changes || []).find((c) => c.type === 'draft' && c.id === 'composer:Входящие');

      return {
        hasDraftOp,
        hasDraftInBundle: Boolean(draftChange),
        draftContent: (draftChange?.payload as any)?.content,
      };
    } finally {
      window.fetch = realFetch;
      engine.disconnect();
      Object.assign(accountClient, originals);
    }
  });

  expect(result.hasDraftOp).toBe(true);
  expect(result.hasDraftInBundle).toBe(true);
  expect(result.draftContent).toBe('Срочный черновик для проверки синка');
});

test('incoming draft bundle updates local draft storage cleanly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();

  const result = await page.evaluate(async () => {
    const { SyncEngine, storage, accountClient } = await import(/* @vite-ignore */ '/src/lib/sync/syncEngine.ts');
    const cryptoMod = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');

    const originals = {
      getToken: accountClient.getToken,
      getSession: accountClient.getSession,
      refresh: accountClient.refresh,
      getState: accountClient.getState,
      subscribe: accountClient.subscribe,
    };
    accountClient.getToken = () => null;
    accountClient.getSession = () => ({ deviceId: 'test-receiver-device' });
    accountClient.refresh = async () => {};
    accountClient.getState = () => ({ devices: [], vaults: [] });
    accountClient.subscribe = () => () => {};

    const engine = new SyncEngine();
    engine.refreshServerAuth = async () => true;
    engine.connectWebSocket = () => {};
    engine.startIntervals = () => {};
    engine.pushLocalChanges = async () => {};

    try {
      engine.saveConfig({ enabled: true, seedPhrase: 'draft receive seed phrase', deviceId: 'test-receiver-device' });
      await engine.init();

      const key = await cryptoMod.deriveVaultKey('draft receive seed phrase');
      const roomId = engine.status.currentRoomId || 'room_test';

      // Remote device sends composer draft and fullscreen draft
      const bundle = {
        bundleId: 'bnd_remote_draft_1',
        roomId,
        fromDeviceId: 'remote-laptop',
        sequence: 1,
        stateRootHash: 'hash_draft',
        timestamp: new Date().toISOString(),
        changes: [
          {
            id: 'composer:Проекты',
            type: 'draft' as const,
            action: 'upsert' as const,
            version: 1,
            hash: '12345',
            payload: {
              content: 'Мысль с ноутбука в папку Проекты',
              itemType: 'note',
              priority: 'none',
              dueDate: '',
              tags: ['remote'],
              attachments: [],
              replyTarget: null,
              updatedAt: Date.now(),
            },
          },
          {
            id: 'fullscreen:item_remote_edit',
            type: 'draft' as const,
            action: 'upsert' as const,
            version: 1,
            hash: '67890',
            payload: {
              itemId: 'item_remote_edit',
              title: 'Черновик правки статьи',
              content: 'Неоконченный текст с ноутбука',
              tags: ['edit'],
              folder: 'Входящие',
              type: 'article',
              updatedAt: Date.now(),
            },
          },
        ],
      };

      const encrypted = await cryptoMod.encryptBundle(bundle, key);
      await (engine as any).applyIncomingBundle(encrypted);

      const composerDraft = storage.getComposerDraft('Проекты');
      const fullscreenDraft = storage.getFullscreenDraft('item_remote_edit');

      return {
        composerContent: composerDraft?.content,
        fullscreenTitle: fullscreenDraft?.title,
        fullscreenContent: fullscreenDraft?.content,
      };
    } finally {
      engine.disconnect();
      Object.assign(accountClient, originals);
    }
  });

  expect(result.composerContent).toBe('Мысль с ноутбука в папку Проекты');
  expect(result.fullscreenTitle).toBe('Черновик правки статьи');
  expect(result.fullscreenContent).toBe('Неоконченный текст с ноутбука');
});

test('fullscreen editor live autosave saves existing note with indicator', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();

  // Find the first item card in the feed
  const card = page.locator('[id^="item-"]').first();
  await card.waitFor({ timeout: 10000 });
  await card.hover();

  const focusEditorBtn = card.locator('button[aria-label="Открыть в фокус-редакторе"]');
  await focusEditorBtn.click();

  // Fullscreen editor root must be visible
  await expect(page.locator('#fullscreen-editor-root')).toBeVisible();

  // Title input
  const titleInput = page.locator('textarea[placeholder*="Название таски"], textarea[placeholder*="Заголовок"]').first();
  await expect(titleInput).toBeVisible();

  // Append text to trigger change
  await titleInput.press('End');
  await page.keyboard.type(' [автосейв]');

  // Wait for 800ms debounce
  await page.waitForTimeout(1100);

  // Status indicator 'сохранено' should appear
  await expect(page.getByText('сохранено')).toBeVisible();

  // Screenshot verification per DoD
  await page.screenshot({ path: 'test-results/screenshots/sync_drafts_autosave.png' });
});
