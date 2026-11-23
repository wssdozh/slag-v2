// Negotiate once per connection generation, then bind the replica to that vault and room.
import type { VaultPort } from '../../storage/port';
import { NoteChannel } from './channel.ts';
import { enrolledFolderTree, enrolledNoteGeneration, loadNoteJournal } from './persistence.ts';
import { NoteReplica } from './replica.ts';
import { isSharedRegistryId } from './sharedBody.ts';
import type { SharedBody } from './sharedBody.ts';
import { deriveNoteKeys, FOLDER_TREE_ID, registryAttachments } from './wire.ts';
import type { RegistryBody } from './wire.ts';

export async function openNoteSession(options: {
  serverUrl: string; roomId: string; vaultId: string; key: CryptoKey; signal: AbortSignal;
  port: VaultPort; headers: (json: boolean) => Record<string, string>; readOnly: boolean;
  sendLive: (message: string) => boolean; onProgress: () => void; onError: (error: unknown) => void;
  isLiveOpen?: () => boolean;
  onDeliveryChange?: () => void;
  log?: (event: string, data: Record<string, unknown>, warning?: boolean) => void;
  onStatus?: (status: import('./wire.ts').NoteStatus) => void;
  onApplied: (note: import('../../storage/noteRegistry').AcceptedNote) => void;
  hasPendingLegacyNotes: (folderTree: boolean, sharedRecords?: boolean) => boolean;
}, captureOnly = false) {
  const localVaultId = options.port.getCurrentVault().id;
  const assertScope = () => {
    options.signal.throwIfAborted();
    if (options.port.getCurrentVault().id !== localVaultId) throw new Error('Vault changed during note sync');
  };
  const supportsGroups = !!options.port.applyAcceptedFolderGroup;
  const { applyAcceptedShared, subscribeSharedIntents } = options.port;
  const supportsShared = !!(applyAcceptedShared && subscribeSharedIntents);
  const { readRegistryAttachment, writeAcceptedAttachment } = options.port;
  const supportsMedia = !!(readRegistryAttachment && writeAcceptedAttachment);
  const channel = new NoteChannel({ ...options, atomicGroups: supportsGroups, sharedRecords: supportsShared, registryMedia: supportsMedia });
  const status = captureOnly ? undefined : await channel.status();
  assertScope();
  if (status) options.onStatus?.(status);
  if (status?.mode === 'legacy') {
    const stored = await options.port.readNoteRegistry?.();
    assertScope();
    if (enrolledNoteGeneration(stored, options.roomId) !== undefined) {
      throw new Error('Релей переключил комнату обратно на старый протокол. Реестр и локальная очередь сохранены');
    }
    return null;
  }
  if (status?.mode === 'frozen') throw new Error('Синхронизация хранилища приостановлена для обновления');
  const { readNoteRegistry, writeNoteRegistry, applyAcceptedNote, subscribeNoteIntents } = options.port;
  if (!readNoteRegistry || !writeNoteRegistry || !applyAcceptedNote || !subscribeNoteIntents) {
    if (captureOnly) return null;
    throw new Error('Локальное хранилище не поддерживает новый протокол заметок');
  }
  const stored = await readNoteRegistry.call(options.port);
  assertScope();
  const generation = status?.generation ?? enrolledNoteGeneration(stored, options.roomId);
  if (generation === undefined) return null;
  if (!options.port.isHydrated()) throw new Error('Хранилище ещё читается с диска');
  const keys = await deriveNoteKeys(options.key, options.roomId);
  assertScope();
  const initial = loadNoteJournal(stored, options.roomId, generation);
  const folderTree = status ? status.folderTree === true : enrolledFolderTree(stored, options.roomId, generation);
  const wasAtomic = enrolledNoteGeneration(stored, options.roomId) === generation && (stored as { atomicGroups?: true }).atomicGroups === true;
  const atomicGroups = status ? status.atomicGroups === true : wasAtomic;
  if (wasAtomic && !atomicGroups) throw new Error('Релей отключил атомарные папочные операции; журнал сохранён');
  if (atomicGroups && !supportsGroups) throw new Error('Локальное хранилище не поддерживает атомарные папочные операции');
  const wasShared = enrolledNoteGeneration(stored, options.roomId) === generation && (stored as { sharedRecords?: true }).sharedRecords === true;
  const sharedRecords = status ? status.sharedRecords === true : wasShared;
  if (wasShared && !sharedRecords) throw new Error('Релей отключил общие записи; журнал сохранён');
  if (sharedRecords && !supportsShared) throw new Error('Локальное хранилище не поддерживает общие записи');
  const wasMedia = enrolledNoteGeneration(stored, options.roomId) === generation && (stored as { registryMedia?: true }).registryMedia === true;
  const registryMedia = status ? status.registryMedia === true : wasMedia;
  if (wasMedia && !registryMedia) throw new Error('Релей отключил реестр вложений; журнал сохранён');
  if (registryMedia && !supportsMedia) throw new Error('Локальное хранилище не поддерживает реестр вложений');
  const { applyAcceptedFolderTree, applyAcceptedFolderGroup, subscribeFolderTreeIntents } = options.port;
  if (folderTree && (!applyAcceptedFolderTree || !subscribeFolderTreeIntents)) {
    throw new Error('Локальное хранилище не поддерживает реестр папок');
  }
  // A legacy outbox has no authoritative base revision. Replaying it would silently promote a
  // possibly stale copy; pulling over it would hide the very edit that stopped migration.
  if (!captureOnly && !options.readOnly && options.hasPendingLegacyNotes(folderTree, sharedRecords)) {
    throw new Error('В старой очереди остались неподтверждённые правки. Синхронизация приостановлена до их проверки');
  }
  const save = async (journal: typeof initial) => {
    assertScope();
    await writeNoteRegistry.call(options.port, { version: 1, room: options.roomId, generation,
      ...(folderTree ? { folderTree: true } : {}), ...(atomicGroups ? { atomicGroups: true } : {}),
      ...(sharedRecords ? { sharedRecords: true } : {}), ...(registryMedia ? { registryMedia: true } : {}), journal });
  };
  if (!captureOnly && (enrolledNoteGeneration(stored, options.roomId) !== generation
      || enrolledFolderTree(stored, options.roomId, generation) !== folderTree || wasAtomic !== atomicGroups || wasShared !== sharedRecords || wasMedia !== registryMedia)) await save(initial);
  assertScope();
  // A crash can happen after the journal commit but before the optimistic tree reaches
  // state.json. Restore the journal projection before subscribing to another local edit.
  if (folderTree && applyAcceptedFolderTree) {
    const pendingTree = initial.pending.findLast((intent) => intent.id === FOLDER_TREE_ID && !intent.folderGroup)?.item;
    // Atomic groups project before checkpointing. A crash in between may leave a newer tree on disk.
    const tree = pendingTree ?? (atomicGroups ? undefined : initial.confirmed[FOLDER_TREE_ID]?.item);
    const interrupted = await options.port.hasIncompleteFolderProjection?.();
    assertScope();
    // Don't rewrite the disk's tree from the older checkpoint while its accepted group is replaying.
    if (!interrupted && Array.isArray(tree)) await applyAcceptedFolderTree.call(options.port, tree);
    assertScope();
  }
  if (sharedRecords && applyAcceptedShared) {
    // Replay the last durable local intent, including null. A missed write must not
    // turn the next edit into a proposal based on an older draft or setting.
    const pending = new Map<string, SharedBody>();
    for (const { id, item } of initial.pending) {
      if (!isSharedRegistryId(id)) continue;
      if (item !== null && !('shared' in item)) throw new Error('Invalid shared registry journal entry');
      pending.set(id, { id, shared: item?.shared ?? null });
    }
    for (const body of pending.values()) {
      assertScope();
      await applyAcceptedShared.call(options.port, body);
    }
    assertScope();
  }
  let verified = !captureOnly;
  const mediaErrors = new Set<string>();
  let applyingMedia = false;
  const requireVerified = () => {
    assertScope();
    if (!verified) throw new Error('Релей ещё не подтвердил поколение реестра');
  };
  const projectMedia = async (body: RegistryBody | SharedBody) => {
    const attachments = registryAttachments(body).filter(({ registryBlobId }) => registryBlobId !== undefined);
    if (!attachments.length) {
      mediaErrors.delete(body.id);
      return;
    }
    applyingMedia = true;
    options.onDeliveryChange?.();
    try {
      for (const attachment of attachments) {
        const write = options.port.writeAcceptedAttachment;
        if (!write) throw new Error('Хранилище не поддерживает запись вложений реестра');
        const bytes = await channel.downloadMedia(keys, generation, attachment.registryBlobId!);
        requireVerified();
        await write.call(options.port, attachment, bytes);
        requireVerified();
      }
      mediaErrors.delete(body.id);
    } catch (error) {
      mediaErrors.add(body.id);
      throw error;
    } finally {
      applyingMedia = false;
    }
  };
  const replica = new NoteReplica({ ...options, keys, generation, atomicGroups, room: options.roomId,
    trackDiskProjection: !!options.port.readRegistryNoteCopies,
    channel: {
      events: async (...args) => { requireVerified(); return channel.events(...args); },
      heads: async (...args) => { requireVerified(); return channel.heads(...args); },
      send: async (...args) => { requireVerified(); return channel.send(...args); },
    },
    sendLive: (message) => verified && options.sendLive(message),
    isLiveOpen: () => verified && options.isLiveOpen?.() === true,
    save,
    uploadAttachment: registryMedia && readRegistryAttachment ? async (attachment) => {
      requireVerified();
      const bytes = await readRegistryAttachment.call(options.port, attachment);
      requireVerified();
      return channel.uploadMedia(keys, generation, bytes, attachment.registryBlobId);
    } : undefined,
    applyFolderTree: folderTree && applyAcceptedFolderTree ? async (folders) => {
      requireVerified();
      await applyAcceptedFolderTree.call(options.port, folders);
    } : undefined,
    applyFolderGroup: folderTree && applyAcceptedFolderGroup ? async (notes, folders) => {
      requireVerified();
      for (const note of notes) await projectMedia(note);
      requireVerified();
      await applyAcceptedFolderGroup.call(options.port, notes, folders);
      if (!options.signal.aborted) for (const note of notes) options.onApplied(note);
    } : undefined,
    applyShared: sharedRecords && applyAcceptedShared ? async (body) => {
      requireVerified();
      await projectMedia(body);
      requireVerified();
      await applyAcceptedShared.call(options.port, body);
    } : undefined,
    apply: async (note) => {
      requireVerified();
      await projectMedia(note);
      requireVerified();
      await applyAcceptedNote.call(options.port, note);
      if (!options.signal.aborted) options.onApplied(note);
    },
  }, initial);
  const unsubscribe = subscribeNoteIntents.call(options.port, (changes) => replica.record(changes));
  const unsubscribeFolders = folderTree && subscribeFolderTreeIntents
    ? subscribeFolderTreeIntents.call(options.port, (folders, previous) => replica.recordFolderTree(folders, previous),
      atomicGroups ? (changes, folders, previous) => replica.recordFolderGroup(changes, folders, previous) : undefined) : undefined;
  const unsubscribeShared = sharedRecords && subscribeSharedIntents
    ? subscribeSharedIntents.call(options.port, (changes, applyLocal) => replica.recordSharedBatch(() => {
      assertScope();
      return changes();
    }, async () => {
      assertScope();
      await applyLocal();
    })) : undefined;
  options.signal.addEventListener('abort', () => { unsubscribe(); unsubscribeFolders?.(); unsubscribeShared?.(); }, { once: true });
  if (status) replica.noteRelayHead(status.head);
  return { replica, generation, folderTree, atomicGroups, sharedRecords, registryMedia,
    captureColdNoteEdits: () => replica.captureColdNoteEdits(async (ids) => {
      requireVerified();
      const copies = await options.port.readRegistryNoteCopies?.(ids) ?? [];
      requireVerified();
      return copies;
    }, (note, disk) => {
      assertScope();
      options.port.rememberNoteProjection?.(note, disk);
    }),
    get progress() {
      const progress = replica.progress;
      return { ...progress, relayHead: verified ? progress.relayHead : null,
        media: !registryMedia ? 'legacy' as const : applyingMedia ? 'applying' as const : mediaErrors.size ? 'error' as const
          : verified && progress.application === 'current' ? 'applied-through-cursor' as const : 'waiting' as const };
    },
    verifyEnrollment: async (readOnly: boolean) => {
    const live = await channel.status();
    assertScope();
    options.onStatus?.(live);
    if (live.mode !== 'registry' || live.generation !== generation || (live.folderTree === true) !== folderTree
        || (live.atomicGroups === true) !== atomicGroups || (live.sharedRecords === true) !== sharedRecords || (live.registryMedia === true) !== registryMedia) {
      throw new Error('Режим или поколение реестра изменились; локальная очередь сохранена');
    }
    if (!readOnly && options.hasPendingLegacyNotes(folderTree, sharedRecords)) throw new Error('В старой очереди остались неподтверждённые правки');
    replica.setReadOnly(readOnly);
    verified = true;
    replica.noteRelayHead(live.head);
  } };
}
