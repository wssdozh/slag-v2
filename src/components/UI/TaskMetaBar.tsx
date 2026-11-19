// One row of task controls — status, priority, due date, duration, recurrence — shared by the
// composer and the fullscreen editor. The shells differ only in `size`: the composer's toolbar is
// `md`, the editor's line under the title is `sm`. Everything else, including the right-click reset
// and the popover direction, lives here, so a new control cannot look different in the second shell.
import React, { useState } from 'react';
import { Icon } from './icons/Icon';
import type { RecurrenceRule, SlagItemPriority, SlagItemStatus } from '../../types';
import { ToolbarButton } from './ToolbarButton';
import { MenuDropdown } from './MenuDropdown';
import { DatePickerPopover } from './DatePickerPopover';
import { Select } from './Select';
import { LinearSignalBars } from './PriorityBadge';
import { formatRecurrenceLabel, RECURRENCE_PRESETS } from '../../lib/time/recurrenceHelper';
import { getTodayIso } from '../../lib/time/dateUtils';
import { PRIORITY_LABELS } from '../../lib/tasks/taskUtils';

const STATUS_LABELS: Record<SlagItemStatus, string> = {
  backlog: 'Бэклог',
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Выполнено',
};

/** `1 ч 30 м` for a reader, not `90`. */
function formatDurationLabel(minutes: number): string {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}ч${minutes % 60 ? ` ${minutes % 60}м` : ''}`
    : `${minutes}м`;
}

export interface TaskMetaBarProps {
  size?: 'sm' | 'md';
  direction?: 'up' | 'down';
  /** Rendered only when both are supplied: the composer has no status picker. */
  status?: SlagItemStatus;
  onStatusChange?: (status: SlagItemStatus) => void;
  priority: SlagItemPriority;
  onPriorityChange: (priority: SlagItemPriority) => void;
  dueDate: string;
  dateLabel: string;
  onDateChange: (date: string) => void;
  onDateClear: () => void;
  /** A reminder time on the due date; only the editor carries one. */
  dueTime?: string;
  onDueTimeChange?: (time: string | null) => void;
  duration?: number;
  onDurationChange: (duration: number | undefined) => void;
  recurrence?: RecurrenceRule;
  onRecurrenceChange: (recurrence: RecurrenceRule | undefined) => void;
}

export const TaskMetaBar: React.FC<TaskMetaBarProps> = ({
  size = 'sm',
  direction = 'down',
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  dueDate,
  dateLabel,
  onDateChange,
  onDateClear,
  dueTime,
  onDueTimeChange,
  duration,
  onDurationChange,
  recurrence,
  onRecurrenceChange,
}) => {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isDurationOpen, setIsDurationOpen] = useState(false);
  const [isRecurrenceOpen, setIsRecurrenceOpen] = useState(false);

  const hasDue = Boolean(dueDate || dueTime);
  const dueTitle = hasDue
    ? `Срок: ${dateLabel}${dueTime ? `, ${dueTime}` : ''} (клик для изменения, ПКМ для сброса)`
    : 'Установить срок таски';

  return (
    <>
      {status !== undefined && onStatusChange && (
        <div className="flex items-center shrink-0">
          <Select
            size={size}
            variant="ghost"
            direction={direction}
            value={status}
            onChange={(value) => onStatusChange(value as SlagItemStatus)}
            aria-label={`Статус: ${STATUS_LABELS[status]}`}
            title={`Статус: ${STATUS_LABELS[status]} (клик для изменения)`}
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
                color: 'text-success',
              },
            ]}
          />
        </div>
      )}

      <div className="flex items-center shrink-0">
        <Select
          size={size}
          variant="ghost"
          direction={direction}
          value={priority}
          onChange={(value) => onPriorityChange(value as SlagItemPriority)}
          showLabel={false}
          showArrow={false}
          aria-label={`Приоритет: ${priority === 'none' ? 'Обычный' : PRIORITY_LABELS[priority]}`}
          title={`Приоритет: ${priority === 'none' ? 'Обычный' : PRIORITY_LABELS[priority]} (клик для изменения)`}
          options={[
            {
              value: 'none',
              label: 'Обычный',
              icon: <LinearSignalBars size="sm" priority="none" />,
              color: 'text-fg-secondary',
            },
            {
              value: 'low',
              label: PRIORITY_LABELS.low,
              icon: <LinearSignalBars size="sm" priority="low" />,
              color: 'text-fg-tertiary',
            },
            {
              value: 'medium',
              label: PRIORITY_LABELS.medium,
              icon: <LinearSignalBars size="sm" priority="medium" />,
              color: 'text-warning',
            },
            {
              value: 'high',
              label: PRIORITY_LABELS.high,
              icon: <LinearSignalBars size="sm" priority="high" />,
              color: 'text-danger',
            },
          ]}
        />
      </div>

      <div className="relative shrink-0">
        <ToolbarButton
          size={size}
          active={hasDue}
          glow="blue"
          onClick={() => setIsDatePickerOpen((prev) => !prev)}
          onContextMenu={(event) => {
            // Right click clears the value, the same gesture the other three controls use.
            if (dueDate) {
              event.preventDefault();
              onDateClear();
            } else if (dueTime && onDueTimeChange) {
              event.preventDefault();
              onDueTimeChange(null);
            }
          }}
          title={dueTitle}
          aria-label={hasDue ? dueTitle : 'Установить срок таски'}
          icon={<Icon name="time.date" size="sm" tone="inherit" />}
        />

        <DatePickerPopover
          isOpen={isDatePickerOpen}
          value={dueDate}
          time={dueTime}
          // The popover stays open on a pick: the time field sits right below the calendar, and
          // closing on every day click made "pick a day, then a time" a two-gesture job.
          onChange={onDateChange}
          onTimeChange={(nextTime) => {
            if (!onDueTimeChange) return;
            if (!nextTime) {
              onDueTimeChange(null);
              return;
            }
            // The time belongs to a day: a reminder without one would have nowhere to fire.
            if (!dueDate) onDateChange(getTodayIso());
            onDueTimeChange(nextTime);
          }}
          onClear={() => {
            onDateClear();
            if (onDueTimeChange) onDueTimeChange(null);
          }}
          onClose={() => setIsDatePickerOpen(false)}
          direction={direction}
        />
      </div>

      <MenuDropdown
        direction={direction}
        isOpen={isDurationOpen}
        onOpenChange={setIsDurationOpen}
        minWidth={140}
        trigger={
          <ToolbarButton
            size={size}
            active={duration !== undefined}
            glow="blue"
            onClick={() => setIsDurationOpen((prev) => !prev)}
            onContextMenu={(event) => {
              if (duration !== undefined) {
                event.preventDefault();
                onDurationChange(undefined);
              }
            }}
            title={
              duration !== undefined
                ? `длительность: ${formatDurationLabel(duration)} (клик для изменения, ПКМ для сброса)`
                : 'Установить длительность таски'
            }
            aria-label="Установить длительность таски"
            icon={<Icon name="time.time" size="sm" tone="inherit" />}
          />
        }
      >
        <div className="flex flex-col gap-0.5 text-xs">
          {duration !== undefined && (
            <button
              type="button"
              onClick={() => {
                onDurationChange(undefined);
                setIsDurationOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer border-b border-tint-6 mb-0.5"
            >
              <span>Без длительности</span>
            </button>
          )}
          {[15, 30, 45, 60, 90, 120].map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => {
                onDurationChange(mins);
                setIsDurationOpen(false);
              }}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                duration === mins ? 'bg-tint-10 text-white font-medium' : 'text-fg-tertiary hover:bg-tint-6'
              }`}
            >
              <span>{mins >= 60 ? `${mins / 60} ч` : `${mins} мин`}</span>
            </button>
          ))}
        </div>
      </MenuDropdown>

      <MenuDropdown
        direction={direction}
        isOpen={isRecurrenceOpen}
        onOpenChange={setIsRecurrenceOpen}
        minWidth={170}
        trigger={
          <ToolbarButton
            size={size}
            active={Boolean(recurrence)}
            glow="blue"
            onClick={() => setIsRecurrenceOpen((prev) => !prev)}
            onContextMenu={(event) => {
              if (recurrence) {
                event.preventDefault();
                onRecurrenceChange(undefined);
              }
            }}
            title={
              recurrence
                ? `повторение: ${formatRecurrenceLabel(recurrence)} (клик для изменения, ПКМ для сброса)`
                : 'Повторяющаяся таска'
            }
            aria-label="Повторяющаяся таска"
            icon={<Icon name="time.repeat" size="sm" tone="inherit" />}
          />
        }
      >
        <div className="flex flex-col gap-0.5 text-xs">
          {recurrence && (
            <button
              type="button"
              onClick={() => {
                onRecurrenceChange(undefined);
                setIsRecurrenceOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer border-b border-tint-6 mb-0.5"
            >
              <span>Без повторения</span>
            </button>
          )}
          {RECURRENCE_PRESETS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => {
                onRecurrenceChange(option.rule);
                setIsRecurrenceOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-fg-tertiary hover:bg-tint-6 transition-colors cursor-pointer"
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </MenuDropdown>
    </>
  );
};
