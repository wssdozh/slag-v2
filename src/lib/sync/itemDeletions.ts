// Which notes a push announces as gone.
//
// A deletion is an event with a witness: the trash moved the note, the disk watcher saw the file
// vanish, a peer sent the tombstone. It is never a fact about a short list — the index is empty for
// the first second of every start, and reading that as "everything was deleted" is what emptied
// three devices at once on 2026-11-18. `syncedIds` minus the current items used to answer this
// question by subtraction; nothing answers it by subtraction any more.
//
// Pure on purpose, like `tombstones.ts`: `node --test` reads this file as is.
import type { SyncOperation } from './entities/types.ts';

export interface ItemDeletion {
  id: string;
  deletedAt: number;
}

/**
 * The note deletions the outbox is holding, one entry per id, the later stamp winning.
 *
 * Both doors into a vanished note leave an op — `trashItem` for a note the person deleted, the disk
 * watcher for one deleted behind the app's back — so the queue is the whole list, and every entry
 * on it is something that demonstrably happened. A note that came back before the push enqueued its
 * upsert, and the outbox compacts that per entity, so a restored note is not deleted here.
 */
export function deletionsFromOutbox(ops: readonly SyncOperation[]): ItemDeletion[] {
  const byId = new Map<string, number>();
  for (const op of ops) {
    if (op.kind !== 'item' || op.action !== 'delete') continue;
    byId.set(op.id, Math.max(byId.get(op.id) ?? 0, op.timestamp));
  }
  return [...byId].map(([id, deletedAt]) => ({ id, deletedAt }));
}
