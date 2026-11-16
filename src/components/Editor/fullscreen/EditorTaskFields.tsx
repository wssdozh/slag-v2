// The task row inside the editor: status, priority, due date, duration, recurrence.
import React from 'react';
import type { SlagItemStatus, RecurrenceRule } from '../../../types';
import { LinearSignalBars } from '../../UI/PriorityBadge';
import { formatRecurrenceLabel, RECURRENCE_PRESETS } from '../../../lib/time/recurrenceHelper';
import { Icon } from '../../UI/icons/Icon';
import { Select } from '../../UI/Select';
import { DatePickerPopover } from '../../UI/DatePickerPopover';
import { formatDueDateLabel } from '../../../lib/time/dateUtils';
import { PRIORITY_LABELS } from '../../../lib/tasks/taskUtils';

export interface EditorTaskFieldsProps {
  status: SlagItemStatus;
  setStatus: React.Dispatch<React.SetStateAction<SlagItemStatus>>;
  priority: 'none' | 'low' | 'medium' | 'high';
  setPriority: React.Dispatch<React.SetStateAction<'none' | 'low' | 'medium' | 'high'>>;
  dueDate: string;
  setDueDate: React.Dispatch<React.SetStateAction<string>>;
  duration: number | undefined;
  setDuration: React.Dispatch<React.SetStateAction<number | undefined>>;
  recurrence: RecurrenceRule | undefined;
  setRecurrence: React.Dispatch<React.SetStateAction<RecurrenceRule | undefined>>;
  isDatePickerOpen: boolean;
  setIsDatePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isDurationDropdownOpen: boolean;
  setIsDurationDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isRecurrenceDropdownOpen: boolean;
  setIsRecurrenceDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/** The task's own row: status, priority, due date, duration and recurrence. */
export const EditorTaskFields: React.FC<EditorTaskFieldsProps> = ({
  status,
  setStatus,
  priority,
  setPriority,
  dueDate,
  setDueDate,
  duration,
  setDuration,
  recurrence,
  setRecurrence,
  isDatePickerOpen,
  setIsDatePickerOpen,
  isDurationDropdownOpen,
  setIsDurationDropdownOpen,
  isRecurrenceDropdownOpen,
  setIsRecurrenceDropdownOpen,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-tertiary">
      {/* Status Selector */}
      <div className="flex items-center shrink-0">
        <Select
          size="sm"
          variant="ghost"
          direction="down"
          value={status}
          onChange={(val) => setStatus(val as SlagItemStatus)}
          options={[
            {
              value: 'backlog',
              label: 'Бэклог',
              icon: <Icon name="status.todo" size="sm" tone="muted" />,
              color: 'text-fg-muted',
            },
            {
              value: 'todo',
              label: 'К выполнению',
              icon: <Icon name="status.todo" size="sm" />,
              color: 'text-fg-secondary',
            },
            {
              value: 'in_progress',
              label: 'В работе',
              icon: <Icon name="time.time" size="sm" tone="accent" />,
              color: 'text-blue-400',
            },
            {
              value: 'done',
              label: 'Выполнено',
              icon: <Icon name="status.done" size="sm" tone="success" />,
              color: 'text-emerald-400',
            },
          ]}
          className="h-7 rounded-md bg-tint-3 hover:bg-tint-7 border border-tint-6 px-2 text-xs"
        />
      </div>

      {/* Priority Selector */}
      <div className="flex items-center shrink-0">
        <Select
          size="sm"
          variant="ghost"
          direction="down"
          value={priority}
          onChange={(val) => setPriority(val as 'none' | 'low' | 'medium' | 'high')}
          options={[
            {
              value: 'none',
              label: 'Обычный',
              icon: <LinearSignalBars priority="none" className="w-3.5 h-3.5" />,
              color: 'text-fg-secondary',
            },
            {
              value: 'low',
              label: PRIORITY_LABELS.low,
              icon: <LinearSignalBars priority="low" className="w-3.5 h-3.5" />,
              color: 'text-fg-tertiary',
            },
            {
              value: 'medium',
              label: PRIORITY_LABELS.medium,
              icon: <LinearSignalBars priority="medium" className="w-3.5 h-3.5" />,
              color: 'text-amber-400',
            },
            {
              value: 'high',
              label: PRIORITY_LABELS.high,
              icon: <LinearSignalBars priority="high" className="w-3.5 h-3.5" />,
              color: 'text-rose-400',
            },
          ]}
          className="h-7 rounded-md bg-tint-3 hover:bg-tint-7 border border-tint-6 px-2 text-xs"
        />
      </div>

      {/* Due Date Trigger */}
      <div className="relative shrink-0">
        {dueDate ? (
          <div className="flex items-center gap-1 h-7 px-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs transition-colors shrink-0">
            <button
              type="button"
              onClick={() => setIsDatePickerOpen(prev => !prev)}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
              title="Изменить срок"
            >
              <Icon name="time.date" size="sm" tone="accent" className="shrink-0" />
              <span className="font-medium max-w-[85px] truncate">{formatDueDateLabel(dueDate)}</span>
            </button>
            <button
              type="button"
              onClick={() => setDueDate('')}
              className="p-0.5 text-blue-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Снять срок"
            >
              <Icon name="action.close" size="sm" tone="inherit" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsDatePickerOpen(prev => !prev)}
            className="h-7 px-2 rounded-md bg-tint-3 hover:bg-tint-7 border border-tint-6 text-fg-secondary hover:text-fg-soft text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            title="Установить срок таски"
          >
            <Icon name="time.date" size="sm" className="shrink-0" />
            <span>Срок</span>
          </button>
        )}

        <DatePickerPopover
          isOpen={isDatePickerOpen}
          value={dueDate}
          onChange={(newDate) => {
            setDueDate(newDate);
            setIsDatePickerOpen(false);
          }}
          onClear={() => {
            setDueDate('');
            setIsDatePickerOpen(false);
          }}
          onClose={() => setIsDatePickerOpen(false)}
          direction="down"
        />
      </div>

      {/* Duration Selector */}
      <div className="relative shrink-0">
        {duration !== undefined ? (
          <div className="flex items-center gap-1 h-7 px-2 rounded-md bg-tint-8 border border-tint-12 text-xs text-white transition-colors shrink-0">
            <button
              type="button"
              onClick={() => setIsDurationDropdownOpen(!isDurationDropdownOpen)}
              className="flex items-center gap-1.5 text-fg-tertiary hover:text-white transition-colors cursor-pointer"
              title="Изменить длительность"
            >
              <Icon name="time.time" size="sm" className="shrink-0" />
              <span className="font-medium max-w-[70px] truncate">
                {duration >= 60
                  ? `${Math.floor(duration / 60)}ч${duration % 60 ? ` ${duration % 60}м` : ''}`
                  : `${duration}м`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDuration(undefined)}
              className="p-0.5 text-fg-secondary hover:text-rose-400 transition-colors cursor-pointer"
              title="Снять длительность"
            >
              <Icon name="action.close" size="sm" tone="inherit" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsDurationDropdownOpen(!isDurationDropdownOpen)}
            className="h-7 px-2 rounded-md bg-tint-3 hover:bg-tint-7 border border-tint-6 text-fg-secondary hover:text-fg-soft text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            title="Установить длительность таски"
          >
            <Icon name="time.time" size="sm" className="shrink-0" />
            <span>Длительность</span>
          </button>
        )}

        {isDurationDropdownOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-32 rounded-xl bg-surface-elevated border border-tint-10 shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover pointer-events-auto">
            {[15, 30, 45, 60, 90, 120].map(mins => (
              <button
                key={mins}
                type="button"
                onClick={() => {
                  setDuration(mins);
                  setIsDurationDropdownOpen(false);
                }}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                  duration === mins ? 'bg-tint-10 text-white font-medium' : 'text-fg-tertiary hover:bg-tint-6'
                }`}
              >
                <span>{mins >= 60 ? `${mins / 60} ч` : `${mins} мин`}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recurrence Selector */}
      <div className="relative shrink-0">
        {recurrence ? (
          <div className="flex items-center gap-1 h-7 px-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs transition-colors shrink-0">
            <button
              type="button"
              onClick={() => setIsRecurrenceDropdownOpen(!isRecurrenceDropdownOpen)}
              className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              title="Изменить повторение"
            >
              <Icon name="time.repeat" size="sm" tone="warning" className="shrink-0" />
              <span className="font-medium max-w-[85px] truncate">
                {formatRecurrenceLabel(recurrence)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRecurrence(undefined)}
              className="p-0.5 text-fg-secondary hover:text-rose-400 transition-colors cursor-pointer"
              title="Снять повторение"
            >
              <Icon name="action.close" size="sm" tone="inherit" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsRecurrenceDropdownOpen(!isRecurrenceDropdownOpen)}
            className="h-7 px-2 rounded-md bg-tint-3 hover:bg-tint-7 border border-tint-6 text-fg-secondary hover:text-fg-primary text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
            title="Повторяющаяся таска"
          >
            <Icon name="time.repeat" size="sm" className="shrink-0" />
            <span>Повтор</span>
          </button>
        )}

        {isRecurrenceDropdownOpen && (
          <div className="absolute left-0 top-full mt-1.5 w-44 rounded-xl bg-surface-elevated border border-tint-10 shadow-2xl p-1 z-50 text-xs flex flex-col gap-0.5 motion-popover pointer-events-auto">
            {RECURRENCE_PRESETS.map(opt => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  setRecurrence(opt.rule);
                  setIsRecurrenceDropdownOpen(false);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg-tertiary hover:bg-tint-6 transition-colors cursor-pointer"
              >
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
