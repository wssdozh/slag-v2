import type { SlagItem } from '../../../types/index.ts';
import { getTodayIso, parseISODateString } from '../../time/dateUtils.ts';
import { evaluateRecurringTasks } from '../../time/recurrenceHelper.ts';
import { recurrenceProperties } from '../../vault/noteSemantics.ts';
import { equal, noteDifferences, sameNote } from './merge.ts';

/** Prove that the saved change does no more than running the app's overdue rollover on its base. */
export function isOverdueRollover(base: SlagItem, local: SlagItem): boolean {
  if (base.id !== local.id || (base.status ?? 'todo') !== 'todo' || !local.dueDate || !base.dueDate ||
      base.dueDate >= local.dueDate) return false;
  const result = evaluateRecurringTasks([base], parseISODateString(local.dueDate)).changedItems[0];
  return !!result && sameNote(result, local);
}

export function supersededRollover(local: SlagItem, head: SlagItem): boolean {
  if (local.type !== 'task' || head.type !== 'task' || !local.recurrence || !head.recurrence ||
      !equal(recurrenceProperties(local.recurrence), recurrenceProperties(head.recurrence), true) ||
      !local.dueDate || !head.dueDate || local.dueDate > head.dueDate) return false;
  if (local.dueDate === head.dueDate) return true;
  return local.recurrence.freq === 'daily' && (local.recurrence.interval ?? 1) === 1 &&
    Number.isFinite(parseISODateString(local.dueDate).getTime()) && Number.isFinite(parseISODateString(head.dueDate).getTime());
}

/** Legacy had no provenance. Expire only a date-only, past snapshot of the same daily task. */
export function expiredLegacyDeadline(local: SlagItem, head: SlagItem, queuedAt: number): boolean {
  const today = getTodayIso();
  if (local.id !== head.id || local.type !== 'task' || head.type !== 'task' || (local.status ?? 'todo') !== 'todo'
      || local.recurrence?.freq !== 'daily' || (local.recurrence.interval ?? 1) !== 1 || local.streak !== 0
      || local.reminder || head.reminder || local.createdAt !== head.createdAt
      || !queuedAt || local.updatedAt > queuedAt || queuedAt >= head.updatedAt
      || !local.dueDate || !head.dueDate || local.dueDate >= head.dueDate || head.dueDate > today) return false;
  const differences = noteDifferences(local, head);
  return differences.length === 1 && differences[0] === 'dueDate' && supersededRollover(local, head);
}
