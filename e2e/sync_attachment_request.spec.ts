import { test, expect } from './support/selfhostFixture';

test.setTimeout(180_000);

/**
 * Files that never reached this disk, from both sides.
 *
 * First: a bundle says it carries bytes, the write fails, and the receiver must treat that as a
 * miss — the file stays in `missingAttachments`, it is asked for again, and `att:<id>` must not
 * appear in the sent-hashes ledger. Marking a failed write as delivered is how a file is lost
 * for good: the request pass would believe this device already has it.
 *
 * Second: the whole round trip. A note with metadata but no bytes asks the room for the file; a
 * device that still holds them answers with an `attachment` change carrying the bytes. A request
 * for an id this device does not have must produce no outgoing frame at all.
 */
test('a failed attachment write is not recorded as delivered and is re-requested', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });

  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');

    return withSyncHarness(async ({ engine, storage, init }) => {
      window.fetch = async (_url, opts) => {
        const method = (opts && opts.method) || 'GET';
        if (method !== 'POST') return Response.json({ bundles: [], head: 0, oldest: 0 });
        return new Response('{}', { status: 200 });
      };
      await init('synthetic attachment failure seed');

      const attachmentId = 'att-import-failed-1';
      const attachment = {
        id: attachmentId,
        name: 'broken.m4a',
        type: 'audio' as const,
        mimeType: 'audio/mp4',
        size: 12,
        relativePath: `.attachments/att_${attachmentId}_broken.m4a`,
      };

      const originalImport = storage.importSyncedAttachment;
      try {
        // The same substitution the harness makes for `importSyncedVaultData`: a disk that
        // refuses the bytes, without touching anything else about the bundle's path.
        storage.importSyncedAttachment = async () => false;
        await engine.handleIncomingMessage(JSON.stringify({
          type: 'bundle',
          bundle: {
            bundleId: 'incoming-attachment-write-failed',
            roomId: engine.activeRoomId,
            fromDeviceId: 'other-device',
            sequence: 7,
            stateRootHash: 'x',
            timestamp: new Date().toISOString(),
            changes: [{
              id: attachmentId,
              type: 'attachment',
              action: 'upsert',
              version: 1,
              hash: 'h',
              payload: { attachment, dataUrl: 'data:audio/mp4;base64,AAECAwQFBgcICQoL' },
            }],
          },
        }));

        // The import is awaited inside the bundle loop, so both answers are settled by now.
        const markedMissing = engine.missingAttachments.has(attachmentId);
        const bytesOnDisk = await storage.hasAttachmentBytes(attachmentId, attachment.relativePath);
        // The re-request rides its own bundle; wait for it before reading the ledger, so a late
        // commit cannot sneak the id past this check.
        await new Promise((resolve) => setTimeout(resolve, 250));
        const delivered = Object.keys(localStorage)
          .filter((key) => key.startsWith('slag_sync_sent_hashes_'))
          .some((key) => {
            const raw = localStorage.getItem(key);
            if (raw === null) return false;
            return Object.prototype.hasOwnProperty.call(JSON.parse(raw), `att:${attachmentId}`);
          });
        return { markedMissing, delivered, bytesOnDisk };
      } finally {
        storage.importSyncedAttachment = originalImport;
      }
    });
  });

  expect(result).toEqual({ markedMissing: true, delivered: false, bytesOnDisk: false });
});

test('missing bytes are requested from the room and a device that holds them answers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('sidebar-settings-btn')).toBeVisible({ timeout: 90_000 });

  const result = await page.evaluate(async () => {
    const { withSyncHarness } = await import(/* @vite-ignore */ '/e2e/support/syncHarness.ts');
    const { deriveVaultKey, decryptBundle } = await import(/* @vite-ignore */ '/src/lib/sync/crypto.ts');

    return withSyncHarness(async ({ engine, storage, push, init }) => {
      window.fetch = async (_url, opts) => {
        const method = (opts && opts.method) || 'GET';
        if (method !== 'POST') return Response.json({ bundles: [], head: 0, oldest: 0 });
        return new Response('{}', { status: 200 });
      };
      const seed = 'synthetic attachment request seed';
      await init(seed);
      const key = await deriveVaultKey(seed);

      const frames: string[] = [];
      engine.ws = {
        readyState: 1,
        send: (data: string | ArrayBuffer) => {
          frames.push(typeof data === 'string' ? data : new TextDecoder().decode(new Uint8Array(data)));
        },
        close: () => {},
      };
      engine.wsSupportsBinary = false;

      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const settle = async (ms = 150) => {
        await wait(ms);
        for (let i = 0; i < 100 && engine.isProcessingSync; i++) await wait(20);
      };
      const isBundleFrame = (raw: string) => {
        try {
          return (JSON.parse(raw) as { type?: string }).type === 'bundle';
        } catch {
          return false;
        }
      };
      const bundleFrames = (from: number) => frames.slice(from).filter(isBundleFrame);
      const decryptAll = async (rawFrames: string[]) => {
        const bundles: Awaited<ReturnType<typeof decryptBundle>>[] = [];
        for (const raw of rawFrames) {
          const envelope = JSON.parse(raw) as { bundle: Parameters<typeof decryptBundle>[0] };
          bundles.push(await decryptBundle(envelope.bundle, key));
        }
        return bundles;
      };
      // Every frame this device pushed is acknowledged, so state committed by one phase does not
      // leak a resent bundle into the next one.
      const ackAll = async (rawFrames: string[]) => {
        for (const raw of rawFrames) {
          const envelope = JSON.parse(raw) as { bundle: { bundleId: string } };
          await engine.handleIncomingMessage(JSON.stringify({ type: 'server_ack', bundleId: envelope.bundle.bundleId }));
        }
      };

      const attachment = {
        id: 'att-request-1',
        name: 'wanted.m4a',
        type: 'audio' as const,
        mimeType: 'audio/mp4',
        size: 12,
        relativePath: '.attachments/att_att-request-1_wanted.m4a',
      };

      // Outgoing: the note holds the metadata only, so its file has to be asked for by id.
      const requestBaseline = frames.length;
      storage.saveItem({
        id: 'att-request-note',
        type: 'note',
        title: 'Трек на другом устройстве',
        content: '',
        folder: 'Входящие',
        tags: [],
        createdAt: 1,
        updatedAt: Date.now(),
        attachments: [attachment],
      });
      engine.requestAttachmentBytes(attachment);
      await push();
      await settle(250);

      const requestBundles = await decryptAll(bundleFrames(requestBaseline));
      const requestChange = requestBundles
        .flatMap((bundle) => bundle.changes)
        .find((change) => {
          const payload = change.payload as { attachmentId?: string } | undefined;
          return change.type === 'attachment_request' && payload?.attachmentId === attachment.id;
        });
      const requestPayload = requestChange?.payload as
        | { attachmentId?: string; name?: string; size?: number; relativePath?: string }
        | undefined;
      const requested = Boolean(requestChange)
        && requestPayload?.name === attachment.name
        && requestPayload?.size === attachment.size
        && requestPayload?.relativePath === attachment.relativePath;

      await ackAll(bundleFrames(requestBaseline));
      await settle(250);

      // Incoming: a peer asks for a file this device does have. Its bytes are already on disk.
      const answerBaseline = frames.length;
      await storage.saveAttachment({ ...attachment, dataUrl: 'data:audio/mp4;base64,AAECAwQFBgcICQoL' });
      await engine.handleIncomingMessage(JSON.stringify({
        type: 'bundle',
        bundle: {
          bundleId: 'incoming-attachment-request',
          roomId: engine.activeRoomId,
          fromDeviceId: 'other-device',
          sequence: 9,
          stateRootHash: 'x',
          timestamp: new Date().toISOString(),
          changes: [{
            id: attachment.id,
            type: 'attachment_request',
            action: 'upsert',
            version: 1,
            hash: 'h',
            payload: {
              attachmentId: attachment.id,
              name: attachment.name,
              size: attachment.size,
              relativePath: attachment.relativePath,
            },
          }],
        },
      }));
      await settle(250);
      await push();
      await settle(200);

      const answerBundles = await decryptAll(bundleFrames(answerBaseline));
      const answerChange = answerBundles
        .flatMap((bundle) => bundle.changes)
        .find((change) => change.type === 'attachment' && change.id === attachment.id);
      const answerPayload = answerChange?.payload as { dataUrl?: string } | undefined;
      const answeredWithBytes = Boolean(answerPayload?.dataUrl?.startsWith('data:'));

      await ackAll(bundleFrames(answerBaseline));
      await settle(250);

      // Silent: the same request for a file this device cannot read must not make it send anything.
      const silentBaseline = frames.length;
      await engine.handleIncomingMessage(JSON.stringify({
        type: 'bundle',
        bundle: {
          bundleId: 'incoming-attachment-request-unknown',
          roomId: engine.activeRoomId,
          fromDeviceId: 'other-device',
          sequence: 10,
          stateRootHash: 'x',
          timestamp: new Date().toISOString(),
          changes: [{
            id: 'att-unknown-1',
            type: 'attachment_request',
            action: 'upsert',
            version: 1,
            hash: 'h',
            payload: {
              attachmentId: 'att-unknown-1',
              name: 'nope.m4a',
              size: 3,
              relativePath: '.attachments/att_att-unknown-1_nope.m4a',
            },
          }],
        },
      }));
      await settle(250);
      await push();
      await settle(200);
      const silentWithoutFile = bundleFrames(silentBaseline).length === 0;

      return { requested, answeredWithBytes, silentWithoutFile };
    });
  });

  expect(result).toEqual({ requested: true, answeredWithBytes: true, silentWithoutFile: true });
});
