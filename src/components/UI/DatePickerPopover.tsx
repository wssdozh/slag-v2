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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePresence } from '../../hooks/ui/usePresence';

export interface DatePickerPopoverProps {
  isOpen?: boolean;
  value?: string;
  onChange: (dateIso: string) => void;
  onClear?: () => void;
  onClose: () => void;
  direction?: 'up' | 'down';
  className?: string;
}

export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  isOpen = true,
  value,
  onChange,
  onClear,
  onClose,
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
      onTransitionEnd={onTransitionEnd}
      inert={!isOpen}
      onClick={(e) => e.stopPropagation()}
      className={`absolute left-0 ${positionClasses} w-64 rounded-2xl bg-surface-elevated/98 backdrop-blur-xl border border-white/[0.1] shadow-2xl shadow-black/90 p-2.5 z-50 flex flex-col gap-2 select-none motion-popover ${className}`}
    >
      {/* Quick Presets */}
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={() => {
            onChange(getTodayIso());
            onClose();
          }}
          className="px-2 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer text-center"
        >
          Сегодня
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(getTomorrowIso());
            onClose();
          }}
          className="px-2 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer text-center"
        >
          Завтра
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(getNextWeekIso());
            onClose();
          }}
          className="px-2 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer text-center"
        >
          След. нед
        </button>
      </div>

      <div className="h-px bg-white/[0.06] -mx-1" />

      {/* Month Navigation */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Предыдущий месяц"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="text-xs font-semibold text-zinc-200">
          {RUSSIAN_MONTHS[currentMonth]} {currentYear}
        </span>

        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Следующий месяц"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {RUSSIAN_WEEKDAYS.map(wd => (
          <span key={wd} className="text-[10px] font-mono text-zinc-500 font-medium">
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
              onClick={() => {
                onChange(cell.dateStr);
                onClose();
              }}
              className={`h-7 rounded-lg text-xs flex items-center justify-center transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-accent text-white font-bold shadow-sm'
                  : isToday
                  ? 'border border-blue-500/50 text-blue-400 font-semibold hover:bg-blue-500/10'
                  : cell.isCurrentMonth
                  ? 'text-zinc-200 hover:bg-white/[0.08] hover:text-white'
                  : 'text-zinc-600 hover:bg-white/[0.04]'
              }`}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>

      {/* Clear Button (if date is selected) */}
      {value && onClear && (
        <>
          <div className="h-px bg-white/[0.06] -mx-1" />
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="w-full py-1 text-center text-xs text-rose-400/90 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
          >
            Снять срок
          </button>
        </>
      )}
    </div>
  );
};
