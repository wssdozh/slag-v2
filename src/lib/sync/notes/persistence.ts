// Registry state is scoped to a room generation; an old queue is never silently reset.
import type { NoteJournal } from './journal.ts';
import { emptyJournal } from './journal.ts';
import { isNoteItem, parseNoteHead } from './wire.ts';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local note registry');
  return value as Record<string, unknown>;
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validItem(value: unknown, id: string): boolean {
  return value === null || (isNoteItem(value) && value.id === id);
}

function validateBase(value: unknown, id: string) {
  const base = object(value);
  if (!integer(base.revision) || !validItem(base.item, id)) throw new Error('Invalid persisted note base');
}

export function enrolledNoteGeneration(value: unknown, room: string): number | undefined {
  if (value === undefined) return;
  const envelope = object(value);
  if (envelope.version !== 1 || !integer(envelope.generation) || envelope.generation === 0) {
    throw new Error('Invalid local note registry enrollment');
  }
  if (envelope.room === room) return envelope.generation;
}

export function loadNoteJournal(value: unknown, room: string, generation: number): NoteJournal {
  if (value === undefined) return emptyJournal();
  const envelope = object(value);
  if (envelope.version !== 1) throw new Error('Unknown local note registry version');
  const state = object(envelope.journal);
  if (!integer(state.cursor) || !Array.isArray(state.pending)) throw new Error('Invalid local note registry cursor');
  for (const [id, base] of Object.entries(object(state.confirmed))) validateBase(base, id);
  if (envelope.room !== room || envelope.generation !== generation) {
    if (state.pending.length) throw new Error('В предыдущей комнате остались неподтверждённые правки');
    return emptyJournal();
  }
  const chain = new Map<string, string>();
  const seen = new Set<string>();
  for (const raw of state.pending) {
    const entry = object(raw);
    const { id, intentId, kind, predecessor, item } = entry;
    if (typeof id !== 'string' || !id || typeof intentId !== 'string' || !intentId || seen.has(intentId)
        || (kind !== 'create' && kind !== 'update' && kind !== 'delete' && kind !== 'restore')
        || !validItem(item, id) || (kind === 'delete') !== (item === null)
        || predecessor !== chain.get(id)) throw new Error('Invalid persisted note intent');
    seen.add(intentId);
    chain.set(id, intentId);
    if (entry.base !== undefined) validateBase(entry.base, id);
    if (entry.attempt !== undefined) {
      const attempt = object(entry.attempt);
      const op = object(attempt.op);
      if (!integer(op.baseRevision)) throw new Error('Invalid persisted note attempt');
      const parsed = parseNoteHead({ ...op, revision: op.baseRevision + 1 });
      if (!validItem(attempt.item, id) || (parsed.kind === 'delete') !== (attempt.item === null)
          || !Array.isArray(attempt.conflicts) || !attempt.conflicts.every((field: unknown) => typeof field === 'string')) {
        throw new Error('Invalid persisted note attempt');
      }
    }
  }
  return state as unknown as NoteJournal;
}
