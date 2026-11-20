// Negotiate once per connection generation, then bind the replica to that vault and room.
import type { VaultPort } from '../../storage/port';
import { NoteChannel } from './channel.ts';
import { enrolledFolderTree, enrolledNoteGeneration, loadNoteJournal } from './persistence.ts';
import { NoteReplica } from './replica.ts';
import type { NoteConflict } from './replica.ts';
import { deriveNoteKeys, FOLDER_TREE_ID } from './wire.ts';

export async function openNoteSession(options: {
  serverUrl: string; roomId: string; vaultId: string; key: CryptoKey; signal: AbortSignal;
  port: VaultPort; headers: (json: boolean) => Record<string, string>; readOnly: boolean;
  sendLive: (message: string) => boolean; onProgress: () => void; onError: (error: unknown) => void;
  onApplied: (note: import('../../storage/noteRegistry').AcceptedNote) => void;
  onResolution: (counts: { merged: number; conflicts: number }) => void;
  storeConflict: (conflict: NoteConflict) => Promise<void>;
  hasPendingLegacyNotes: (folderTree: boolean) => boolean;
}, captureOnly = false) {
  const localVaultId = options.port.getCurrentVault().id;
  const assertScope = () => {
    options.signal.throwIfAborted();
    if (options.port.getCurrentVault().id !== localVaultId) throw new Error('Vault changed during note sync');
  };
  const channel = new NoteChannel(options);
  const status = captureOnly ? undefined : await channel.status();
  assertScope();
  if (status?.mode === 'legacy') return null;
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
  const { applyAcceptedFolderTree, subscribeFolderTreeIntents } = options.port;
  if (folderTree && (!applyAcceptedFolderTree || !subscribeFolderTreeIntents)) {
    throw new Error('Локальное хранилище не поддерживает реестр папок');
  }
  // A legacy outbox has no authoritative base revision. Replaying it would silently promote a
  // possibly stale copy; pulling over it would hide the very edit that stopped migration.
  if (!captureOnly && !options.readOnly && options.hasPendingLegacyNotes(folderTree)) {
    throw new Error('В старой очереди остались неподтверждённые правки. Синхронизация приостановлена до их проверки');
  }
  const save = async (journal: typeof initial) => {
    assertScope();
    await writeNoteRegistry.call(options.port, { version: 1, room: options.roomId, generation,
      ...(folderTree ? { folderTree: true } : {}), journal });
  };
  if (!captureOnly && (enrolledNoteGeneration(stored, options.roomId) !== generation
      || enrolledFolderTree(stored, options.roomId, generation) !== folderTree)) await save(initial);
  assertScope();
  // A crash can happen after the journal commit but before the optimistic tree reaches
  // state.json. Restore the journal projection before subscribing to another local edit.
  if (folderTree && applyAcceptedFolderTree) {
    const tree = initial.pending.findLast((intent) => intent.id === FOLDER_TREE_ID)?.item
      ?? initial.confirmed[FOLDER_TREE_ID]?.item;
    if (Array.isArray(tree)) await applyAcceptedFolderTree.call(options.port, tree);
    assertScope();
  }
  let verified = !captureOnly;
  const requireVerified = () => {
    assertScope();
    if (!verified) throw new Error('Релей ещё не подтвердил поколение реестра');
  };
  const replica = new NoteReplica({ ...options, keys, generation, room: options.roomId,
    channel: {
      events: async (...args) => { requireVerified(); return channel.events(...args); },
      heads: async (...args) => { requireVerified(); return channel.heads(...args); },
      send: async (...args) => { requireVerified(); return channel.send(...args); },
    },
    sendLive: (message) => verified && options.sendLive(message),
    save,
    storeConflict: async (conflict) => {
      assertScope();
      await options.storeConflict(conflict);
    },
    applyFolderTree: folderTree && applyAcceptedFolderTree ? async (folders) => {
      requireVerified();
      await applyAcceptedFolderTree.call(options.port, folders);
    } : undefined,
    apply: async (note) => {
      requireVerified();
      await applyAcceptedNote.call(options.port, note);
      if (!options.signal.aborted) options.onApplied(note);
    },
  }, initial);
  const unsubscribe = subscribeNoteIntents.call(options.port, (changes) => replica.record(changes));
  const unsubscribeFolders = folderTree && subscribeFolderTreeIntents
    ? subscribeFolderTreeIntents.call(options.port, (folders, previous) => replica.recordFolderTree(folders, previous)) : undefined;
  options.signal.addEventListener('abort', () => { unsubscribe(); unsubscribeFolders?.(); }, { once: true });
  return { replica, generation, folderTree, verifyEnrollment: async (readOnly: boolean) => {
    const live = await channel.status();
    assertScope();
    if (live.mode !== 'registry' || live.generation !== generation || (live.folderTree === true) !== folderTree) {
      throw new Error('Режим или поколение реестра изменились; локальная очередь сохранена');
    }
    if (!readOnly && options.hasPendingLegacyNotes(folderTree)) throw new Error('В старой очереди остались неподтверждённые правки');
    replica.setReadOnly(readOnly);
    verified = true;
  } };
}
