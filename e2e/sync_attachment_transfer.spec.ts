import { test, expect } from './support/selfhostFixture';

test.setTimeout(180_000);

/**
 * Bytes ride one change of type `attachment` inside the same encrypted bundle. Three things must
 * hold: the note itself stays metadata-only, the bytes leave in their own change, and a device
 * that receives that change can actually resolve a url afterwards.
 *
 * Packing them must not go back through the network stack either: the bytes come straight out of
 * IndexedDB, so no `fetch` of a `blob:`/`data:` url happens while a bundle is built. A counter on
 * `window.fetch` proves that — the only fetch calls left are the relay's own, and those are mocked.
 */
test('attachment bytes travel as their own change and become playable on the receiver', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });

  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const { deriveVaultKey, decryptBundle } = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');
    const { getPrefEntries, removePref } = await import(/* @vite-ignore */ '/src/lib/storage/prefs.ts');

    return withSyncHarness(async ({ engine, storage, push, init }) => {
      window.fetch = async (_url, opts) => {
        const method = (opts && opts.method) || 'GET';
        if (method !== 'POST') return Response.json({ bundles: [], head: 0, oldest: 0 });
        return new Response('{}', { status: 200 });
      };
      await init('synthetic attachment seed');

      // A base64 body whose length is a multiple of four: `atob` refuses a remainder of one, and
      // the whole point of the pass is that these bytes come back out of the codec.
      const bytes = 'data:audio/mp4;base64,AAECAwQFBgcICQoL';
      const root = {
        type: 'note' as const,
        folder: 'Входящие',
        tags: [],
        content: '',
        createdAt: 1,
        updatedAt: Date.now(),
      };
      const liveAttachment = {
        id: 'att-live-1',
        name: 'take.m4a',
        type: 'audio' as const,
        mimeType: 'audio/mp4',
        size: 12,
        relativePath: '.attachments/att_att-live-1_take.m4a',
        dataUrl: bytes,
      };
      storage.saveItem({ ...root, id: 'att-live', title: 'Трек', attachments: [liveAttachment] });
      // Bytes must already be in IndexedDB when the pass reads them; otherwise the frame would
      // legitimately contain no attachment change and the check below would prove nothing.
      await storage.saveAttachment(liveAttachment);

      // The same note on a device that never received the bytes: metadata only, nothing to send.
      storage.saveItem({
        ...root,
        id: 'att-gone',
        title: 'Пусто',
        attachments: [{ ...liveAttachment, id: 'att-gone-1', name: 'gone.m4a', dataUrl: undefined }],
      });

      const frames: string[] = [];
      engine.ws = {
        readyState: 1,
        send: (data: string | Uint8Array) => { frames.push(String(data)); },
        close: () => {},
      };
      engine.wsSupportsBinary = false;

      // Saving a note queues a push of its own. Let it leave first, so the frame checked below
      // belongs to the attachment pass and not to the save that preceded it.
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      await sleep(150);
      for (let i = 0; i < 100 && engine.isProcessingSync; i++) await sleep(20);
      // Forget what that push delivered: the pass below has to pack the note and the bytes again.
      for (const [key] of getPrefEntries()) {
        if (key.startsWith('slag_sync_sent_hashes_')) removePref(key);
      }

      // Bytes must never be read through a `blob:`/`data:` fetch: a five-megabyte file would be
      // pulled through the network stack twice, and a data: url is not a stable source in WebKit.
      const relayFetch = window.fetch;
      const byteUrlFetches: string[] = [];
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith('blob:') || url.startsWith('data:')) byteUrlFetches.push(url);
        return relayFetch(input, init);
      };
      const framesBeforePush = frames.length;
      engine.attachmentPass = true;
      try {
        await push();
      } finally {
        window.fetch = relayFetch;
      }
      const pushedFrames = frames.slice(framesBeforePush);
      if (pushedFrames.length !== 1) {
        return { error: `expected one pushed frame, got ${pushedFrames.length}`, byteUrlFetches: byteUrlFetches.length };
      }

      const envelope = JSON.parse(pushedFrames[0]).bundle;
      await engine.handleIncomingMessage(JSON.stringify({ type: 'server_ack', bundleId: envelope.bundleId }));
      const bundle = await decryptBundle(envelope, await deriveVaultKey('synthetic attachment seed'));

      const itemChange = bundle.changes.find((ch: { id: string }) => ch.id === 'att-live');
      const attachmentChanges = bundle.changes.filter((ch: { type: string }) => ch.type === 'attachment');

      // The other direction: a bundle from a paired device carrying bytes this device lacks.
      await engine.handleIncomingMessage(JSON.stringify({
        type: 'bundle',
        bundle: {
          bundleId: 'incoming-attachment',
          roomId: engine.activeRoomId,
          fromDeviceId: 'other-device',
          sequence: 2,
          stateRootHash: 'x',
          timestamp: new Date().toISOString(),
          changes: [{
            id: 'att-remote-1',
            type: 'attachment',
            action: 'upsert',
            version: 1,
            hash: 'h',
            payload: {
              attachment: {
                id: 'att-remote-1',
                name: 'voice.m4a',
                type: 'audio',
                mimeType: 'audio/mp4',
                size: 9,
                relativePath: '.attachments/att_att-remote-1_voice.m4a',
              },
              dataUrl: 'data:audio/mp4;base64,//uQxAAAANg',
            },
          }],
        },
      }));
      const imported = await storage.getAttachmentUrl(
        'att-remote-1',
        '.attachments/att_att-remote-1_voice.m4a',
        'audio/mp4',
      );

      // The imported bytes must not be echoed straight back to the device they came from.
      const framesBeforeEcho = frames.length;
      engine.attachmentPass = true;
      await push();

      return {
        itemHasNoBytes: itemChange
          ? (itemChange.payload as { attachments: { dataUrl?: string }[] }).attachments[0].dataUrl === undefined
          : false,
        oneAttachmentChange: attachmentChanges.length === 1,
        attachmentCarriesBytes: Boolean(
          (attachmentChanges[0]?.payload as { dataUrl?: string } | undefined)?.dataUrl?.startsWith('data:'),
        ),
        attachmentMetadataHasNoBytes:
          (attachmentChanges[0]?.payload as { attachment?: { dataUrl?: string } } | undefined)?.attachment?.dataUrl === undefined,
        absentBytesNotSent: !bundle.changes.some((ch: { id: string }) => ch.id === 'att-gone-1'),
        importedIsPlayable: Boolean(imported && imported.startsWith('data:')),
        bytesNeverFetched: byteUrlFetches.length === 0,
        echoedBack: frames.length !== framesBeforeEcho,
      };
    });
  });

  expect(result).toEqual({
    itemHasNoBytes: true,
    oneAttachmentChange: true,
    attachmentCarriesBytes: true,
    attachmentMetadataHasNoBytes: true,
    absentBytesNotSent: true,
    importedIsPlayable: true,
    bytesNeverFetched: true,
    echoedBack: false,
  });
});
