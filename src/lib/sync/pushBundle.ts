import type { PendingPush, SyncEngine } from './syncEngine';
import type { SyncBundle, SyncChangeItem } from './types';
import { computeHash, computeStateRootHash, encodeBundleFrame, encryptBundle } from './crypto';
import { loadSentHashes, loadSyncedIds, loadTombstones, saveSentHashes, stateHashKey } from './localBookkeeping';
import { accountClient } from './account';
import { vault } from '../storage/port';
import { stripAttachmentData } from '../storage/attachmentData';
import { SYNC_INTERVALS, SYNC_STORAGE_KEYS } from '../../config';
import { logger } from '../logger/logger';

const syncLog = logger.scope('SYNC');
const LAST_STATE_HASH_KEY = SYNC_STORAGE_KEYS.LAST_STATE_HASH;

/**
 * Packing the local state into an outgoing bundle: what is dirty, what was already
 * sent, what has to ride along as an attachment.
 *
 * One reason to change — what a push contains. It leans on the engine for the state
 * it must read, but the packing rules are not the transport's business.
 */
export async function pushLocalChanges(engine: SyncEngine): Promise<void> {
if (engine.status.authRequired && !accountClient.getToken(engine.config.serverUrl)) return;
    if (engine.isProcessingSync || !engine.activeVaultKey || !engine.activeRoomId) {
      // An edit landing mid-push must not be dropped: repush right after this bundle.
      if (engine.isProcessingSync) engine.pushDirty = true;
      syncLog.debug('Push skipped: engine is not ready', {
        processing: engine.isProcessingSync,
        hasKey: Boolean(engine.activeVaultKey),
        hasRoom: Boolean(engine.activeRoomId),
      });
      return;
    }

    if (engine.status.initialSync.vaultId === engine.currentVaultId &&
        (engine.status.initialSync.state === 'loading' || engine.status.initialSync.state === 'error')) return;
    if (engine.config.localSyncMode === 'receive-only') return;

    engine.isProcessingSync = true;
    const generation = engine.initGeneration;
    const vaultKey = engine.activeVaultKey;
    const hashKey = stateHashKey(engine.bookkeeping);

    try {
      // `getItems` re-hydrates `dataUrl` from the session cache, so a photo pasted a minute ago
      // would ride inside the note's own payload. Metadata only; bytes travel as their own change.
      const items = stripAttachmentData(vault().getItems());
      const folders = vault().getFolders();
      const workspaceState = vault().getWorkspaceState();
      const pendingOps = engine.getOutbox().pending();

      const stateHash = await computeStateRootHash(items, folders);
      if (generation !== engine.initGeneration) return;
      const lastSyncedHash =
        localStorage.getItem(hashKey) ||
        (!engine.usesAccountSync() && engine.currentVaultId === 'default_vault' ? localStorage.getItem(LAST_STATE_HASH_KEY) : null);

      // An attachment pass has nothing to do with the note state hash: it must get past the
      // "nothing changed" gate, or unsent bytes on an otherwise untouched vault never leave.
      // A request for missing bytes changes no note either, so it opens the gate the same way.
      if (
        !engine.attachmentPass &&
        !engine.hasPendingAttachmentRequests() &&
        lastSyncedHash === stateHash &&
        pendingOps.length === 0
      ) {
        // Nothing changed
        engine.status.state = engine.ws && engine.ws.readyState === WebSocket.OPEN ? 'connected' : 'idle';
        engine.isProcessingSync = false;
        engine.notify();
        return;
      }

      engine.status.state = 'syncing';
      engine.notify();

      const changes: SyncChangeItem[] = [];
      // Only entities whose hash differs from what this room already received go out;
      // sending the whole vault on every keystroke is what kept pushes at 60 changes.
      let sentHashes = loadSentHashes(engine.bookkeeping);
      if (engine.forceFullPush) {
        engine.forceFullPush = false;
        sentHashes = {};
        engine.entityHashes.clear();
        saveSentHashes(engine.bookkeeping, {});
      }
      const packedHashes: Record<string, string> = {};
      const pack = (key: string, hash: string, change: SyncChangeItem) => {
        if (sentHashes[key] === hash) return;
        changes.push(change);
        packedHashes[key] = hash;
      };

      // Stringify + SHA-256 of every note on every keystroke is the only O(vault) work in
      // the push path (11 ms at 50 notes, 182 ms at 5000). `updatedAt` is bumped by every
      // storage mutation, so it is a cheap change signature: hash only what moved.
      for (const item of items) {
        const cacheKey = `item:${item.id}`;
        const sig = `${item.updatedAt ?? 0}:${item.title?.length ?? 0}:${item.content?.length ?? 0}`;
        const cached = engine.entityHashes.get(cacheKey);
        let itemHash: string;
        if (cached && cached.sig === sig) {
          itemHash = cached.hash;
        } else {
          itemHash = await computeHash(JSON.stringify(item));
          engine.entityHashes.set(cacheKey, { sig, hash: itemHash });
        }
        pack(cacheKey, itemHash, {
          id: item.id,
          type: 'item',
          action: 'upsert',
          version: 1,
          hash: itemHash,
          payload: item,
        });
      }

      for (const folder of folders) {
        const folderHash = await computeHash(JSON.stringify(folder));
        pack(`folder:${folder.path}`, folderHash, {
          id: folder.path,
          type: 'folder',
          action: 'upsert',
          version: 1,
          hash: folderHash,
          payload: folder,
        });
      }

      const workspaceHash = await computeHash(JSON.stringify(workspaceState));
      pack('workspace:workspace_state', workspaceHash, {
        id: 'workspace_state',
        type: 'workspace',
        action: 'upsert',
        version: 1,
        hash: workspaceHash,
        payload: workspaceState,
      });

      // The assistant's memory is a short list, so it packs whole and dedupes per fact. It is
      // not in the state root hash: the outbox op a memory write leaves behind opens the push
      // gate, and the hash of each fact settles what actually left.
      for (const fact of vault().getMemory()) {
        const factHash = await computeHash(JSON.stringify(fact));
        pack(`memory:${fact.id}`, factHash, {
          id: fact.id,
          type: 'memory',
          action: fact.deletedAt ? 'delete' : 'upsert',
          version: 1,
          hash: factHash,
          payload: fact.deletedAt ? { deletedAt: fact.deletedAt } : fact,
        });
      }

      // One attachment per bundle, and only when the previous bundle is confirmed. A slow uplink
      // then blocks one file instead of every note edit behind it.
      // ponytail: no chunks and no re-seed. The relay keeps a bundle for 7 days, so a device that
      // sleeps longer never gets the file. Upgrade: a `restore` request from the receiver clears
      // its hash here and the bytes are pushed again.
      if (engine.attachmentPass) {
        engine.attachmentPass = false;
        let packedOne = false;
        for (const item of items) {
          if (await engine.packOneAttachment(item, changes, sentHashes, packedHashes)) {
            packedOne = true;
            break;
          }
        }
        if (!packedOne) syncLog.warn('Attachment pass found nothing it could read; files stay local');
      }

      // A device that ACKed a bundle but never wrote its bytes asks for them here. One request
      // per bundle: the answer is a whole file, and one relay pass is enough to carry it.
      const attachmentRequest = engine.nextAttachmentRequest();
      if (attachmentRequest) {
        changes.push({
          id: attachmentRequest.attachmentId,
          type: 'attachment_request',
          action: 'upsert',
          version: 1,
          hash: `${attachmentRequest.size}:${attachmentRequest.name}`,
          payload: attachmentRequest,
        });
      }

      // Pack deletions as explicit tombstones so a stale snapshot cannot resurrect them.
      const syncedIds = loadSyncedIds(engine.bookkeeping);
      const currentIds = new Set(items.map((it) => it.id));
      const tombstones = loadTombstones(engine.bookkeeping);
      for (const id of syncedIds) {
        if (currentIds.has(id)) continue;
        const deletedAt = tombstones[id] ?? Date.now();
        tombstones[id] = deletedAt;
        changes.push({
          id,
          type: 'item',
          action: 'delete',
          version: 1,
          hash: String(deletedAt),
          payload: { deletedAt },
        });
      }
      for (const id of currentIds) {
        delete tombstones[id];
      }

      // Pack folder mutations, trash operations, and drafts from Outbox
      for (const op of pendingOps) {
        if (op.kind === 'folder') {
          if (op.action === 'delete') {
            changes.push({
              id: op.id,
              type: 'folder',
              action: 'delete',
              version: 1,
              hash: String(op.timestamp),
              payload: { path: op.id },
            });
          } else if (op.action === 'rename') {
            changes.push({
              id: op.id,
              type: 'folder',
              action: 'rename',
              version: 1,
              hash: String(op.timestamp),
              payload: { oldPath: op.oldPath, folder: op.payload },
            });
          }
        } else if (op.kind === 'trash' && op.action === 'restore') {
          changes.push({
            id: op.id,
            type: 'trash',
            action: 'restore',
            version: 1,
            hash: String(op.timestamp),
            payload: op.payload,
          });
        } else if (op.kind === 'draft') {
          changes.push({
            id: op.id,
            type: 'draft',
            action: op.action,
            version: 1,
            hash: String(op.timestamp),
            payload: op.action === 'delete' ? { deletedAt: op.timestamp } : op.payload,
          });
        }
      }

      if (changes.length === 0) {
        // Only outbox noise that changed nothing on disk: nothing to send.
        syncLog.debug('Push skipped: no entity changed since the last bundle');
        localStorage.setItem(hashKey, stateHash);
        engine.getOutbox().markSynced(pendingOps.map((o) => o.opId));
        engine.status.state = engine.ws && engine.ws.readyState === WebSocket.OPEN ? 'connected' : 'idle';
        return;
      }

      const bundle: SyncBundle = {
        bundleId: `bnd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        roomId: engine.activeRoomId,
        fromDeviceId: engine.config.deviceId,
        sequence: engine.sequence++,
        stateRootHash: stateHash,
        timestamp: new Date().toISOString(),
        changes,
      };

      const encrypted = await encryptBundle(bundle, vaultKey);
      if (generation !== engine.initGeneration) return;

      const pending: PendingPush = {
        bundleId: bundle.bundleId,
        encrypted,
        frame: encodeBundleFrame(encrypted),
        hashKey,
        stateHash,
        packedHashes,
        syncedIds: [...currentIds],
        tombstones: { ...tombstones },
        opIds: pendingOps.map((o) => o.opId),
        changes: changes.length,
        settled: false,
        fallbackTimer: null,
      };

      syncLog.info(
        `Queued bundle ${pending.bundleId} (${changes.length} changes, ${encrypted.ciphertext.length} B) -> room ${engine.activeRoomId.slice(0, 10)}...`
      );

      if (generation !== engine.initGeneration) return;
      engine.pendingPushes.set(pending.bundleId, pending);
      if (attachmentRequest) {
        // Stamped at the send, not at the enqueue: a request that never left must retry freely.
        engine.markAttachmentRequestSent(attachmentRequest.attachmentId);
      }
      if (engine.hasPendingAttachmentRequests()) {
        // One request per bundle: every further file waits for its own small push.
        engine.scheduleDebouncedPush(0);
      }
      const ws = engine.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Fast path: the socket is already open, so the bundle leaves on it without waiting
        // for a request/response round trip. The relay's `server_ack` commits the
        // bookkeeping; if it never arrives the same bundle is replayed over HTTP below
        // (the relay dedups by bundleId, so a double delivery is harmless).
        pending.fallbackTimer = setTimeout(() => {
          pending.fallbackTimer = null;
          void engine.deliverPushOverHttp(pending);
        }, SYNC_INTERVALS.WS_ACK_TIMEOUT_MS);
        try {
          ws.send(engine.wsSupportsBinary ? pending.frame : JSON.stringify({ type: 'bundle', bundle: encrypted }));
          engine.status.state = 'connected';
          engine.status.error = null;
        } catch (error) {
          syncLog.warn('Websocket push failed, falling back to HTTP:', error);
          await engine.deliverPushOverHttp(pending);
        }
      } else {
        await engine.deliverPushOverHttp(pending);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      syncLog.error('Failed to push sync bundle:', msg);
      engine.status.state = 'error';
      engine.status.error = msg;
    } finally {
      engine.isProcessingSync = false;
      if (engine.pushDirty) {
        engine.pushDirty = false;
        engine.scheduleDebouncedPush(0);
      }
      engine.notify();
    }
}
