import React from 'react';
import type { SlagItem } from '../../../types';
import { getTaskTimeSlot } from '../../../lib/time/todoistTaskParser';
import { TaskStatusMark } from '../../UI/TaskStatusMark';
import { PRIORITY_TONE_TEXT, priorityTone } from '../../UI/priorityTone';
import { MoreVertical } from 'lucide-react';
import { formatClockLabel } from './calendarPositions';

export interface CalendarTaskRowProps {
  task: SlagItem;
  onSelect: () => void;
  onToggleComplete: () => void;
  onOpenActionSheet: () => void;
}

/**
 * Строка задачи в повестке: статус, время, заголовок, папка, кнопка «ещё».
 * Разметка общая для дня и блока «Просрочено».
 */
export const CalendarTaskRow: React.FC<CalendarTaskRowProps> = ({
  task,
  onSelect,
  onToggleComplete,
  onOpenActionSheet,
}) => {
  const isDone = task.status === 'done';
  const slot = getTaskTimeSlot(task);

  return (
    <div
      onClick={onSelect}
      className="w-full flex items-center justify-between p-2.5 sm:p-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors cursor-pointer gap-2"
    >
      {/* Checkbox column (fixed 24px width for exact vertical alignment) */}
      <div className="w-6 flex items-center justify-center shrink-0">
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onToggleComplete();
          }}
          className="p-1 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
          aria-label="Изменить статус таски"
        >
          <TaskStatusMark
            done={isDone}
            className={`w-4 h-4 ${isDone ? '' : PRIORITY_TONE_TEXT[priorityTone(task.priority)]}`}
          />
        </button>
      </div>

      {/* Title & Time */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {!slot.isAllDay && slot.hasTime && (
          <span className="text-[11px] font-mono text-zinc-400 shrink-0 select-none">
            {formatClockLabel(slot.startHour, slot.startMinute)}
          </span>
        )}
        <div
          className={`text-xs font-medium leading-snug truncate ${
            isDone ? 'line-through text-zinc-500' : 'text-zinc-200'
          }`}
        >
          {task.title || 'Без названия'}
        </div>
      </div>

      {/* Folder tag & More button */}
      <div className="flex items-center gap-1.5 shrink-0">
        {task.folder && (
          <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[90px]">
            {task.folder}
          </span>
        )}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onOpenActionSheet();
          }}
          className="p-1 text-zinc-600 hover:text-zinc-300 cursor-pointer rounded"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
