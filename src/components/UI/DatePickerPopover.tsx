// Picks a due date: month grid, quick today/tomorrow/next-week, and a clear action.
import React, { useState, useMemo, useEffect } from 'react';
import {
  getMonthCalendarDays,
  RUSSIAN_MONTHS,
  RUSSIAN_WEEKDAYS,
  getTodayIso,
  getTomorrowIso,
  getNextWeekIso,
} from '../../lib/time/dateUtils';
import { Icon } from './icons/Icon';
import { usePresence } from '../../hooks/ui/usePresence';

export interface DatePickerPopoverProps {
  isOpen?: boolean;
  value?: string;
  onChange: (dateIso: string) => void;
  onClear?: () => void;
  onClose: () => void;
  /** `HH:MM` of the task's reminder, when the caller edits a time at all. */
  time?: string;
  onTimeChange?: (time: string | null) => void;
  direction?: 'up' | 'down';
  className?: string;
}

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Typed, not wheeled: the time is four digits, and a field beats a wheel for four digits. */
const TimeField: React.FC<{ value?: string; onChange: (time: string | null) => void }> = ({ value, onChange }) => {
  const [draft, setDraft] = useState(value ?? '');
  const [seen, setSeen] = useState(value);

  // A field keeps its own text while being typed; the prop only wins when it actually changed.
  if (seen !== value) {
    setSeen(value);
    setDraft(value ?? '');
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    if (CLOCK.test(trimmed)) onChange(trimmed.length === 4 ? `0${trimmed}` : trimmed);
    else setDraft(value ?? '');
  };

  return (
    <label className="flex items-center gap-2.5 h-9 px-1 border-b border-tint-8 focus-within:border-hover transition-colors">
      <Icon name="time.time" size="sm" className="shrink-0 text-fg-muted" />
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          commit();
        }}
        placeholder="чч:мм"
        inputMode="numeric"
        aria-label="время задачи"
        data-testid="date-popover-time"
        className="flex-1 min-w-0 bg-transparent font-mono text-sm text-fg-soft placeholder-fg-dim outline-none ring-0"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChange(null);
          }}
          title="Снять время"
          className="p-0.5 shrink-0 text-fg-muted hover:text-rose-400 transition-colors cursor-pointer"
        >
          <Icon name="action.close" size="sm" tone="inherit" />
        </button>
      ) : (
        <span className="text-2xs text-fg-dim shrink-0">нет</span>
      )}
    </label>
  );
};

export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  isOpen = true,
  value,
  onChange,
  onClear,
  onClose,
  time,
  onTimeChange,
  direction = 'up',
  className = '',
}) => {
  const { ref: containerRef, phase, isPresent, onTransitionEnd } = usePresence(isOpen);

  const [currentYear, setCurrentYear] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split('-').map(Number);
      return parts[0];
    }
    return new Date().getFullYear();
  });

  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split('-').map(Number);
      return parts[1] - 1;
    }
    return new Date().getMonth();
  });

  const [todayIso] = useState(() => getTodayIso());

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, containerRef]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const days = useMemo(() => {
    return getMonthCalendarDays(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const positionClasses = direction === 'up'
    ? 'bottom-full mb-1.5'
    : 'top-full mt-1.5';

  if (!isPresent) return null;

  return (
    <div
      ref={containerRef}
      data-motion-state={phase}
      data-testid="date-popover"
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      onClick={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-64 rounded-2xl bg-surface-elevated/98 backdrop-blur-xl border border-tint-10 shadow-2xl shadow-scrim-90 p-2.5 z-50 flex flex-col gap-2 select-none motion-popover ${className}`}
    >
      {/* Quick Presets. Picking a day no longer closes the popover: the time sits right below it,
          and reopening the calendar to type four digits was the whole reason people skipped it. */}
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => onChange(getTodayIso())}
          className="px-2 py-1 rounded-lg text-xs font-medium text-fg-tertiary hover:text-white bg-tint-4 hover:bg-tint-8 transition-colors cursor-pointer text-center"
        >
          Сегодня
        </button>
        <button
          type="button"
          onClick={() => onChange(getTomorrowIso())}
          className="px-2 py-1 rounded-lg text-xs font-medium text-fg-tertiary hover:text-white bg-tint-4 hover:bg-tint-8 transition-colors cursor-pointer text-center"
        >
          Завтра
        </button>
        <button
          type="button"
          onClick={() => onChange(getNextWeekIso())}
          className="px-2 py-1 rounded-lg text-xs font-medium text-fg-tertiary hover:text-white bg-tint-4 hover:bg-tint-8 transition-colors cursor-pointer text-center"
        >
          След. нед
        </button>
      </div>

      <div className="h-px bg-tint-6 -mx-1" />

      {/* Month Navigation */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 rounded-md text-fg-secondary hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
          title="Предыдущий месяц"
        >
          <Icon name="nav.prev" size="md" tone="inherit" />
        </button>

        <span className="text-xs font-semibold text-fg-soft">
          {RUSSIAN_MONTHS[currentMonth]} {currentYear}
        </span>

        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 rounded-md text-fg-secondary hover:text-white hover:bg-tint-8 transition-colors cursor-pointer"
          title="Следующий месяц"
        >
          <Icon name="nav.next" size="md" tone="inherit" />
        </button>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {RUSSIAN_WEEKDAYS.map(wd => (
          <span key={wd} className="text-3xs font-mono text-fg-muted font-medium">
            {wd}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {days.map(cell => {
          const isSelected = cell.dateStr === value;
          const isToday = cell.dateStr === todayIso;

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onChange(cell.dateStr)}
              className={`h-7 rounded-lg text-xs flex items-center justify-center transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-accent text-white font-bold shadow-sm'
                  : isToday
                  ? 'border border-blue-500/50 text-blue-400 font-semibold hover:bg-blue-500/10'
                  : cell.isCurrentMonth
                  ? 'text-fg-soft hover:bg-tint-8 hover:text-white'
                  : 'text-fg-dim hover:bg-tint-4'
              }`}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Time of day lives next to the date it belongs to, not in a second popover. It stays
          visible before a day is picked: typing a time sets today, and hiding the field until
          then made the feature look absent. */}
      {onTimeChange && (
        <>
          <div className="h-px bg-tint-6 -mx-1" />
          <TimeField value={time} onChange={onTimeChange} />
        </>
      )}

      {/* Clear Button (if date is selected) */}
      {value && onClear && (
        <>
          <div className="h-px bg-tint-6 -mx-1" />
          <button
            type="button"
            onClick={onClear}
            className="w-full py-1 text-center text-xs text-rose-400/90 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
          >
            Снять срок
          </button>
        </>
      )}

      <div className="h-px bg-tint-6 -mx-1" />
      <button
        type="button"
        onClick={onClose}
        className="w-full py-1.5 text-center text-xs font-medium text-fg-soft hover:text-white bg-tint-6 hover:bg-tint-10 rounded-lg transition-colors cursor-pointer"
      >
        Готово
      </button>
    </div>
  );
};
