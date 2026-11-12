// Queues unsent sync operations per vault, compacting repeats of the same entity.
import type { SyncOperation } from '../entities/types';

function keyFor(vaultId: string): string {
  return `slag_sync_outbox_${vaultId}`;
}

function load(vaultId: string): SyncOperation[] {
  try {
    const raw = localStorage.getItem(keyFor(vaultId));
    return raw ? (JSON.parse(raw) as SyncOperation[]) : [];
  } catch {
    return [];
  }
}

function save(vaultId: string, ops: SyncOperation[]): void {
  try {
    localStorage.setItem(keyFor(vaultId), JSON.stringify(ops));
  } catch {
    // quota exceeded fallback
  }
}

export class Outbox {
  private readonly vaultId: string;

  constructor(vaultId: string) {
    this.vaultId = vaultId;
  }

  public enqueue(op: SyncOperation): void {
    const ops = load(this.vaultId);
    // Compaction: if operation exists for same entity, replace or update
    const idx = ops.findIndex((o) => o.kind === op.kind && o.id === op.id);
    if (idx >= 0) {
      ops[idx] = op;
    } else {
      ops.push(op);
    }
    save(this.vaultId, ops);
  }

  public pending(): SyncOperation[] {
    return load(this.vaultId);
  }

  public markSynced(opIds: string[]): void {
    if (opIds.length === 0) return;
    const syncedSet = new Set(opIds);
    const remaining = load(this.vaultId).filter((op) => !syncedSet.has(op.opId));
    save(this.vaultId, remaining);
  }

  public clear(): void {
    localStorage.removeItem(keyFor(this.vaultId));
  }
}
