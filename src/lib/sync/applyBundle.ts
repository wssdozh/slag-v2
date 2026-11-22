import type { SyncEngine } from './syncEngine';
import type { SyncBundle, EncryptedBundle, AttachmentRequestPayload, AssistantPromptPayload } from './types';
import { decryptBundle } from './crypto';
import { touchDeviceLastSeen } from './devices';
import { loadDraftTombstone, loadSentHashes, loadTombstones, requireSyncSectionFlushed, saveDraftTombstone, saveSentHashes, saveTombstones } from './localBookkeeping';
import { attachmentSignature } from './attachmentSignature';
import { logger } from '../logger/logger';
import { vault } from '../storage/port';
import { isLegacySharedKind } from './notes/sharedBody';
import type { ComposerDraft, FolderMeta, FullscreenDraft, MemoryItem, SlagAttachment, SlagItem, WorkspaceState } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';

const syncLog = logger.scope('SYNC');

/**
 * End of a pass that stopped being this engine's pass: a vault switch or a reconnect bumped the
 * generation, and `syncing` left standing here would outlive the work it described.
 */
function settleStatus(engine: SyncEngine): void {
  engine.status.state = engine.ws && engine.ws.readyState === WebSocket.OPEN ? 'connected' : 'idle';
  engine.notify();
}

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
      if (engine.appliedBundleIds.has(bundle.bundleId)) return; // The owning write sends the ACK.

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

      // Only now, after every refusal above has returned: the sidebar spinner is a promise that
      // this call ends it, and a refusal ends nothing. A relay that re-delivered an already
      // acknowledged bundle used to leave the spinner turning until the next local edit, because
      // the state went to `syncing` before the "we already have this" return.
      engine.status.state = 'syncing';
      engine.notify();

      syncLog.info(
        `Received bundle ${bundle.bundleId} from ${bundle.fromDeviceId} (${bundle.changes.length} changes)`
      );

      let hasItemsChanged = false;
      let hasFoldersChanged = false;
      let hasWorkspaceChanged = false;
      let hasDraftsChanged = false;
      let hasMemoryChanged = false;
      let missingAttachmentData = false;
      let workspaceState: WorkspaceState | undefined;

      const currentItems: SlagItem[] = engine.importBuffer ? [...engine.importBuffer.items] : [...vault().getItems()];
      const currentFolders: FolderMeta[] = engine.importBuffer ? [...engine.importBuffer.folders] : [...vault().getFolders()];
      // The notes this bundle says are gone. Collected as it goes: the write takes exactly these off
      // the disk, instead of every note the payload happens not to list.
      const removedIds: string[] = [];
      const itemDeletes: { itemId: string | null; decision: string; deletedAt?: number; localUpdatedAt?: number }[] = [];
      const originalTombstones = loadTombstones(engine.bookkeeping);
      const tombstones = { ...originalTombstones };
      const changedTombstones = new Set<string>();

      const registry = Boolean(engine.noteGeneration);
      for (const ch of bundle.changes) {
        if (registry && (ch.type === 'item' || ch.type === 'trash')) continue;
        if (engine.hasSharedRegistry && isLegacySharedKind(ch.type)) continue;
        if (engine.hasRegistryMedia && (ch.type === 'attachment' || ch.type === 'attachment_request')) continue;
        if (ch.type === 'item') {
          if (ch.action === 'upsert' && ch.payload) {
            const incoming = ch.payload as SlagItem;
            // A legacy full resend is not an explicit restore, even if its clock is ahead.
            if (tombstones[ch.id] !== undefined) continue;
            const idx = currentItems.findIndex((it) => it.id === ch.id);
            if (idx >= 0) {
              if ((incoming.updatedAt ?? 0) < (currentItems[idx].updatedAt ?? 0)) continue;
              currentItems[idx] = incoming;
            } else {
              currentItems.unshift(incoming);
            }
            hasItemsChanged = true;
          } else if (ch.action === 'delete') {
            const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
            const idx = currentItems.findIndex((it) => it.id === ch.id);
            const localUpdatedAt = idx >= 0 ? (currentItems[idx].updatedAt ?? 0) : undefined;
            const remove = localUpdatedAt !== undefined && localUpdatedAt <= deletedAt;
            if (itemDeletes.length < 8) itemDeletes.push({
              itemId: /^item_[\w-]{1,64}$/.test(ch.id) ? ch.id : null,
              decision: remove ? 'staged' : idx < 0 ? 'already-absent' : 'newer-local-copy',
              deletedAt, localUpdatedAt,
            });
            if (remove) {
              currentItems.splice(idx, 1);
              removedIds.push(ch.id);
              hasItemsChanged = true;
            }
            if (deletedAt > (tombstones[ch.id] ?? 0)) {
              tombstones[ch.id] = deletedAt;
              changedTombstones.add(ch.id);
            }
          }
        } else if (ch.type === 'folder') {
          if (engine.hasFolderTreeRegistry) continue;
          if (ch.action === 'upsert' && ch.payload) {
            const incoming = ch.payload as FolderMeta;
            const idx = currentFolders.findIndex((f) => f.path === ch.id);
            if (idx >= 0) {
              // A build that does not know about the manual rank sends the folder without one; the
              // local order is not something to lose because of that.
              const local = currentFolders[idx];
              currentFolders[idx] =
                incoming.order === undefined && local.order !== undefined
                  ? { ...incoming, order: local.order }
                  : incoming;
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
              for (let i = 0; !registry && i < currentItems.length; i++) {
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
              for (let i = 0; !registry && i < currentItems.length; i++) {
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
            if ((tombstones[restored.id] ?? 0) > restored.updatedAt) continue;
            const idx = currentItems.findIndex((it) => it.id === restored.id);
            if (idx >= 0) {
              currentItems[idx] = restored;
            } else {
              currentItems.unshift(restored);
            }
            if (tombstones[restored.id] !== undefined) {
              delete tombstones[restored.id];
              changedTombstones.add(restored.id);
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
            const imported = await vault().importSyncedAttachment(attachment, payload.dataUrl);
            if (imported) {
              engine.missingAttachments.delete(attachment.id);
              engine.cancelAttachmentRequest(attachment.id);
              // This device now holds the same bytes. Without the mark it would send them right
              // back to the device it just got them from: a five-megabyte ping-pong, both ways.
              const sentHashes = loadSentHashes(engine.bookkeeping);
              sentHashes[`att:${attachment.id}`] = attachmentSignature(attachment);
              saveSentHashes(engine.bookkeeping, sentHashes);
              // The note did not change, but the UI resolves attachment urls per item: reuse the
              // single sync event instead of inventing a second one for bytes.
              hasItemsChanged = true;
            } else {
              // The relay hands a bundle out once and its sender already counts these bytes as
              // delivered, so replaying eight megabytes until they land proves nothing and burns
              // the quota. Keep the metadata, ACK the bundle, and ask the room for the file instead.
              syncLog.warn(`Attachment "${attachment.name}" did not reach the disk; asking the room for the bytes again`);
              engine.missingAttachments.add(attachment.id);
              // The staged import has not reached `getItems` yet, so ask for this file directly.
              engine.requestAttachmentBytes(attachment);
              hasItemsChanged = true;
              missingAttachmentData = true;
            }
          } else {
            syncLog.warn(`Ignored attachment change without usable bytes: ${ch.id}`);
          }
        } else if (ch.type === 'attachment_request' && ch.action === 'upsert') {
          const request = ch.payload as Partial<AttachmentRequestPayload> | undefined;
          if (request?.attachmentId) {
            // Only a device that still holds the file answers; for everyone else this is noise,
            // so missing bytes are ignored instead of logged on every peer.
            if (await vault().hasAttachmentBytes(request.attachmentId, request.relativePath ?? '')) {
              engine.forceAttachmentSend(request.attachmentId);
            }
          }
        } else if (ch.type === 'workspace' && ch.payload) {
          // The prompt and the persona are not read from here: they arrive on their own channel,
          // where a stale copy of this bundle cannot overwrite a newer edit.
          workspaceState = withoutAssistantPrompt(ch.payload as WorkspaceState);
          hasWorkspaceChanged = true;
        } else if (ch.type === 'assistant_prompt' && ch.payload) {
          const merged = mergeAssistantPrompt(workspaceState ?? vault().getWorkspaceState(),
                                               ch.payload as AssistantPromptPayload);
          if (merged) {
            workspaceState = merged;
            hasWorkspaceChanged = true;
          }
        } else if (ch.type === 'memory') {
          if (ch.action === 'upsert' && ch.payload) {
            const incoming = ch.payload as MemoryItem;
            if (incoming.id) {
              const current = vault().getMemory();
              const existing = current.find((fact) => fact.id === incoming.id);
              // Wall-clock LWW, like a note, plus one extra rule: a fact this device already
              // forgot must not come back on a stale copy, so its tombstone outranks it.
              const staleAgainstTombstone =
                existing?.deletedAt !== undefined && (incoming.updatedAt ?? 0) <= existing.deletedAt;
              if (!staleAgainstTombstone && (!existing || (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0))) {
                const next = existing
                  ? current.map((fact) => (fact.id === incoming.id ? incoming : fact))
                  : [...current, incoming];
                vault().saveMemory(next, 'remote');
                hasMemoryChanged = true;
              }
            }
          } else if (ch.action === 'delete') {
            const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
            const current = vault().getMemory();
            const existing = current.find((fact) => fact.id === ch.id);
            if (existing && (existing.deletedAt ?? 0) < deletedAt) {
              vault().saveMemory(
                current.map((fact) => (fact.id === ch.id ? { ...fact, deletedAt } : fact)),
                'remote'
              );
              hasMemoryChanged = true;
            }
          }
        } else if (ch.type === 'draft') {
          // The stamp of the moment this vault deleted that draft: a peer replaying the old text
          // must lose it, and a deletion has to outlive the restart that follows it.
          const lastDeletedAt = loadDraftTombstone(engine.bookkeeping, ch.id);

          if (ch.id.startsWith('composer:')) {
            const folder = ch.id.slice('composer:'.length);
            if (ch.action === 'upsert' && ch.payload) {
              const incoming = ch.payload as ComposerDraft;
              if ((incoming.updatedAt ?? 0) <= lastDeletedAt) {
                // The sender still holds a copy this vault deleted: repeating the delete is what
                // makes it drop the draft instead of replaying it on every catch-up.
                engine.reassertDraftDeletion(folder, lastDeletedAt, incoming.updatedAt ?? 0);
                syncLog.debug(`Ignored stale composer draft for "${folder}" (updatedAt <= deletedAt)`);
                continue;
              }
              const existing = vault().getComposerDraft(folder);
              if (!existing || (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
                vault().saveComposerDraft(folder, incoming, 'remote');
                hasDraftsChanged = true;
                syncLog.info(`Applied remote composer draft for folder "${folder}" (${incoming.content.length} chars)`);
              }
            } else if (ch.action === 'delete') {
              const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
              saveDraftTombstone(engine.bookkeeping, ch.id, deletedAt);
              vault().deleteComposerDraft(folder, 'remote');
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
              const existing = vault().getFullscreenDraft(itemId);
              if (!existing || (incoming.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
                vault().saveFullscreenDraft(itemId, incoming, 'remote');
                hasDraftsChanged = true;
                syncLog.info(`Applied remote fullscreen draft for item "${itemId}" ("${incoming.title}")`);
              }
            } else if (ch.action === 'delete') {
              const deletedAt = (ch.payload as { deletedAt?: number } | undefined)?.deletedAt ?? Date.now();
              saveDraftTombstone(engine.bookkeeping, ch.id, deletedAt);
              vault().clearFullscreenDraft(itemId, 'remote');
              hasDraftsChanged = true;
              syncLog.info(`Cleared remote fullscreen draft for item "${itemId}"`);
            }
          }
        }
      }

      if (missingAttachmentData) {
        // One full-vault pass per session; the per-file cooldown keeps it from asking daily.
        void engine.requestMissingAttachments();
      }

      if (generation !== engine.initGeneration) {
        settleStatus(engine);
        return;
      }
      if (changedTombstones.size > 0) {
        const latest = loadTombstones(engine.bookkeeping);
        for (const id of changedTombstones) {
          // An attachment import can yield to a local delete or restore. Do not replace that intent.
          if (latest[id] !== originalTombstones[id]) continue;
          if (tombstones[id] === undefined) delete latest[id];
          else latest[id] = tombstones[id];
        }
        saveTombstones(engine.bookkeeping, latest);
      }

      const staged = hasItemsChanged || hasFoldersChanged || hasWorkspaceChanged || hasDraftsChanged || hasMemoryChanged;
      if (itemDeletes.length > 0) syncLog.debug('Legacy bundle: explicit note deletes evaluated', {
        bundleId: bundle.bundleId, stagedDeletes: removedIds.length, itemDeletes,
      });

      engine.appliedBundleIds.add(bundle.bundleId);
      if (engine.batchUpdating) engine.status.initialSync.processed++;
      if (staged) {
        // The ACK belongs to the write, not to the merge: the flush sends it once the buffer
        // is on disk, so a failed write leaves the bundle pending and the relay re-delivers it.
        engine.stageImport(currentItems, currentFolders, removedIds, hasWorkspaceChanged ? workspaceState : undefined, {
          items: hasItemsChanged,
          folders: hasFoldersChanged,
          workspace: hasWorkspaceChanged,
          drafts: hasDraftsChanged,
          memory: hasMemoryChanged,
        }, bundle.bundleId);
      } else {
        // A delete of an already-absent note may only have a journal write to wait for.
        try {
          await requireSyncSectionFlushed();
        } catch (error) {
          engine.appliedBundleIds.delete(bundle.bundleId);
          throw error;
        }
        if (generation !== engine.initGeneration) return;
        await engine.sendAck(bundle.bundleId);
        if (generation !== engine.initGeneration) {
          settleStatus(engine);
          return;
        }
      }

      // Publish the next comparison after processing this bundle.
      engine.manifestPostedRoot = null;
      engine.status.lastSyncTime = new Date().toLocaleTimeString();
      engine.status.state = engine.batchUpdating ? 'syncing' : 'connected';
      engine.notify();
    } catch (err) {
      syncLog.error('Error applying incoming bundle:', err);
      if (generation !== engine.initGeneration) return;
      engine.status.state = 'error';
      engine.status.error = 'Не удалось расшифровать или сохранить изменения';
      engine.notify();
      throw err;
    }
}

/** The workspace without the assistant's words: that channel owns them. */
function withoutAssistantPrompt(state: WorkspaceState): WorkspaceState {
  const { aiPrompt: _prompt, aiPersona: _persona, aiPersonaEnabled: _enabled,
          aiPromptAt: _promptAt, aiPersonaAt: _personaAt, ...rest } = state;
  return rest;
}

/**
 * Field-by-field last-writer-wins for the assistant's words.
 *
 * Two devices edit the same prompt: the older copy must lose, whichever device it came from.
 * Returns the merged state, or null when the incoming copy is not newer anywhere.
 */
export function mergeAssistantPrompt(base: WorkspaceState, incoming: AssistantPromptPayload): WorkspaceState | null {  const next: WorkspaceState = { ...base };
  let changed = false;
  const promptAt = Number(incoming.promptAt) || 0;
  const personaAt = Number(incoming.personaAt) || 0;
  if (promptAt > (base.aiPromptAt ?? 0) && typeof incoming.prompt === 'string') {
    next.aiPrompt = incoming.prompt;
    next.aiPromptAt = promptAt;
    changed = true;
  }
  if (personaAt > (base.aiPersonaAt ?? 0)) {
    if (typeof incoming.persona === 'string') next.aiPersona = incoming.persona;
    next.aiPersonaEnabled = incoming.personaEnabled === true;
    next.aiPersonaAt = personaAt;
    changed = true;
  }
  return changed ? next : null;
}
