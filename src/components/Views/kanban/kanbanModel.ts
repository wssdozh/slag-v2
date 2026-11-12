// Kanban columns config plus the small pure helpers the board and its cards share.
import type { SlagItem, TaskStatus } from '../../../types';

export type KanbanColumnIconType = 'dashed' | 'circle' | 'in_progress' | 'done';

export interface KanbanColumnConfig {
  id: TaskStatus;
  title: string;
  iconType: KanbanColumnIconType;
  iconColor: string;
}

export const KANBAN_COLUMNS: KanbanColumnConfig[] = [
  { id: 'backlog', title: 'Бэклог', iconType: 'dashed', iconColor: 'text-zinc-500' },
  { id: 'todo', title: 'К выполнению', iconType: 'circle', iconColor: 'text-zinc-400' },
  { id: 'in_progress', title: 'В работе', iconType: 'in_progress', iconColor: 'text-amber-500' },
  { id: 'done', title: 'Выполнено', iconType: 'done', iconColor: 'text-blue-500' },
];

export function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return dueDate < today;
}

export function getTaskKey(item: SlagItem): string {
  const digits = item.id.replace(/\D/g, '');
  if (digits.length >= 2) {
    return `TSK-${digits.slice(-3).padStart(2, '0')}`;
  }
  return `TSK-${item.id.slice(-4).toUpperCase()}`;
}
