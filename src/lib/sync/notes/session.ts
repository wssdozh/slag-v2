// Negotiate once per connection generation, then bind the replica to that vault and room.
import type { VaultPort } from '../../storage/port';
import { NoteChannel } from './channel.ts';
import { loadNoteJournal } from './persistence.ts';
import { NoteReplica } from './replica.ts';
import type { NoteConflict } from './replica.ts';
import { deriveNoteKeys } from './wire.ts';

export async function openNoteSession(options: {
  serverUrl: string; roomId: string; vaultId: string; key: CryptoKey; signal: AbortSignal;
  port: VaultPort; headers: (json: boolean) => Record<string, string>; readOnly: boolean;
  sendLive: (message: string) => boolean; onProgress: () => void; onError: (error: unknown) => void;
  onApplied: (note: import('../../storage/noteRegistry').AcceptedNote) => void;
  onResolution: (counts: { merged: number; conflicts: number }) => void;
  storeConflict: (conflict: NoteConflict) => Promise<void>;
}) {
  const channel = new NoteChannel(options);
  const status = await channel.status();
  options.signal.throwIfAborted();
  if (status.mode === 'legacy') return null;
  if (status.mode === 'frozen') throw new Error('Синхронизация хранилища приостановлена для обновления');
  if (!options.port.isHydrated()) throw new Error('Хранилище ещё читается с диска');
  const { readNoteRegistry, writeNoteRegistry, applyAcceptedNote, subscribeNoteIntents } = options.port;
  if (!readNoteRegistry || !writeNoteRegistry || !applyAcceptedNote || !subscribeNoteIntents) {
    throw new Error('Локальное хранилище не поддерживает новый протокол заметок');
  }
  const keys = await deriveNoteKeys(options.key, options.roomId);
  const initial = loadNoteJournal(await readNoteRegistry.call(options.port), options.roomId, status.generation);
  options.signal.throwIfAborted();
  const replica = new NoteReplica({ ...options, channel, keys, generation: status.generation, room: options.roomId,
    save: (journal) => writeNoteRegistry.call(options.port, { version: 1, room: options.roomId, generation: status.generation, journal }),
    apply: async (note) => {
      options.signal.throwIfAborted();
      await applyAcceptedNote.call(options.port, note);
      if (!options.signal.aborted) options.onApplied(note);
    },
  }, initial);
  const unsubscribe = subscribeNoteIntents.call(options.port, (changes) => replica.record(changes));
  options.signal.addEventListener('abort', unsubscribe, { once: true });
  return { replica, generation: status.generation };
}
