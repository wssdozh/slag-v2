// Pure transitions for an ordered queue of local intentions; disk and network stay outside.
import type { FolderMeta, SlagItem } from '../../../types/index.ts';
import { DEFAULT_INBOX_FOLDER } from '../../../config/storage.ts';
import { sortFolders } from '../../vault/folderTree.ts';
import { equal, relayNote, sameNote } from './merge.ts';

export type JournalKind = 'create' | 'update' | 'delete' | 'restore';
export type RegistryValue = SlagItem | FolderMeta[] | null;
export interface NoteBase { revision: number; item: RegistryValue }

export function sameRegistryValue(a: RegistryValue, b: RegistryValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return equal(sortFolders(a, DEFAULT_INBOX_FOLDER), sortFolders(b, DEFAULT_INBOX_FOLDER));
  }
  return !Array.isArray(a) && !Array.isArray(b) && sameNote(a, b);
}
export interface JournalAttempt {
  op: { opId: string; noteId: string; baseRevision: number; kind: JournalKind; sealed: { iv: string; ciphertext: string } };
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
  attempt?: JournalAttempt;
}
export interface NoteJournal {
  cursor: number;
  confirmed: Record<string, NoteBase>;
  pending: NoteIntent[];
}

export function emptyJournal(): NoteJournal {
  return { cursor: 0, confirmed: {}, pending: [] };
}

export function confirmedNote(state: NoteJournal, id: string): NoteBase | undefined {
  return Object.hasOwn(state.confirmed, id) ? state.confirmed[id] : undefined;
}

export function recordNote(state: NoteJournal, change: Pick<NoteIntent, 'intentId' | 'id' | 'kind' | 'item'> & { previous?: Exclude<RegistryValue, null> }): NoteJournal {
  const normalize = (value: Exclude<RegistryValue, null>) => Array.isArray(value) ? value : relayNote(value);
  const item = change.item ? normalize(change.item) : null;
  const index = state.pending.findLastIndex((entry) => entry.id === change.id);
  const previous = index >= 0 ? state.pending[index] : undefined;
  if (previous && previous.kind === change.kind && sameRegistryValue(previous.item, item)) return state;
  const confirmed = confirmedNote(state, change.id);
  const base = previous ? undefined : confirmed
    ? { revision: confirmed.revision, item: change.previous && change.kind !== 'restore' ? normalize(change.previous) : confirmed.item }
    : (change.kind === 'create' ? { revision: 0, item: null } : undefined);
  if (!previous && change.kind === 'update' && base && sameRegistryValue(base.item, item)) return state;
  // An unsent create/restore can absorb typing without changing what transition it proves.
  if (previous && !previous.attempt && change.kind === 'update' && previous.item !== null) {
    return { ...state, pending: state.pending.map((entry, i) => i === index ? { ...entry, item } : entry) };
  }
  return { ...state, pending: [...state.pending, { id: change.id, intentId: change.intentId, kind: change.kind,
    item, base, predecessor: previous?.intentId }] };
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

export function settleNote(state: NoteJournal, intent: NoteIntent, revision: number): NoteJournal {
  // The successor's delta is relative to what the editor actually displayed. Basing it on
  // a merged result would turn unseen additions by another device into deletions.
  return { ...state, pending: state.pending.filter((entry) => entry.intentId !== intent.intentId)
    .map((entry) => entry.predecessor !== intent.intentId ? entry
      : { ...entry, predecessor: undefined, base: { revision, item: intent.item } }) };
}
