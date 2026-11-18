// Queues unsent sync operations per vault, compacting repeats of the same entity.
//
// The queue is not a cache: a folder delete or a trash restore exists nowhere else once it left the
// UI, so it has to survive a restart. It rides the vault's `state.json` section like every other
// ledger, and the section writes are coalesced — a keystroke that enqueues one draft op is not a
// file write of its own, it joins whatever write is already on its way.
import type { SyncOperation } from '../entities/types';
import { loadOutbox, saveOutbox } from '../localBookkeeping';
import type { SyncScope } from '../localBookkeeping';

export class Outbox {
  private readonly scope: SyncScope;

  constructor(scope: SyncScope) {
    this.scope = scope;
  }

  public enqueue(op: SyncOperation): void {
    const ops = loadOutbox(this.scope.vaultId);
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
    saveOutbox(this.scope.vaultId, remaining);
  }

  public clear(): void {
    saveOutbox(this.scope.vaultId, []);
  }
}
