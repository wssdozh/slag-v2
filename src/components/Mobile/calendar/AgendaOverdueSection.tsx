// The overdue block above the week: counted, tinted red, and absent when empty.
import React from 'react';
import type { SlagItem } from '../../../types';
import { Icon } from '../../UI/icons/Icon';
import { CalendarTaskRow } from './CalendarTaskRow';

export interface AgendaOverdueSectionProps {
  tasks: SlagItem[];
  onSelectTask: (task: SlagItem) => void;
  onToggleTask: (task: SlagItem) => void;
  onOpenTaskActions: (task: SlagItem) => void;
}

/** Блок «Просрочено» над днями недели. Пустой список не рисует ничего. */
export const AgendaOverdueSection: React.FC<AgendaOverdueSectionProps> = ({
  tasks,
  onSelectTask,
  onToggleTask,
  onOpenTaskActions,
}) => {
  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 px-1">
        <Icon name="status.alert" size="sm" tone="inherit" />
        <span>Просрочено</span>
        <span className="text-3xs font-mono opacity-80">({tasks.length})</span>
      </div>

      <div className="rounded-2xl bg-surface/80 border border-rose-500/20 overflow-hidden divide-y divide-tint-4">
        {tasks.map(task => (
          <CalendarTaskRow
            key={task.id}
            task={task}
            onSelect={() => onSelectTask(task)}
            onToggleComplete={() => onToggleTask(task)}
            onOpenActionSheet={() => onOpenTaskActions(task)}
          />
        ))}
      </div>
    </div>
  );
};
