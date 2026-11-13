import { test, expect } from './support/selfhostFixture';

/**
 * Память в бандле синка.
 *
 * Relax остаётся zero-knowledge: relay хранит ciphertext и `changes[]` не разбирает, поэтому
 * новый тип изменения — чисто клиентское дело. Проверяем именно то, что уезжает в бандл:
 * факт едет как `memory: upsert`, удаление — как `memory: delete` с надгробием.
 */
test('memory packs as its own change type and deletions ride tombstones', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });

  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const cryptoMod = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');
    const { stateHashKey } = await import(/* @vite-ignore */ '/src/lib/sync/localBookkeeping.ts');
    const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');

    return withSyncHarness(async ({ engine, push, init }) => {
      window.fetch = async () => Response.json({ bundles: [] });
      await init('synthetic memory seed');
      const scope = engine.bookkeeping;
      const key = await cryptoMod.deriveVaultKey('synthetic memory seed');

      memoryService.remember({
        text: 'не любит созвон-митинги до полудня',
        kind: 'pref',
        tag: 'работа',
        importance: 4,
      });
      const outboxKinds = engine
        .getOutbox()
        .pending()
        .filter((op: { kind: string }) => op.kind === 'memory')
        .map((op: { kind: string }) => op.kind);

      // init уже отправил пустое хранилище: снимаем чекпоинт, иначе пуш схлопнется в «ничего не изменилось».
      localStorage.removeItem(stateHashKey(scope));
      localStorage.removeItem('slag_sync_last_state_hash');

      let captured: { changes?: Array<{ type: string; action: string; payload?: Record<string, unknown> }> } = {};
      window.fetch = async (_url, opts) => {
        if (!opts || opts.method !== 'POST') return Response.json({ bundles: [] });
        captured = await cryptoMod.decryptBundle(JSON.parse(opts.body), key);
        return new Response('{}', { status: 200 });
      };

      await push();
      const first = (captured.changes || []).filter((change) => change.type === 'memory');

      memoryService.forget('не любит созвон-митинги до полудня');
      localStorage.removeItem(stateHashKey(scope));
      await push();
      const second = (captured.changes || []).filter((change) => change.type === 'memory');

      return {
        outboxKinds,
        firstType: first.map((change) => change.type),
        firstAction: first.map((change) => change.action),
        firstText: (first[0]?.payload as { text?: string } | undefined)?.text ?? null,
        secondAction: second.map((change) => change.action),
        secondDeletedAt: Number((second[0]?.payload as { deletedAt?: number } | undefined)?.deletedAt ?? 0),
      };
    });
  });

  expect(result.outboxKinds).toEqual(['memory']);
  expect(result.firstType).toEqual(['memory']);
  expect(result.firstAction).toEqual(['upsert']);
  expect(result.firstText).toBe('не любит созвон-митинги до полудня');
  expect(result.secondAction).toEqual(['delete']);
  expect(result.secondDeletedAt).toBeGreaterThan(0);
});

test('an incoming memory change lands, and a tombstone outranks a stale upsert', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' });

  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const { memoryService } = await import(/* @vite-ignore */ '/src/lib/memory.ts');

    return withSyncHarness(async ({ engine, init }) => {
      window.fetch = async () => Response.json({ bundles: [] });
      await init('synthetic memory apply seed');
      const roomId = engine.activeRoomId;

      const makeBundle = (bundleId: string, changes: unknown[]) => ({
        bundleId,
        roomId,
        fromDeviceId: 'other-device',
        sequence: 1,
        stateRootHash: 'x',
        timestamp: new Date().toISOString(),
        changes,
      });
      // Bundles land in the import buffer and reach localStorage on the 120 ms flush.
      const deliver = async (bundle: unknown) => {
        await engine.handleIncomingMessage(JSON.stringify({ type: 'bundle', bundle }));
        await new Promise((resolve) => setTimeout(resolve, 250));
      };

      const fact = {
        id: 'm_remote1',
        text: 'живёт в Москве',
        normalized: 'живёт в москв',
        kind: 'fact',
        tag: 'быт',
        importance: 3,
        mentions: 1,
        usedCount: 0,
        createdAt: 1,
        updatedAt: 100,
        usedAt: 1,
        isPinned: false,
      };

      await deliver(makeBundle('mb1', [
        { id: 'm_remote1', type: 'memory', action: 'upsert', version: 1, hash: 'h', payload: fact },
      ]));
      const arrived = memoryService.all().map((item: { text: string }) => item.text);

      await deliver(makeBundle('mb2', [
        { id: 'm_remote1', type: 'memory', action: 'delete', version: 1, hash: 'd', payload: { deletedAt: 200 } },
      ]));
      const afterDelete = memoryService.all().length;

      // Та же копия факта, что пришла до удаления: надгробие должно её перебить.
      await deliver(makeBundle('mb3', [
        { id: 'm_remote1', type: 'memory', action: 'upsert', version: 1, hash: 'h', payload: fact },
      ]));
      const afterStaleUpsert = memoryService.all().length;

      return { arrived, afterDelete, afterStaleUpsert };
    });
  });

  expect(result.arrived).toEqual(['живёт в Москве']);
  expect(result.afterDelete).toBe(0);
  expect(result.afterStaleUpsert).toBe(0);
});
