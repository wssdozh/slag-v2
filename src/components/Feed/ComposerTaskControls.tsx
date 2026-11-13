// The task-only composer controls: due date, duration, recurrence and priority.
import React, { useState } from 'react';
import { Calendar, Clock, Repeat } from 'lucide-react';
import type { RecurrenceRule, SlagItemPriority } from '../../types';
import { ToolbarButton } from '../UI/ToolbarButton';
import { MenuDropdown } from '../UI/MenuDropdown';
import { DatePickerPopover } from '../UI/DatePickerPopover';
import { Select } from '../UI/Select';
import { LinearSignalBars } from '../UI/PriorityBadge';
import { formatRecurrenceLabel, RECURRENCE_PRESETS } from '../../lib/time/recurrenceHelper';
import { PRIORITY_LABELS } from '../../lib/tasks/taskUtils';

export interface ComposerTaskControlsProps {
  effectiveDueDate: string;
  effectiveDateLabel: string;
  onDateChange: (date: string) => void;
  onDateClear: () => void;
  effectiveDuration: number | undefined;
  onDurationChange: (duration: number | undefined) => void;
  effectiveRecurrence: RecurrenceRule | undefined;
  onRecurrenceChange: (recurrence: RecurrenceRule | undefined) => void;
  effectivePriority: SlagItemPriority;
  onPriorityChange: (priority: SlagItemPriority) => void;
}

export const ComposerTaskControls: React.FC<ComposerTaskControlsProps> = ({
  effectiveDueDate,
  effectiveDateLabel,
  onDateChange,
  onDateClear,
  effectiveDuration,
  onDurationChange,
  effectiveRecurrence,
  onRecurrenceChange,
  effectivePriority,
  onPriorityChange,
}) => {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isDurationOpen, setIsDurationOpen] = useState(false);
  const [isRecurrenceOpen, setIsRecurrenceOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {/* Due Date Trigger */}
      <div className="relative shrink-0">
        <ToolbarButton
          className="composer-toolbar-control composer-toolbar-icon"
          size="md"
          active={Boolean(effectiveDueDate)}
          glow="blue"
          onClick={() => setIsDatePickerOpen((prev) => !prev)}
          onContextMenu={(e) => {
            if (effectiveDueDate) {
              e.preventDefault();
              onDateClear();
            }
          }}
          title={
            effectiveDueDate
              ? `Срок: ${effectiveDateLabel} (клик для изменения, ПКМ для сброса)`
              : 'Установить срок таски'
          }
          aria-label={effectiveDueDate ? `Срок: ${effectiveDateLabel}` : 'Установить срок таски'}
          icon={<Calendar className="w-4 h-4" />}
        />

        <DatePickerPopover
          isOpen={isDatePickerOpen}
          value={effectiveDueDate}
          onChange={(newDate) => {
            onDateChange(newDate);
            setIsDatePickerOpen(false);
          }}
          onClear={() => {
            onDateClear();
            setIsDatePickerOpen(false);
          }}
          onClose={() => setIsDatePickerOpen(false)}
          direction="up"
        />
      </div>

      {/* Duration Dropdown */}
      <MenuDropdown
        direction="up"
        isOpen={isDurationOpen}
        onOpenChange={setIsDurationOpen}
        minWidth={140}
        trigger={
          <ToolbarButton
            className="composer-toolbar-control composer-toolbar-icon"
            size="md"
            active={effectiveDuration !== undefined}
            glow="blue"
            onClick={() => setIsDurationOpen((prev) => !prev)}
            onContextMenu={(e) => {
              if (effectiveDuration !== undefined) {
                e.preventDefault();
                onDurationChange(undefined);
              }
            }}
            title={
              effectiveDuration !== undefined
                ? `длительность: ${
                    effectiveDuration >= 60
                      ? `${Math.floor(effectiveDuration / 60)}ч${effectiveDuration % 60 ? ` ${effectiveDuration % 60}м` : ''}`
                      : `${effectiveDuration}м`
                  } (клик для изменения, ПКМ для сброса)`
                : 'Установить длительность таски'
            }
            aria-label="Установить длительность таски"
            icon={<Clock className="w-4 h-4" />}
          />
        }
      >
        <div className="flex flex-col gap-0.5 text-xs">
          {effectiveDuration !== undefined && (
            <button
              type="button"
              onClick={() => {
                onDurationChange(undefined);
                setIsDurationOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer border-b border-white/[0.06] mb-0.5"
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
                effectiveDuration === mins
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-300 hover:bg-white/[0.06]'
              }`}
            >
              <span>{mins >= 60 ? `${mins / 60} ч` : `${mins} мин`}</span>
            </button>
          ))}
        </div>
      </MenuDropdown>

      {/* Recurrence Dropdown */}
      <MenuDropdown
        direction="up"
        isOpen={isRecurrenceOpen}
        onOpenChange={setIsRecurrenceOpen}
        minWidth={170}
        trigger={
          <ToolbarButton
            className="composer-toolbar-control composer-toolbar-icon"
            size="md"
            active={Boolean(effectiveRecurrence)}
            glow="blue"
            onClick={() => setIsRecurrenceOpen((prev) => !prev)}
            onContextMenu={(e) => {
              if (effectiveRecurrence) {
                e.preventDefault();
                onRecurrenceChange(undefined);
              }
            }}
            title={
              effectiveRecurrence
                ? `повторение: ${formatRecurrenceLabel(effectiveRecurrence)} (клик для изменения, ПКМ для сброса)`
                : 'повторение: настроить повтор'
            }
            aria-label="Повторяющаяся таска"
            icon={<Repeat className="w-4 h-4" />}
          />
        }
      >
        <div className="flex flex-col gap-0.5 text-xs">
          {effectiveRecurrence && (
            <button
              type="button"
              onClick={() => {
                onRecurrenceChange(undefined);
                setIsRecurrenceOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer border-b border-white/[0.06] mb-0.5"
            >
              <span>Без повторения</span>
            </button>
          )}
          {RECURRENCE_PRESETS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                onRecurrenceChange(opt.rule);
                setIsRecurrenceOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </MenuDropdown>

      {/* Priority Selector */}
      <div className="flex items-center shrink-0">
        <Select
          size="md"
          variant="ghost"
          direction="up"
          value={effectivePriority}
          triggerClassName="composer-toolbar-control composer-toolbar-icon"
          showLabel={false}
          showArrow={false}
          title={`Приоритет: ${
            effectivePriority === 'none' ? 'Обычный' : PRIORITY_LABELS[effectivePriority]
          } (клик для изменения)`}
          onChange={(val) => onPriorityChange(val as SlagItemPriority)}
          className={effectivePriority !== 'none' ? 'rounded-md' : ''}
          options={[
            {
              value: 'none',
              label: 'Обычный',
              icon: <LinearSignalBars size="md" priority="none" />,
              color: 'text-zinc-400',
            },
            {
              value: 'low',
              label: PRIORITY_LABELS.low,
              icon: <LinearSignalBars size="md" priority="low" />,
              color: 'text-zinc-300',
            },
            {
              value: 'medium',
              label: PRIORITY_LABELS.medium,
              icon: <LinearSignalBars size="md" priority="medium" />,
              color: 'text-amber-400',
            },
            {
              value: 'high',
              label: PRIORITY_LABELS.high,
              icon: <LinearSignalBars size="md" priority="high" />,
              color: 'text-rose-400',
            },
          ]}
        />
      </div>
    </div>
  );
};
