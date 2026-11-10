import { test, expect } from './support/selfhostFixture';

test.setTimeout(180_000);

/**
 * Bytes ride one change of type `attachment` inside the same encrypted bundle. Three things must
 * hold: the note itself stays metadata-only, the bytes leave in their own change, and a device
 * that receives that change can actually resolve a url afterwards.
 */
test('attachment bytes travel as their own change and become playable on the receiver', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible();

  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const { deriveVaultKey, decryptBundle } = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');

    return withSyncHarness(async ({ engine, storage, push, init }) => {
      window.fetch = async (_url, opts) => {
        const method = (opts && opts.method) || 'GET';
        if (method !== 'POST') return Response.json({ bundles: [], head: 0, oldest: 0 });
        return new Response('{}', { status: 200 });
      };
      await init('synthetic attachment seed');

      const bytes = 'data:audio/mp4;base64,//uQxAAAANgAAABL2';
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
      storage.saveAttachment(liveAttachment);

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

      engine.attachmentPass = true;
      await push();
      if (frames.length !== 1) return { error: `expected one pushed frame, got ${frames.length}` };

      const envelope = JSON.parse(frames[0]).bundle;
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
  });
});
