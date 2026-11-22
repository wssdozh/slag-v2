// Registry state is scoped to a room generation; an old queue is never silently reset.
import type { NoteJournal } from './journal.ts';
import { emptyJournal } from './journal.ts';
import { isSharedRegistryId } from './sharedBody.ts';
import { checkedSharedBody, FOLDER_TREE_ID, isNoteItem, parseGroup, parseNoteHead, readFolderTree } from './wire.ts';
import type { NoteGroup, NoteOp } from './wire.ts';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local note registry');
  return value as Record<string, unknown>;
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validItem(value: unknown, id: string): boolean {
  if (isSharedRegistryId(id)) {
    checkedSharedBody(id, value === null ? null : object(value).shared, value === null ? 'delete' : 'update');
    return true;
  }
  if (id === FOLDER_TREE_ID) {
    readFolderTree(value, 'update');
    return true;
  }
  return value === null || (isNoteItem(value) && value.id === id);
}

function validateBase(value: unknown, id: string) {
  const base = object(value);
  if (!integer(base.revision) || (!(id === FOLDER_TREE_ID && base.revision === 0 && base.item === null) && !validItem(base.item, id))
      || (base.since !== undefined && (!integer(base.since) || !base.since || base.since > base.revision || !isNoteItem(base.item)))
      || (base.intentId !== undefined && (typeof base.intentId !== 'string' || !base.intentId))) {
    throw new Error('Invalid persisted note base');
  }
}

export function hasSharedRegistryEnrollment(value: unknown): boolean {
  if (value === undefined) return false;
  const envelope = object(value);
  if (typeof envelope.room !== 'string' || !envelope.room) throw new Error('Invalid local note registry room');
  enrolledNoteGeneration(value, envelope.room);
  if (envelope.sharedRecords !== undefined && envelope.sharedRecords !== true) throw new Error('Invalid shared registry capability');
  return envelope.sharedRecords === true;
}

export function enrolledNoteGeneration(value: unknown, room: string): number | undefined {
  if (value === undefined) return;
  const envelope = object(value);
  if (envelope.version !== 1 || !integer(envelope.generation) || envelope.generation === 0) {
    throw new Error('Invalid local note registry enrollment');
  }
  if (envelope.room === room) return envelope.generation;
}

export function enrolledFolderTree(value: unknown, room: string, generation: number): boolean {
  return enrolledNoteGeneration(value, room) === generation && object(value).folderTree === true;
}

export function loadNoteJournal(value: unknown, room: string, generation: number): NoteJournal {
  if (value === undefined) return emptyJournal();
  const envelope = object(value);
  if (envelope.version !== 1) throw new Error('Unknown local note registry version');
  const state = object(envelope.journal);
  if (!integer(state.cursor) || !Array.isArray(state.pending)) throw new Error('Invalid local note registry cursor');
  for (const [id, base] of Object.entries(object(state.confirmed))) validateBase(base, id);
  const conflicts = state.conflicts ?? [];
  if (!Array.isArray(conflicts)) throw new Error('Invalid local note conflicts');
  const conflictIds = new Set<string>();
  const conflictGroups = new Map<string, { noteId: string; group: NoteGroup }[]>();
  for (const raw of conflicts) {
    const entry = object(raw);
    const { intentId, noteId, kind, item, revision, fields, at } = entry;
    if (typeof intentId !== 'string' || !intentId || conflictIds.has(intentId) || typeof noteId !== 'string' || !noteId
        || (kind !== 'create' && kind !== 'update' && kind !== 'delete' && kind !== 'restore')
        || !validItem(item, noteId) || (kind === 'delete') !== (item === null) || !integer(revision) || !integer(at)
        || !Array.isArray(fields) || !fields.length || !fields.every((field: unknown) => typeof field === 'string')) {
      throw new Error('Invalid persisted note conflict');
    }
    conflictIds.add(intentId);
    if (entry.folderGroup !== undefined) {
      if (isSharedRegistryId(noteId)) throw new Error('Invalid persisted folder conflict member');
      const group = parseGroup(entry.folderGroup);
      const members = conflictGroups.get(group.id);
      if (members) members.push({ noteId, group });
      else conflictGroups.set(group.id, [{ noteId, group }]);
    }
  }
  for (const members of conflictGroups.values()) {
    if (new Set(members.map(({ noteId }) => noteId)).size !== members.length
        || members.at(-1)?.noteId !== FOLDER_TREE_ID
        || members.some(({ group }, index) => group.index !== index || group.size !== members.length)) {
      throw new Error('Incomplete persisted folder conflict');
    }
  }
  if (envelope.room !== room || envelope.generation !== generation) {
    if (state.pending.length || conflicts.length) throw new Error('В предыдущей комнате остались неподтверждённые правки или конфликты');
    return emptyJournal();
  }
  const chain = new Map<string, string>();
  const seen = new Set<string>();
  const groups = new Map<string, { index: number; id: string; group: NoteGroup; op?: NoteOp }[]>();
  for (const [index, raw] of state.pending.entries()) {
    const entry = object(raw);
    const { id, intentId, kind, predecessor, predecessorConflict, item, folderGroup } = entry;
    if (typeof id !== 'string' || !id || typeof intentId !== 'string' || !intentId || seen.has(intentId)
        || (kind !== 'create' && kind !== 'update' && kind !== 'delete' && kind !== 'restore')
        || !validItem(item, id) || (kind === 'delete') !== (item === null)
        || (entry.source !== undefined && (typeof entry.source !== 'string' || !['app', 'disk-watch', 'cold-recovery', 'retry'].includes(entry.source)))
        || (predecessorConflict !== undefined && (predecessorConflict !== true || predecessor !== undefined || entry.attempt !== undefined))
        || [entry.provenBase, entry.provenPredecessor, entry.unverifiedBase].some((flag) => flag !== undefined && flag !== true)
        || (entry.provenBase !== undefined && entry.base === undefined)
        || (entry.optimisticBase !== undefined && (entry.provenBase !== true || !isNoteItem(entry.optimisticBase) || entry.optimisticBase.id !== id))
        || predecessor !== chain.get(id)) throw new Error('Invalid persisted note intent');
    seen.add(intentId);
    chain.set(id, intentId);
    if (entry.base !== undefined) validateBase(entry.base, id);
    let parsed: NoteOp | undefined;
    if (entry.attempt !== undefined) {
      const attempt = object(entry.attempt);
      if (attempt.observedHead !== undefined && (!integer(attempt.observedHead) || attempt.observedHead > state.cursor)) {
        throw new Error('Invalid persisted note attempt room head');
      }
      const op = object(attempt.op);
      if (!integer(op.baseRevision)) throw new Error('Invalid persisted note attempt');
      parsed = parseNoteHead({ ...op, revision: op.baseRevision + 1 });
      if (!validItem(attempt.item, id) || (parsed.kind === 'delete') !== (attempt.item === null)
          || !Array.isArray(attempt.conflicts) || !attempt.conflicts.every((field: unknown) => typeof field === 'string')) {
        throw new Error('Invalid persisted note attempt');
      }
    }
    if (folderGroup !== undefined) {
      const group = parseGroup(folderGroup);
      if (isSharedRegistryId(id) || (id !== FOLDER_TREE_ID && kind !== 'update')) throw new Error('Invalid persisted folder group member');
      const member = { index, id, group, op: parsed };
      const members = groups.get(group.id);
      if (members) members.push(member);
      else groups.set(group.id, [member]);
    } else if (parsed?.group) throw new Error('Folder group attempt without its journal group');
  }
  for (const members of groups.values()) {
    const first = members[0];
    const attempted = members.some(({ op }) => op !== undefined);
    if (new Set(members.map(({ id }) => id)).size !== members.length
        || members.at(-1)?.id !== FOLDER_TREE_ID
        || members.some(({ index, group, op }, offset) => index !== first.index + offset
          || group.index !== offset || group.size !== members.length || (attempted
          && (!op?.group || op.group.id !== group.id || first.op?.opId !== group.id || op.group.index !== offset || op.group.size !== members.length)))
        || (attempted && (new Set(members.map(({ op }) => op?.noteId)).size !== members.length
          || new Set(members.map(({ op }) => op?.opId)).size !== members.length))) {
      throw new Error('Incomplete persisted folder group');
    }
  }
  return state as unknown as NoteJournal;
}
