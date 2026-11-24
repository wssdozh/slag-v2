// Decide what to send from the durable intent and the currently confirmed head.
import { sameRegistryValue } from './journal.ts';
import type { NoteBase, NoteIntent, RegistryValue } from './journal.ts';
import { mergeNote, sameNote } from './merge.ts';
import { FOLDER_TREE_ID, isNoteItem } from './wire.ts';
import type { NoteHead, NoteKind } from './wire.ts';

export type Candidate = { item: RegistryValue; kind: NoteKind; conflicts: string[]; skip?: true };

export function confirmedBase(previous: NoteBase | undefined, op: Pick<NoteHead, 'revision' | 'kind' | 'baseRevision'>,
  item: RegistryValue, intentId?: string): NoteBase {
  const since = op.kind === 'update' && isNoteItem(item) && isNoteItem(previous?.item) && previous.revision === op.baseRevision
    ? previous.since ?? previous.revision : undefined;
  return { revision: op.revision, item, ...(since !== undefined && { since }), ...(intentId !== undefined && { intentId }) };
}

export function candidate(intent: NoteIntent, head: NoteBase | undefined): Candidate {
  const { base, kind, item } = intent;
  const current = head?.item ?? null;
  const skip = (conflicts: string[]): Candidate => ({ item: current, kind, conflicts, skip: true });
  if (intent.predecessorConflict) return skip(['predecessor']);
  if (intent.unverifiedBase) return skip(['base']);
  if (!base && !intent.attempt) return skip(['base']);
  if (!head && kind !== 'create') throw new Error('Эталон заметки не найден; правка осталась в очереди');
  // Matching non-note snapshots need no new write. This must not settle a cascade,
  // a lifecycle transition, or a note whose continuity is still unproven.
  if (kind === 'update' && base && !intent.folderGroup && item && (Array.isArray(item) || 'shared' in item)
      && sameRegistryValue(item, current)) return skip([]);
  if (base?.revision === (head?.revision ?? 0) && sameRegistryValue(base.item, current)) {
    if (kind === 'update' && sameRegistryValue(item, current)) return skip([]);
    if ((kind === 'create' && !head) || (kind === 'restore' && head && current === null)
        || ((kind === 'update' || kind === 'delete') && current !== null)) return { item, kind, conflicts: [] };
  }
  if (head && base && intent.provenBase && kind === 'update' && !intent.folderGroup && intent.source !== 'retry' && intent.source !== 'cold-recovery'
      && isNoteItem(base.item) && isNoteItem(item) && isNoteItem(current)
      && ((base.revision < head.revision && base.revision >= (head.since ?? head.revision))
        || (base.revision === head.revision && intent.optimisticBase))) {
    if (sameNote(item, current) || sameNote(item, base.item)) return skip([]);
    const reapplied = intent.optimisticBase ? mergeNote(base.item, item, intent.optimisticBase) : undefined;
    if (reapplied?.conflicts.length) return skip(reapplied.conflicts);
    const merged = reapplied && base.revision === head.revision ? reapplied
      : mergeNote(intent.optimisticBase ?? base.item, reapplied?.item ?? item, current);
    if (merged.conflicts.length) return skip(merged.conflicts);
    return sameNote(merged.item, current) ? skip([]) : { ...merged, kind };
  }
  if (kind === 'update' && !intent.folderGroup && isNoteItem(item) && isNoteItem(current) && base?.revision !== head?.revision
      && intent.provenBase && intent.source !== 'cold-recovery' && intent.source !== 'retry') return skip(['lifecycle']);
  return skip([intent.id === FOLDER_TREE_ID ? 'folders' : kind]);
}
