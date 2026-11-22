import { test, expect } from '../support/selfhostFixture';

test('the note dot follows a failed push and the relay receipt for the current version', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const text = 'Заметка с индикатором синхронизации';
  const composer = page.locator('main textarea').first();
  await expect(composer).toBeVisible({ timeout: 150_000 });
  await composer.fill(text);
  await composer.press('Enter');
  const card = page.locator('[data-flip-id]').filter({ hasText: text });
  const dot = card.locator('[data-sync-status]');
  await expect(dot).toHaveAttribute('data-sync-status', 'local');
  const id = await card.getAttribute('data-flip-id');
  await page.route('**/api/rooms/card-dot-test/bundle?*', (route) => route.fulfill({ status: 500 }));
  await page.evaluate(async (id) => {
    const { syncEngine, storage } = await import('/src/lib/sync/syncEngine.ts');
    const { computeHash } = await import('/src/lib/sync/crypto.ts');
    const { stripAttachmentData } = await import('/src/lib/storage/attachmentData.ts');
    await syncEngine.init(); // Finish real startup before replacing its config for the synthetic push.
    const item = storage.getItemById(id);
    if (!item) throw new Error('Card has no matching note');
    const key = `item:${id}`;
    const hash = await computeHash(JSON.stringify(stripAttachmentData([item])[0]));
    syncEngine.config.enabled = true;
    syncEngine.activeRoomId = 'card-dot-test';
    syncEngine.config.serverUrl = window.location.origin;
    syncEngine.scheduleRetry = () => {};
    const op = { opId: 'card-dot-op', kind: 'item', action: 'upsert', id, timestamp: item.updatedAt, payload: item };
    syncEngine.getOutbox().enqueue(op);
    syncEngine.itemDeliveryLedger = undefined;
    window.testItemDeliveryPush = () => syncEngine.deliverPushOverHttp({ bundleId: 'card-dot-bundle', encrypted: {},
      frame: new Uint8Array(), stateHash: 'test', opIds: [op.opId], packedHashes: { [key]: hash },
      changes: 1, settled: false, fallbackTimer: null });
    syncEngine.notify();
  }, id);
  await expect(dot).toHaveAttribute('data-sync-status', 'pending');
  await page.evaluate(() => window.testItemDeliveryPush());
  await expect(dot).toHaveAttribute('data-sync-status', 'error');
  await page.unroute('**/api/rooms/card-dot-test/bundle?*');
  await page.route('**/api/rooms/card-dot-test/bundle?*', (route) => route.fulfill({ status: 200 }));
  await page.evaluate(() => window.testItemDeliveryPush());
  await expect(dot).toHaveAccessibleName('Версия записи принята релеем');
  await expect(card.getByTestId('item-time').locator('[data-sync-status]')).toHaveCount(1);
  const gapAfterTime = await dot.evaluate((element) => {
    const range = document.createRange();
    range.selectNode(element.previousSibling!);
    return element.getBoundingClientRect().left - range.getBoundingClientRect().right;
  });
  expect(gapAfterTime).toBeCloseTo(4, 0);
  await card.screenshot({ path: 'test-results/screenshots/sync-item-delivery.png' });
  const edited = await page.evaluate(async (id) => {
    const { syncEngine, storage } = await import('/src/lib/sync/syncEngine.ts');
    const { computeHash } = await import('/src/lib/sync/crypto.ts');
    const { stripAttachmentData } = await import('/src/lib/storage/attachmentData.ts');
    const item = { ...storage.getItemById(id), content: 'новая неподтверждённая версия' };
    return syncEngine.getItemDeliveryStatus(item, await computeHash(JSON.stringify(stripAttachmentData([item])[0])));
  }, id);
  expect(edited).toBe('unconfirmed');
});
