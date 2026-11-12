import type { SyncEngine } from './syncEngine';
import type { SyncBundle, EncryptedBundle } from './types';
import { decryptBundle } from './crypto';
import { touchDeviceLastSeen } from './devices';
import { loadSentHashes, loadTombstones, saveSentHashes, tombstonesKey } from './localBookkeeping';
import { attachmentSignature } from './attachmentSignature';
import { logger } from '../logger/logger';
import { storage } from '../storage';
import type { ComposerDraft, FolderMeta, FullscreenDraft, SlagAttachment, SlagItem, WorkspaceState } from '../../types';
import { DEFAULT_INBOX_FOLDER, SYNC_STORAGE_KEYS } from '../../config';

const syncLog = logger.scope('SYNC');

/**
 * What a bundle from the relay actually does to the vault: tombstones, staged
 * imports, the attachment pass, the ack.
 *
 * One reason to change — what a remote state means. It leans on the engine for the
 * state a merge must see (what was applied, what is in flight), but those rules are
 * not the transport's business and no longer live beside the websocket.
 */
export async function persistIncomingBundle(engine: SyncEngine, bundlePayload: unknown): Promise<void> {
    if (!engine.activeVaultKey) return;
    const generation = engine.initGeneration;
    const roomId = engine.activeRoomId;

    try {
      engine.status.state = 'syncing';
      engine.notify();

      let bundle: SyncBundle;
      if (
        typeof bundlePayload === 'object' &&
        bundlePayload !== null &&
        'ciphertext' in bundlePayload
      ) {
        bundle = await decryptBundle(bundlePayload as EncryptedBundle, engine.activeVaultKey);
      } else {
        if (engine.usesAccountSync()) throw new Error('Account sync requires an encrypted bundle');
        bundle = bundlePayload as SyncBundle;
      }

      if (generation !== engine.initGeneration) return;
      if (bundle.roomId !== roomId || !Array.isArray(bundle.changes)) throw new Error('Bundle room or changes are invalid');
      if (typeof bundlePayload === 'object' && bundlePayload !== null && 'fromDeviceId' in bundlePayload &&
          bundlePayload.fromDeviceId !== bundle.fromDeviceId) throw new Error('Bundle sender does not match authenticated envelope');
      if (bundle.fromDeviceId === engine.config.deviceId) {
        return; // ignore self echo
      }
      if (engine.appliedBundleIds.has(bundle.bundleId)) {
        // ponytail: relay re-delivers pending bundles until ACK; skip a re-apply we already did.
        await engine.sendAck(bundle.bundleId);
        return;
      }

      let sender = engine.config.trustedDevices.find((d) => d.id === bundle.fromDeviceId);
      if (!sender && engine.usesAccountSync()) {
        syncLog.warn(`Ignored bundle from unregistered account device: ${bundle.fromDeviceId}`);
        if (engine.batchUpdating) engine.status.initialSync.rejected++;
        // ACK means "do not redeliver", not "applied": without it the relay replays this
        // bundle forever and the warning above floods the log.
        try {
          await engine.sendAck(bundle.bundleId);
        } catch (error) {
          syncLog.warn('Failed to ACK rejected bundle:', error);
        }
        return;
      }
      if (!sender) {
        sender = {
          id: bundle.fromDeviceId,
          name: `Устройство ${bundle.fromDeviceId.replace('slag-', '').slice(0, 8)}`,
          platform: 'desktop',
          isCurrent: false,
          syncMode: 'read-write',
          canRunAiLease: false,
          pairedAt: new Date().toISOString(),
          lastSeenAt: 'Только что',
          allowedVaults: [engine.currentVaultId],
        };
        engine.addTrustedDevice(sender);
      } else {
        engine.saveConfig({ trustedDevices: touchDeviceLastSeen(engine.config.trustedDevices, bundle.fromDeviceId) });
      }
      if (sender.syncMode === 'receive-only') {
        syncLog.warn(`Ignored mutation bundle from receive-only device: ${bundle.fromDeviceId}`);
        if (engine.batchUpdating) engine.status.initialSync.rejected++;
        return;
      }
      if (sender.allowedVaults !== undefined && !sender.allowedVaults.includes(engine.usesAccountSync() ? engine.getSyncVaultId() : engine.currentVaultId)) {
        syncLog.warn(`Ignored bundle for vault ${engine.currentVaultId} from device without access: ${bundle.fromDeviceId}`);
        if (engine.batchUpdating) engine.status.initialSync.rejected++;
        return;
      }

      syncLog.info(
        `Received bundle ${bundle.bundleId} from ${bundle.fromDeviceId} (${bundle.changes.length} changes)`
      );

      let hasItemsChanged = false;
      let hasFoldersChanged = false;
      let hasWorkspaceChanged = false;
      let hasDraftsChanged = false;
      let workspaceState: WorkspaceState | undefined;

      const currentItems: SlagItem[] = engine.importBuffer ? [...engine.importBuffer.items] : [...storage.getItems()];
      const currentFolders: FolderMeta[] = engine.importBuffer ? [...engine.importBuffer.folders] : [...storage.getFolders()];
      const tombstones = loadTombstones(engine.bookkeeping);
      let tombstonesDirty = false;

      for (const ch of bundle.changes) {
        if (ch.type === 'item') {
          if (ch.action === 'upsert' && ch.payload) {
            const incoming = ch.payload as SlagItem;
            const tomb = tombstones[ch.id];
            // ponytail: wall-clock LWW; server-assigned version when clocks skew matters.
            if (tomb !== undefined && (incoming.updatedAt ?? 0) < tomb) continue;
            const idx = currentItems.findIndex((it) => it.id === ch.id);
            if (idx >= 0) {
              if ((incoming.updatedAt ?? 0) < (currentItems[idx].updatedAt ?? 0)) continue;
              currentItems[idx] = incoming;
            } else {
              currentItems.unshift(incoming);
            }
            if (tomb !== undefined) {
              delete tombstones[ch.id];
              tombstonesDirty = true;
            }
            hasItemsChanged = true;
          } else if (ch.action === 'delete') {
            const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
            const idx = currentItems.findIndex((it) => it.id === ch.id);
            if (idx >= 0 && (currentItems[idx].updatedAt ?? 0) <= deletedAt) {
              currentItems.splice(idx, 1);
              hasItemsChanged = true;
            }
            if (deletedAt > (tombstones[ch.id] ?? 0)) {
              tombstones[ch.id] = deletedAt;
              tombstonesDirty = true;
            }
          }
        } else if (ch.type === 'folder') {
          if (ch.action === 'upsert' && ch.payload) {
            const incoming = ch.payload as FolderMeta;
            const idx = currentFolders.findIndex((f) => f.path === ch.id);
            if (idx >= 0) {
              currentFolders[idx] = incoming;
            } else {
              currentFolders.push(incoming);
            }
            hasFoldersChanged = true;
          } else if (ch.action === 'delete') {
            const folderPath = ch.id;
            const remaining = currentFolders.filter((f) => f.path !== folderPath && !f.path.startsWith(folderPath + '/'));
            if (remaining.length !== currentFolders.length) {
              currentFolders.length = 0;
              currentFolders.push(...remaining);
              hasFoldersChanged = true;
              // Reroute child items to inbox
              for (let i = 0; i < currentItems.length; i++) {
                if (currentItems[i].folder === folderPath || currentItems[i].folder.startsWith(folderPath + '/')) {
                  currentItems[i] = { ...currentItems[i], folder: DEFAULT_INBOX_FOLDER, updatedAt: Date.now() };
                  hasItemsChanged = true;
                }
              }
            }
          } else if (ch.action === 'rename') {
            const payload = ch.payload as { oldPath?: string; folder?: FolderMeta } | undefined;
            const oldPath = payload?.oldPath;
            const updatedFolder = payload?.folder || (ch.payload as FolderMeta);
            if (oldPath && updatedFolder && updatedFolder.path) {
              for (let i = 0; i < currentFolders.length; i++) {
                if (currentFolders[i].path === oldPath) {
                  currentFolders[i] = updatedFolder;
                  hasFoldersChanged = true;
                } else if (currentFolders[i].path.startsWith(oldPath + '/')) {
                  const subPath = updatedFolder.path + currentFolders[i].path.slice(oldPath.length);
                  const subName = subPath.split('/').pop() || currentFolders[i].name;
                  currentFolders[i] = { ...currentFolders[i], path: subPath, name: subName };
                  hasFoldersChanged = true;
                }
              }
              for (let i = 0; i < currentItems.length; i++) {
                if (currentItems[i].folder === oldPath) {
                  currentItems[i] = { ...currentItems[i], folder: updatedFolder.path, updatedAt: Date.now() };
                  hasItemsChanged = true;
                } else if (currentItems[i].folder.startsWith(oldPath + '/')) {
                  const subFolder = updatedFolder.path + currentItems[i].folder.slice(oldPath.length);
                  currentItems[i] = { ...currentItems[i], folder: subFolder, updatedAt: Date.now() };
                  hasItemsChanged = true;
                }
              }
            }
          }
        } else if (ch.type === 'trash') {
          if (ch.action === 'restore' && ch.payload) {
            const restored = ch.payload as SlagItem;
            const idx = currentItems.findIndex((it) => it.id === restored.id);
            if (idx >= 0) {
              currentItems[idx] = restored;
            } else {
              currentItems.unshift(restored);
            }
            if (tombstones[restored.id] !== undefined) {
              delete tombstones[restored.id];
              tombstonesDirty = true;
            }
            hasItemsChanged = true;
          }
        } else if (ch.type === 'attachment' && ch.action === 'upsert') {
          const payload = ch.payload as { attachment?: SlagAttachment; dataUrl?: string } | undefined;
          const attachment = payload?.attachment;
          if (attachment?.id && payload?.dataUrl?.startsWith('data:')) {
            syncLog.info(
              `Received attachment "${attachment.name}" (${Math.round(attachment.size / 1024)} KB, ${attachment.mimeType}) from ${bundle.fromDeviceId}`
            );
            await storage.importSyncedAttachment(attachment, payload.dataUrl);
            // This device now holds the same bytes. Without the mark it would send them right
            // back to the device it just got them from: a five-megabyte ping-pong, both ways.
            const sentHashes = loadSentHashes(engine.bookkeeping);
            sentHashes[`att:${attachment.id}`] = attachmentSignature(attachment);
            saveSentHashes(engine.bookkeeping, sentHashes);
            // The note did not change, but the UI resolves attachment urls per item: reuse the
            // single sync event instead of inventing a second one for bytes.
            hasItemsChanged = true;
          } else {
            syncLog.warn(`Ignored attachment change without usable bytes: ${ch.id}`);
          }
        } else if (ch.type === 'workspace' && ch.payload) {
          workspaceState = ch.payload as WorkspaceState;
          hasWorkspaceChanged = true;
        } else if (ch.type === 'draft') {
          const draftTombKey = `${SYNC_STORAGE_KEYS.DRAFT_TOMB_PREFIX}${engine.currentVaultId}_${ch.id}`;
          const lastDeletedAt = Number(localStorage.getItem(draftTombKey) || 0);

          if (ch.id.startsWith('composer:')) {
            const folder = ch.id.slice('composer:'.length);
            if (ch.action === 'upsert' && ch.payload) {
              const incoming = ch.payload as ComposerDraft;
              if ((incoming.updatedAt ?? 0) <= lastDeletedAt) {
                syncLog.info(`Ignored stale composer draft for "${folder}" (updatedAt <= deletedAt)`);
                continue;
              }
              const existing = storage.getComposerDraft(folder);
              if (!existing || (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
                storage.saveComposerDraft(folder, incoming, 'remote');
                hasDraftsChanged = true;
                syncLog.info(`Applied remote composer draft for folder "${folder}" (${incoming.content.length} chars)`);
              }
            } else if (ch.action === 'delete') {
              const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
              localStorage.setItem(draftTombKey, String(deletedAt));
              storage.deleteComposerDraft(folder, 'remote');
              hasDraftsChanged = true;
              syncLog.info(`Deleted remote composer draft for folder "${folder}"`);
            }
          } else if (ch.id.startsWith('fullscreen:')) {
            const itemId = ch.id.slice('fullscreen:'.length);
            if (ch.action === 'upsert' && ch.payload) {
              const incoming = ch.payload as FullscreenDraft;
              if ((incoming.updatedAt ?? 0) <= lastDeletedAt) {
                syncLog.info(`Ignored stale fullscreen draft for "${itemId}" (updatedAt <= deletedAt)`);
                continue;
              }
              const existing = storage.getFullscreenDraft(itemId);
              if (!existing || (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
                storage.saveFullscreenDraft(itemId, incoming, 'remote');
                hasDraftsChanged = true;
                syncLog.info(`Applied remote fullscreen draft for item "${itemId}" ("${incoming.title}")`);
              }
            } else if (ch.action === 'delete') {
              const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
              localStorage.setItem(draftTombKey, String(deletedAt));
              storage.clearFullscreenDraft(itemId, 'remote');
              hasDraftsChanged = true;
              syncLog.info(`Cleared remote fullscreen draft for item "${itemId}"`);
            }
          }
        }
      }

      if (tombstonesDirty) {
        localStorage.setItem(tombstonesKey(engine.bookkeeping), JSON.stringify(tombstones));
      }

      if (hasItemsChanged || hasFoldersChanged || hasWorkspaceChanged || hasDraftsChanged) {
        engine.stageImport(currentItems, currentFolders, hasWorkspaceChanged ? workspaceState : undefined, {
          items: hasItemsChanged,
          folders: hasFoldersChanged,
          workspace: hasWorkspaceChanged,
          drafts: hasDraftsChanged,
        });
      }
      if (generation !== engine.initGeneration) return;

      engine.appliedBundleIds.add(bundle.bundleId);
      if (engine.batchUpdating) engine.status.initialSync.processed++;
      await engine.sendAck(bundle.bundleId);
      if (generation !== engine.initGeneration) return;

      engine.status.lastSyncTime = new Date().toLocaleTimeString();
      engine.status.state = engine.batchUpdating ? 'syncing' : 'connected';
      engine.notify();
    } catch (err) {
      if (err instanceof Error && err.message.includes('Local state changed')) {
        // Keep the bundle pending; the caller must not advance past a failed persist.
        syncLog.warn('Local changed during sync persist; bundle remains pending');
        throw err;
      }
      syncLog.error('Error applying incoming bundle:', err);
      if (generation !== engine.initGeneration) return;
      engine.status.state = 'error';
      engine.status.error = 'Не удалось расшифровать или сохранить изменения';
      engine.notify();
      throw err;
    }
}
