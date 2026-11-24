// Pure transitions for an ordered queue of local intentions; disk and network stay outside.
import type { FolderMeta, SlagItem } from '../../../types/index.ts';
import { DEFAULT_INBOX_FOLDER } from '../../../config/storage.ts';
import { sortFolders } from '../../vault/folderTree.ts';
import { equal, relayNote, sameNote } from './merge.ts';
import { isNoteItem, FOLDER_TREE_ID, NOTE_BATCH_COUNT, readFolderTree } from './wire.ts';
import type { SharedValue } from './sharedBody.ts';
import type { NoteGroup, NoteOp } from './wire.ts';
import type { NoteMutation, NoteOrigin } from '../../storage/noteRegistry';

export type JournalKind = 'create' | 'update' | 'delete' | 'restore';
export type RegistryValue = SlagItem | FolderMeta[] | SharedValue | null;
export interface NoteBase {
  revision: number;
  item: RegistryValue;
  /** Earliest head connected to this head by observed, uninterrupted updates. */
  since?: number;
  /** Local intent whose accepted revision this is, if known. */
  intentId?: string;
}

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
export type NoteIntentSource = 'app' | 'disk-watch' | 'cold-recovery' | 'retry';

export interface NoteIntent {
  intentId: string;
  source?: NoteIntentSource;
  /** Local provenance only; keep automatic updates separate from user edits. */
  rollover?: true;
  id: string;
  kind: JournalKind;
  item: RegistryValue;
  /** Undefined only when the device has not obtained this note's accepted base. */
  base?: NoteBase;
  /** The preceding queued operation for this ID. A separately verified base takes precedence. */
  predecessor?: string;
  /** Capture explicitly matched a new-format optimistic snapshot, not a legacy queue entry. */
  provenPredecessor?: true;
  /** This edit depended on a local operation that was not applied. */
  predecessorConflict?: true;
  /** The visible base was not the committed snapshot (unknown or optimistic). */
  unverifiedBase?: true;
  optimisticBase?: SlagItem;
  provenBase?: true;
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

type JournalChange = Pick<NoteIntent, 'intentId' | 'id' | 'kind' | 'item' | 'folderGroup' | 'source' | 'rollover'> & {
  previous?: Exclude<RegistryValue, null>;
  origin?: NoteOrigin | null;
};

export function recordNote(state: NoteJournal, change: JournalChange): NoteJournal {
  const normalize = (value: Exclude<RegistryValue, null>) => Array.isArray(value) || 'shared' in value ? value : relayNote(value);
  const item = change.item ? normalize(change.item) : null;
  const index = state.pending.findLastIndex((entry) => entry.id === change.id);
  const previous = index >= 0 ? state.pending[index] : undefined;
  const confirmed = confirmedNote(state, change.id);
  const snapshot = change.previous && change.kind !== 'restore' ? normalize(change.previous) : undefined;
  const origin = change.origin;
  const revision = origin && 'revision' in origin ? origin.revision : undefined;
  const optimistic = origin && 'intentId' in origin ? origin.intentId : undefined;
  const matchesPrevious = !!previous && sameRegistryValue(previous.item, snapshot ?? previous.item)
    && (origin === undefined || optimistic === previous.intentId);
  if (!change.folderGroup && previous && previous.kind === change.kind && sameRegistryValue(previous.item, item)
    && (matchesPrevious || origin === undefined)) return state;
  const base = revision !== undefined && snapshot ? { revision, item: snapshot }
    : !previous && confirmed ? { revision: confirmed.revision, item: snapshot ?? confirmed.item }
    : !previous && change.kind === 'create' ? { revision: 0, item: null } : undefined;
  const acceptedOptimistic = !previous && optimistic !== undefined && optimistic === confirmed?.intentId && isNoteItem(snapshot)
    && isNoteItem(confirmed.item) ? confirmed.item : undefined;
  const unverified = change.kind === 'update' && (origin === null
    || (optimistic !== undefined && !matchesPrevious && !acceptedOptimistic)
    || (!!previous && !matchesPrevious && revision === undefined));
  if (!change.folderGroup && !previous && change.kind === 'update' && base && sameRegistryValue(base.item, item)) return state;
  // An unsent local intent can absorb an update only over its exact snapshot. Keep
  // a rollover separate from user edits so it cannot make their whole patch conflict.
  if (matchesPrevious && previous && !previous.attempt && !previous.folderGroup && !change.folderGroup && change.kind === 'update'
      && previous.item !== null && previous.rollover === change.rollover) {
    return { ...state, pending: state.pending.map((entry, i) => i === index ? { ...entry, intentId: change.intentId, item,
      source: change.source ?? entry.source } : entry) };
  }
  return { ...state, pending: [...state.pending, { id: change.id, intentId: change.intentId, kind: change.kind,
    item, base, predecessor: previous?.intentId,
    ...(optimistic && matchesPrevious ? { provenPredecessor: true as const } : {}),
    ...(unverified ? { unverifiedBase: true as const } : {}), ...(acceptedOptimistic ? { optimisticBase: acceptedOptimistic } : {}),
    ...((revision !== undefined || acceptedOptimistic || (origin === undefined && (snapshot === undefined || change.rollover)
      && !!base && !!confirmed && sameRegistryValue(base.item, confirmed.item))) ? { provenBase: true as const } : {}),
    ...(change.source ? { source: change.source } : {}),
    ...(change.rollover && change.kind === 'update' && change.source === 'app' && !change.folderGroup ? { rollover: true as const } : {}),
    ...(change.folderGroup ? { folderGroup: change.folderGroup } : {}) }] };
}

export function recordFolderGroup(state: NoteJournal, groupId: string, changes: NoteMutation[], folders: FolderMeta[], previous: FolderMeta[], source: NoteIntentSource = 'app'): NoteJournal {
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
    intentId: crypto.randomUUID(), source, folderGroup: { id: groupId, index, size: members.length } }), state);
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

export function settleNote(state: NoteJournal, intent: NoteIntent, revision: number, conflict = false, accepted?: RegistryValue): NoteJournal {
  return { ...state, pending: state.pending.filter((entry) => entry.intentId !== intent.intentId)
    .map((entry) => {
      if (entry.predecessor !== intent.intentId) return entry;
      if (entry.base) return { ...entry, predecessor: undefined };
      if (conflict) return { ...entry, predecessor: undefined, predecessorConflict: true as const };
      const item = intent.item;
      const optimisticBase = entry.kind === 'update' && entry.provenPredecessor && isNoteItem(accepted) && !sameRegistryValue(item, accepted) ? accepted : undefined;
      return { ...entry, predecessor: undefined, base: { revision, item },
        ...(entry.kind === 'update' && entry.provenPredecessor && { provenBase: true as const }), ...(optimisticBase && { optimisticBase }) };
    }) };
}
