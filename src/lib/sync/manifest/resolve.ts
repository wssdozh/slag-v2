// What to do with the notes the room says it does not have.
//
// `report` means a full resend against this same peer state already happened: the neighbour had the
// bytes and still has no such leaf, which in practice is a tombstone of its own — it deleted the
// note earlier and its LWW rule keeps the note out. Sync may not delete on a guess, so this is not
// "delete": it is the trash, one small batch, and only for leaves that were already on the wire
// before that resend. A note edited afterwards was never in front of the neighbour and is left
// alone — that is the difference between "he refused it" and "he has not seen it yet".
import { vault } from '../../storage/port';
import type { DriftReport, Manifest } from '../../vault/integrity/types';
import type { SyncEngine } from '../syncEngine';
import type { ManifestDecision, PeerManifest } from './channel';
import { readManifestAutoResolve } from './prefs';

/** Notes the neighbour can plausibly have refused in one pass. More than this is not a stray note. */
export const RESOLVE_MAX = 8;

/** And never a sizeable slice of the vault: that is a broken replica, not a stale note. */
const RESOLVE_SHARE = 0.05;

export interface ResolveInput {
  /** What the comparison found; `extra` is the side this device holds alone. */
  drift: DriftReport | null;
  /** When the last full resend went out, ms. `null` before the first one. */
  resentAt: number | null;
  /** `updatedAt` for every note this device holds, by id. */
  updatedAt: Map<string, number>;
  /** How many leaves this device published: the denominator of the share check. */
  leaves: number;
  enabled: boolean;
}

/**
 * Ids to move to the trash. Empty is the normal answer: nothing enabled, nothing refused, too much
 * to be a stray note, or nothing old enough to have been in the resend.
 */
export function decideResolve(input: ResolveInput): string[] {
  const resentAt = input.resentAt;
  if (!input.enabled || resentAt === null || !input.drift) return [];
  const extra = input.drift.extra;
  if (extra.length === 0 || extra.length > RESOLVE_MAX) return [];
  if (extra.length > 2 && extra.length > input.leaves * RESOLVE_SHARE) return [];
  return extra.filter((id) => {
    const at = input.updatedAt.get(id);
    return at !== undefined && at < resentAt;
  });
}

/**
 * The ids worth the trash after a `report`, with this device's state already gathered.
 *
 * A peer that sent no leaves names no note: the comparison then says nothing about notes, and
 * acting on that guess is how a vault loses them. A peer with leaves is one the resend reached,
 * so `decideResolve` can tell a refusal from a note that arrived late.
 */
export function resolveRejected(
  engine: SyncEngine,
  local: Manifest,
  decision: ManifestDecision,
): string[] {
  const peer: PeerManifest | null = decision.peer;
  if (peer === null || peer.leaves === undefined) return [];
  return decideResolve({
    drift: decision.drift,
    resentAt: engine.manifestResentAt,
    updatedAt: new Map(vault().getItems().map((item) => [item.id, item.updatedAt ?? 0])),
    leaves: Object.keys(local.leaves).length,
    enabled: readManifestAutoResolve(),
  });
}
