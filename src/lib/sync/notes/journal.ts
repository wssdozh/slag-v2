// Pure transitions for an ordered queue of local intentions; disk and network stay outside.
import type { FolderMeta, SlagItem } from '../../../types/index.ts';
import { DEFAULT_INBOX_FOLDER } from '../../../config/storage.ts';
import { sortFolders } from '../../vault/folderTree.ts';
import { equal, relayNote, sameNote } from './merge.ts';
import { FOLDER_TREE_ID, NOTE_BATCH_COUNT, readFolderTree } from './wire.ts';
import type { SharedValue } from './sharedBody.ts';
import type { NoteGroup, NoteOp } from './wire.ts';
import type { NoteMutation } from '../../storage/noteRegistry';

export type JournalKind = 'create' | 'update' | 'delete' | 'restore';
export type RegistryValue = SlagItem | FolderMeta[] | SharedValue | null;
export interface NoteBase { revision: number; item: RegistryValue }

export function sameRegistryValue(a: RegistryValue, b: RegistryValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return equal(sortFolders(a, DEFAULT_INBOX_FOLDER), sortFolders(b, DEFAULT_INBOX_FOLDER));
  }
  if ((a && 'shared' in a) || (b && 'shared' in b)) return equal(a, b);
  return !Array.isArray(a) && !Array.isArray(b) && sameNote(a, b);
}
export interface JournalAttempt {
  op: NoteOp;
  observedHead?: number;
  item: RegistryValue;
  conflicts: string[];
}
export interface NoteIntent {
  intentId: string;
  id: string;
  kind: JournalKind;
  item: RegistryValue;
  /** Undefined only when the device has not obtained this note's accepted base. */
  base?: NoteBase;
  /** If present, this edit was made over the optimistic predecessor, not the remote head. */
  predecessor?: string;
  /** This edit depended on a local operation that was not applied. */
  predecessorConflict?: true;
  attempt?: JournalAttempt;
  /** Contiguous in the journal; the folder-tree member is last. */
  folderGroup?: NoteGroup;
}
export interface NoteConflict {
  intentId: string;
  noteId: string;
  kind: JournalKind;
  revision: number;
  item: RegistryValue;
  fields: string[];
  at: number;
  folderGroup?: NoteGroup;
}

export interface NoteJournal {
  cursor: number;
  confirmed: Record<string, NoteBase>;
  pending: NoteIntent[];
  /** Optional when opening journals written by earlier clients. */
  conflicts?: NoteConflict[];
}

export function emptyJournal(): NoteJournal {
  return { cursor: 0, confirmed: {}, pending: [] };
}

export function confirmedNote(state: NoteJournal, id: string): NoteBase | undefined {
  return Object.hasOwn(state.confirmed, id) ? state.confirmed[id] : undefined;
}

type JournalChange = Pick<NoteIntent, 'intentId' | 'id' | 'kind' | 'item' | 'folderGroup'> & { previous?: Exclude<RegistryValue, null> };

export function recordNote(state: NoteJournal, change: JournalChange): NoteJournal {
  const normalize = (value: Exclude<RegistryValue, null>) => Array.isArray(value) || 'shared' in value ? value : relayNote(value);
  const item = change.item ? normalize(change.item) : null;
  const index = state.pending.findLastIndex((entry) => entry.id === change.id);
  const previous = index >= 0 ? state.pending[index] : undefined;
  if (!change.folderGroup && previous && previous.kind === change.kind && sameRegistryValue(previous.item, item)) return state;
  const confirmed = confirmedNote(state, change.id);
  const base = previous ? undefined : confirmed
    ? { revision: confirmed.revision, item: change.previous && change.kind !== 'restore' ? normalize(change.previous) : confirmed.item }
    : (change.kind === 'create' ? { revision: 0, item: null } : undefined);
  if (!change.folderGroup && !previous && change.kind === 'update' && base && sameRegistryValue(base.item, item)) return state;
  // An unsent create/restore can absorb typing without changing what transition it proves.
  if (previous && !previous.attempt && !previous.folderGroup && !change.folderGroup && change.kind === 'update' && previous.item !== null) {
    return { ...state, pending: state.pending.map((entry, i) => i === index ? { ...entry, item } : entry) };
  }
  return { ...state, pending: [...state.pending, { id: change.id, intentId: change.intentId, kind: change.kind,
    item, base, predecessor: previous?.intentId, ...(change.folderGroup ? { folderGroup: change.folderGroup } : {}) }] };
}

export function recordFolderGroup(state: NoteJournal, groupId: string, changes: NoteMutation[], folders: FolderMeta[], previous: FolderMeta[]): NoteJournal {
  if (!groupId || state.pending.some(({ folderGroup }) => folderGroup?.id === groupId)
      || !changes.length || changes.length >= NOTE_BATCH_COUNT
      || new Set(changes.map(({ id }) => id)).size !== changes.length
      || changes.some(({ id, kind, item }) => id === FOLDER_TREE_ID || kind !== 'update' || item?.id !== id)) {
    throw new Error('Invalid folder group intent');
  }
  const id = FOLDER_TREE_ID;
  const kind = confirmedNote(state, id) || state.pending.some((entry) => entry.id === id) ? 'update' : 'create';
  const members: Omit<JournalChange, 'intentId' | 'folderGroup'>[] = [...changes, { id, kind, item: readFolderTree(folders, kind), previous }];
  return members.reduce((journal, change, index) => recordNote(journal, { ...change,
    intentId: crypto.randomUUID(), folderGroup: { id: groupId, index, size: members.length } }), state);
}

export function firstPerNote(state: NoteJournal): NoteIntent[] {
  const seen = new Set<string>();
  return state.pending.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function setAttempt(state: NoteJournal, intentId: string, attempt: JournalAttempt | undefined): NoteJournal {
  return { ...state, pending: state.pending.map((entry) => entry.intentId === intentId ? { ...entry, attempt } : entry) };
}

export function setConfirmed(state: NoteJournal, id: string, head: NoteBase): NoteJournal {
  if ((confirmedNote(state, id)?.revision ?? 0) >= head.revision) return state;
  return { ...state, confirmed: { ...state.confirmed, [id]: head } };
}

export function settleNote(state: NoteJournal, intent: NoteIntent, revision: number, conflict = false): NoteJournal {
  return { ...state, pending: state.pending.filter((entry) => entry.intentId !== intent.intentId)
    .map((entry) => entry.predecessor !== intent.intentId ? entry : conflict
      ? { ...entry, predecessor: undefined, predecessorConflict: true }
      : { ...entry, predecessor: undefined, base: { revision, item: intent.attempt?.op.mediaIds ? intent.attempt.item : intent.item } }) };
}
