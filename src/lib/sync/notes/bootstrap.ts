// Runs on a trusted client (or local migration tool), never at the relay with decrypted notes.
import type { FolderMeta, SlagItem } from '../../../types/index.ts';
import { relayNote, sameNote } from './merge.ts';
import { FOLDER_TREE_ID, opaqueNoteId, sealFolderTree, sealNote } from './wire.ts';
import type { NoteKeys, NoteOp } from './wire.ts';

export interface BootstrapCopy {
  deviceId: string;
  hydrated: boolean;
  pendingIds: readonly string[];
  live: readonly SlagItem[];
  tombstones: readonly string[];
  trash: readonly SlagItem[];
}

/** Explicit, local decisions for a frozen snapshot set. No inference from timestamps. */
export function planBootstrap(requiredDevices: readonly string[], copies: readonly BootstrapCopy[], decisions: ReadonlyMap<string, 'delete' | 'keep'> = new Map()) {
  const blockers: { reason: string; id: string }[] = [];
  const candidates = new Map<string, SlagItem | null>();
  const matchingTrash = new Map<string, SlagItem[]>();
  const seen = new Set<string>();
  const required = new Set(requiredDevices);
  if (!required.size || required.has('') || required.size !== requiredDevices.length) {
    blockers.push({ reason: 'invalid_writer_list', id: '' });
  }
  const explicitDeletes = new Set(copies.flatMap((copy) => [...copy.tombstones]));
  for (const copy of copies) {
    if (!copy.hydrated || !required.has(copy.deviceId) || seen.has(copy.deviceId)) blockers.push({ reason: 'invalid_snapshot', id: copy.deviceId });
    seen.add(copy.deviceId);
    for (const id of copy.pendingIds) blockers.push({ reason: 'pending_intent', id });
    for (const item of copy.trash) {
      if (!explicitDeletes.has(item.id)) blockers.push({ reason: 'unproven_deletion', id: item.id });
      const alternatives = matchingTrash.get(item.id) ?? [];
      alternatives.push(item);
      matchingTrash.set(item.id, alternatives);
    }
    const liveIds = new Set<string>();
    for (const item of copy.live) {
      if (liveIds.has(item.id)) blockers.push({ reason: 'duplicate_live_id', id: item.id });
      liveIds.add(item.id);
      const previous = candidates.get(item.id);
      if (previous && !sameNote(previous, item)) blockers.push({ reason: 'divergent_live', id: item.id });
      else candidates.set(item.id, relayNote(item));
    }
  }
  for (const id of requiredDevices) if (!seen.has(id)) blockers.push({ reason: 'missing_device', id });
  const eligibleDecisions = new Set<string>();
  for (const id of explicitDeletes) {
    const live = candidates.get(id);
    // Equal trash proves the live copy is the deleted body, but cannot prove the absence of an
    // explicit restore. Require operator review rather than deciding by device clocks.
    const matchesTrash = live && matchingTrash.get(id)?.some((copy) => sameNote(copy, live));
    if (matchesTrash) eligibleDecisions.add(id);
    const decision = decisions.get(id);
    if (!live || (matchesTrash && decision === 'delete')) candidates.set(id, null);
    else if (!(matchesTrash && decision === 'keep')) blockers.push({ reason: matchesTrash ? 'review_restore_provenance' : 'delete_vs_live', id });
  }
  for (const id of decisions.keys()) {
    if (!eligibleDecisions.has(id)) {
      blockers.push({ reason: 'invalid_decision', id });
    }
  }
  return { blockers, candidates };
}

export async function sealBootstrap(keys: NoteKeys, room: string, generation: number, plan: ReturnType<typeof planBootstrap>): Promise<NoteOp[]> {
  if (plan.blockers.length) throw new Error('Миграция заблокирована: есть непроверенные копии');
  const operations: NoteOp[] = [];
  for (const [id, item] of plan.candidates) {
    operations.push(await sealNote(keys, room, generation, { noteId: await opaqueNoteId(keys, id),
      opId: crypto.randomUUID(), baseRevision: 0, kind: item === null ? 'delete' : 'create' }, id, item));
  }
  return operations;
}

/** The operator supplies the reviewed tree; snapshot absence never implies a folder deletion. */
export async function sealFolderRegistrySeed(keys: NoteKeys, room: string, generation: number,
  plan: ReturnType<typeof planBootstrap>, reviewedFolders: FolderMeta[]) {
  const ops = await sealBootstrap(keys, room, generation, plan);
  const folderTreeId = await opaqueNoteId(keys, FOLDER_TREE_ID);
  ops.push(await sealFolderTree(keys, room, generation, { noteId: folderTreeId, opId: crypto.randomUUID(),
    baseRevision: 0, kind: 'create' }, reviewedFolders));
  return { room, generation, folderTreeId, ops };
}
