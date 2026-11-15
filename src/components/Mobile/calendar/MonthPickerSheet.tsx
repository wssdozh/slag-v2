// The month sheet: a month grid with a dot on days that have tasks, and a today shortcut.
import React, { useMemo } from 'react';
import { Icon } from '../../UI/icons/Icon';
import { usePresence } from '../../../hooks/ui/usePresence';
import { getMonthCalendarDays, RUSSIAN_MONTHS, RUSSIAN_WEEKDAYS } from '../../../lib/time/dateUtils';

export interface MonthPickerSheetProps {
  isOpen: boolean;
  pickerYear: number;
  pickerMonth: number;
  todayStr: string;
  selectedDate: string;
  /** Даты, в которых есть хоть одна таска, — для точки-индикатора. */
  datesWithTasks: ReadonlySet<string>;
  onClose: () => void;
  onShiftMonth: (delta: -1 | 1) => void;
  onSelectDate: (dateStr: string) => void;
  onSelectToday: () => void;
}

/** Нижний лист выбора даты: сетка месяца с точками тасок. */
export const MonthPickerSheet: React.FC<MonthPickerSheetProps> = ({
  isOpen,
  pickerYear,
  pickerMonth,
  todayStr,
  selectedDate,
  datesWithTasks,
  onClose,
  onShiftMonth,
  onSelectDate,
  onSelectToday,
}) => {
  const {
    ref,
    phase,
    isPresent,
    onTransitionEnd,
  } = usePresence(isOpen);

  const monthCalendarDays = useMemo(
    () => getMonthCalendarDays(pickerYear, pickerMonth),
    [pickerYear, pickerMonth]
  );

  if (!isPresent) return null;

  return (
    <div
      ref={ref}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      onClick={onClose}
      data-testid="month-picker-sheet"
      className="fixed inset-0 z-50 flex flex-col justify-end bg-scrim-80 motion-fade motion-scrim-hold select-none"
    >
      <div
        onClick={e => e.stopPropagation()}
        data-motion-state={phase}
        className="w-full max-h-[85vh] bg-surface border-t border-tint-10 rounded-t-3xl flex flex-col overflow-hidden shadow-2xl motion-sheet"
        style={{ paddingBottom: 'max(var(--sab), 1rem)' }}
      >
        {/* Handle & Header */}
        <div className="flex flex-col items-center pt-2 px-4 border-b border-tint-6 shrink-0">
          <div className="w-10 h-1 rounded-full bg-tint-20 mb-3" />
          <div className="w-full flex items-center justify-between pb-3">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-fg-secondary hover:text-white cursor-pointer"
            >
              Отмена
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onShiftMonth(-1)}
                className="p-1 rounded text-fg-secondary hover:text-white cursor-pointer"
              >
                <Icon name="nav.prev" size="md" tone="inherit" />
              </button>
              <span className="text-sm font-semibold text-white">
                {RUSSIAN_MONTHS[pickerMonth]} {pickerYear}
              </span>
              <button
                type="button"
                onClick={() => onShiftMonth(1)}
                className="p-1 rounded text-fg-secondary hover:text-white cursor-pointer"
              >
                <Icon name="nav.next" size="md" tone="inherit" />
              </button>
            </div>
            <button
              type="button"
              onClick={onSelectToday}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              Сегодня
            </button>
          </div>
        </div>

        {/* Month Calendar Grid */}
        <div className="p-4 flex flex-col gap-2">
          <div className="grid grid-cols-7 gap-1 text-center text-3xs font-mono text-fg-muted uppercase">
            {RUSSIAN_WEEKDAYS.map(w => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthCalendarDays.map(cell => {
              const isToday = cell.dateStr === todayStr;
              const isSelected = cell.dateStr === selectedDate;
              const hasTasks = datesWithTasks.has(cell.dateStr);

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => onSelectDate(cell.dateStr)}
                  className={`h-10 rounded-xl flex flex-col items-center justify-center cursor-pointer relative motion-press ${
                    isSelected
                      ? 'bg-white text-black font-bold shadow-sm'
                      : isToday
                      ? 'border border-tint-30 text-white font-semibold'
                      : cell.isCurrentMonth
                      ? 'text-fg-soft hover:bg-tint-4'
                      : 'text-fg-dim hover:bg-tint-2'
                  }`}
                >
                  <span className="text-xs">{cell.date.getDate()}</span>
                  <div className="h-1 flex items-center justify-center">
                    {hasTasks && (
                      <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-black' : 'bg-fg-secondary'}`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
