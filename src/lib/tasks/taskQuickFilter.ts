// Classifies existing tasks by their saved local deadline, not their reminder.
import type { SlagItem } from '../../types';

export const TASK_QUICK_FILTER_LABELS = {
  today: 'Сегодня',
  upcoming: 'Предстоящие',
  undated: 'Без даты',
  completed: 'Выполненные',
} as const;

export type TaskQuickFilterId = keyof typeof TASK_QUICK_FILTER_LABELS;

export interface TaskQuickFilter {
  id: TaskQuickFilterId;
  today: string;
}

export function matchesTaskQuickFilter(item: Pick<SlagItem, 'type' | 'status' | 'dueDate'>, { id, today }: TaskQuickFilter): boolean {
  if (item.type !== 'task') return false;
  if (id === 'completed') return item.status === 'done';
  if (item.status === 'done') return false;
  if (!item.dueDate) return id === 'undated';
  return id === 'today' ? item.dueDate <= today : id === 'upcoming' && item.dueDate > today;
}
