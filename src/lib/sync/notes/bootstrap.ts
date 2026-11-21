// Runs on a trusted client (or local migration tool), never at the relay with decrypted notes.
import type { FolderMeta, SlagAttachment, SlagItem } from '../../../types/index.ts';
import { relayNote, sameNote } from './merge.ts';
import { readSharedBody } from './sharedBody.ts';
import { FOLDER_TREE_ID, opaqueNoteId, registryMediaIds, sealFolderTree, sealNote, sealSharedRecord } from './wire.ts';
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

type PrepareMedia = (attachment: SlagAttachment) => Promise<string>;

export async function sealBootstrap(keys: NoteKeys, room: string, generation: number, plan: ReturnType<typeof planBootstrap>, reviewedShared: readonly unknown[] = [], prepareMedia?: PrepareMedia): Promise<NoteOp[]> {
  if (plan.blockers.length) throw new Error('Миграция заблокирована: есть непроверенные копии');
  const operations: NoteOp[] = [];
  const prepare = async (attachments: SlagAttachment[]) => {
    if (!attachments.length) return { attachments };
    if (!prepareMedia) throw new Error('Attachments require a reviewed media seed');
    const sealed = await Promise.all(attachments.map(async (a) => ({ ...a, registryBlobId: await prepareMedia(a) })));
    return { attachments: sealed, mediaIds: registryMediaIds(sealed) };
  };
  for (const [id, item] of plan.candidates) {
    const { attachments, mediaIds } = await prepare(item?.attachments ?? []);
    operations.push(await sealNote(keys, room, generation, { noteId: await opaqueNoteId(keys, id),
      opId: crypto.randomUUID(), baseRevision: 0, kind: item === null ? 'delete' : 'create', ...(mediaIds ? { mediaIds } : {}) },
    id, item && { ...item, attachments }));
  }
  const ids = new Set(plan.candidates.keys());
  for (const entry of reviewedShared) {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || typeof entry.id !== 'string'
        || !('shared' in entry) || ids.has(entry.id)) throw new Error('Invalid or duplicate reviewed shared record');
    ids.add(entry.id);
    const kind = entry.shared === null ? 'delete' : 'create';
    const body = readSharedBody(entry.id, entry.shared, kind);
    const shared = body.shared;
    const prepared = shared && typeof shared === 'object' && 'attachments' in shared && shared.attachments ? await prepare(shared.attachments) : undefined;
    operations.push(await sealSharedRecord(keys, room, generation, { noteId: await opaqueNoteId(keys, body.id),
      opId: crypto.randomUUID(), baseRevision: 0, kind, ...(prepared?.mediaIds ? { mediaIds: prepared.mediaIds } : {}) },
    body.id, prepared && shared && typeof shared === 'object' ? { ...shared, attachments: prepared.attachments } : shared));
  }
  return operations;
}

/** The operator supplies the reviewed tree; snapshot absence never implies a folder deletion. */
export async function sealFolderRegistrySeed(keys: NoteKeys, room: string, generation: number,
  plan: ReturnType<typeof planBootstrap>, reviewedFolders: FolderMeta[], reviewedShared?: readonly unknown[], prepareMedia?: PrepareMedia) {
  const ops = await sealBootstrap(keys, room, generation, plan, reviewedShared, prepareMedia);
  const folderTreeId = await opaqueNoteId(keys, FOLDER_TREE_ID);
  ops.push(await sealFolderTree(keys, room, generation, { noteId: folderTreeId, opId: crypto.randomUUID(),
    baseRevision: 0, kind: 'create' }, reviewedFolders));
  return { room, generation, folderTreeId, ops };
}
