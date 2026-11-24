// Rehydrate an empty disk from the relay; import local intentions, not the old delivery cursor.
import type { SlagItem } from '../../../types/index.ts';
import { noteDiskProjection } from '../../storage/noteDiskProjection.ts';
import { confirmedNote, emptyJournal } from './journal.ts';
import type { NoteJournal } from './journal.ts';
import { enrolledNoteGeneration, loadNoteJournal } from './persistence.ts';
import { sameNote, relayNote } from './merge.ts';
import { FOLDER_TREE_ID, isNoteItem } from './wire.ts';
import { RECOVERED_DISK } from './review.ts';
import type { NoteStatus } from './wire.ts';

export function readRecoveryRegistry(stored: Record<string, unknown>, room: string) {
  const generation = enrolledNoteGeneration(stored, room);
  if (!generation) throw new Error('Сохранённый реестр не относится к этой комнате');
  return { stored, generation, journal: loadNoteJournal(stored, room, generation) };
}

export function planRecoveredJournal(source: ReturnType<typeof readRecoveryRegistry>, live: NoteStatus, copies: SlagItem[]): NoteJournal {
  if (live.mode !== 'registry' || !live.folderTree || !live.registryMedia || live.generation !== source.generation
      || live.head < source.journal.cursor || ['folderTree', 'atomicGroups', 'sharedRecords', 'registryMedia'].some((key) =>
        (source.stored[key] === true) !== (Object.hasOwn(live, key)))) {
    throw new Error('Релей не подтвердил прежнее поколение и возможности реестра');
  }
  const { journal } = source;
  const pending: NoteJournal['pending'] = [];
  const conflicts = [...(journal.conflicts ?? [])];
  for (const intent of journal.pending) {
    const { id, intentId, kind, item, base, attempt, folderGroup } = intent;
    if (folderGroup || attempt) throw new Error('В очереди есть ранее отправленная или групповая операция; нужна отдельная проверка');
    if (kind === 'update' && isNoteItem(item) && isNoteItem(base?.item) && item.attachments.every(({ registryBlobId }) => registryBlobId)) {
      pending.push(intent);
    } else if (id === FOLDER_TREE_ID && kind === 'update' && Array.isArray(item) && !intent.predecessor) {
      // A tree update can remove a folder. Preserve the proposal, but do not replay it
      // from a vault whose legacy folder ledger and projection fence are unknown.
      conflicts.push({ intentId, noteId: id, kind, item, revision: base?.revision ?? 0, fields: [RECOVERED_DISK], at: 0 });
    } else throw new Error('В очереди реестра есть неподдерживаемая операция; исходное хранилище сохранено');
  }
  const seen = new Set<string>();
  for (const item of copies) {
    if (!isNoteItem(item) || item.id === FOLDER_TREE_ID) continue; // Raw files are still in the archive.
    if (seen.has(item.id)) throw new Error('На диске есть несколько копий одной записи; исходное хранилище сохранено');
    seen.add(item.id);
    const local = journal.pending.findLast(({ id }) => id === item.id)?.item;
    const head = confirmedNote(journal, item.id);
    const expected = isNoteItem(local) ? local : head?.item;
    if (isNoteItem(expected) && sameNote(noteDiskProjection(expected), item)) continue;
    if (conflicts.some((entry) => entry.noteId === item.id && isNoteItem(entry.item) && sameNote(noteDiskProjection(entry.item), item))) continue;
    conflicts.push({ intentId: `recovery-disk:${item.id}`, noteId: item.id, kind: head?.item ? 'update' : head ? 'restore' : 'create',
      revision: 0, item: relayNote(item), fields: [RECOVERED_DISK], at: Math.max(0, Math.trunc(item.updatedAt)) });
  }
  return { ...emptyJournal(), pending, ...(conflicts.length && { conflicts }) };
}
