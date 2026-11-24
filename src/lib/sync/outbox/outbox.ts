// Queues unsent sync operations per vault, compacting repeats of the same entity.
//
// The queue is not a cache: a folder delete or a trash restore exists nowhere else once it left the
// UI, so it has to survive a restart. It rides the vault's `state.json` section like every other
// ledger, and the section writes are coalesced — a keystroke that enqueues one draft op is not a
// file write of its own, it joins whatever write is already on its way.
import type { SyncOperation } from '../entities/types';
import { loadOutbox, loadTombstones, requireOutboxFlushed, saveOutbox, saveTombstones } from '../localBookkeeping';
import type { SyncScope } from '../localBookkeeping';

export class Outbox {
  private readonly scope: SyncScope;

  constructor(scope: SyncScope) {
    this.scope = scope;
  }

  public enqueue(op: SyncOperation): void {
    // A local delete guards against stale incoming copies immediately, not when a packet is ACKed.
    if ((op.kind === 'item' && op.action === 'delete') || (op.kind === 'trash' && op.action === 'restore')) {
      const tombstones = loadTombstones(this.scope);
      const previous = tombstones[op.id];
      if (op.kind === 'item' && op.timestamp > (previous ?? 0)) {
        tombstones[op.id] = op.timestamp;
        saveTombstones(this.scope, tombstones);
      } else if (op.kind === 'trash' && previous !== undefined) {
        delete tombstones[op.id];
        saveTombstones(this.scope, tombstones);
      }
    }
    const ops = loadOutbox(this.scope.vaultId).filter((previous) =>
      previous.id !== op.id || !(
        (op.kind === 'trash' && op.action === 'restore' && previous.kind === 'item' && previous.action === 'delete') ||
        (op.kind === 'item' && op.action === 'delete' && previous.kind === 'trash' && previous.action === 'restore')
      ));
    // Compaction: if operation exists for same entity, replace or update
    const idx = ops.findIndex((o) => o.kind === op.kind && o.id === op.id);
    if (idx >= 0) {
      ops[idx] = op;
    } else {
      ops.push(op);
    }
    saveOutbox(this.scope.vaultId, ops);
  }

  public pending(): SyncOperation[] {
    return loadOutbox(this.scope.vaultId);
  }

  public markSynced(opIds: string[]): void {
    if (opIds.length === 0) return;
    const syncedSet = new Set(opIds);
    const pending = loadOutbox(this.scope.vaultId);
    const remaining = pending.filter((op) => !syncedSet.has(op.opId));
    if (remaining.length === pending.length) return;
    // Upgrade path: a delete queued by an older client may not have a local tombstone yet.
    // Apply only acknowledged deletes still in the queue, never ones superseded by a restore.
    const tombstones = loadTombstones(this.scope);
    let changed = false;
    for (const op of pending) {
      if (syncedSet.has(op.opId) && op.kind === 'item' && op.action === 'delete' && op.timestamp > (tombstones[op.id] ?? 0)) {
        tombstones[op.id] = op.timestamp;
        changed = true;
      }
    }
    if (changed) saveTombstones(this.scope, tombstones);
    saveOutbox(this.scope.vaultId, remaining);
  }

  public async removeTransferred(opIds: string[]): Promise<void> {
    // A handoff is not an ACK from the legacy relay. Do not update its tombstone ledger.
    const transferred = new Set(opIds);
    saveOutbox(this.scope.vaultId, this.pending().filter(({ opId }) => !transferred.has(opId)));
    await requireOutboxFlushed(this.scope.vaultId);
  }

  public clear(): void {
    saveOutbox(this.scope.vaultId, []);
  }
}
