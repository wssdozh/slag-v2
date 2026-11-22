import type { SlagItem } from '../../types';
import { parseISODateString } from '../time/dateUtils';

/** A local calendar comparison, independent of reminder time and task recurrence. */
export function classifyDueDate(dueDate: string | undefined, today: string): 'today' | 'overdue' | 'upcoming' | 'unscheduled' {
  if (!dueDate || !Number.isFinite(parseISODateString(dueDate).getTime())) return 'unscheduled';
  return dueDate === today ? 'today' : dueDate < today ? 'overdue' : 'upcoming';
}

export function classifyTaskSchedule(item: Pick<SlagItem, 'type' | 'status' | 'dueDate'>, today: string) {
  return item.type === 'task' && item.status !== 'done' ? classifyDueDate(item.dueDate, today) : null;
}
