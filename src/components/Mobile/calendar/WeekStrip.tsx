// The seven-day strip: weekday, number, and a dot when that day has tasks.
import React from 'react';
import { RUSSIAN_WEEKDAYS } from '../../../lib/time/dateUtils';
import type { CalendarDay } from './calendarRange';

export interface WeekStripProps {
  days: CalendarDay[];
  todayStr: string;
  selectedDate: string;
  /** Даты, в которых есть хоть одна таска, — для точки-индикатора. */
  datesWithTasks: ReadonlySet<string>;
  onSelectDay: (dateStr: string) => void;
  onTouchStart: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd: React.TouchEventHandler<HTMLDivElement>;
}

/** Недельный стрип из семи дней: день недели, число, точка наличия тасок. */
export const WeekStrip: React.FC<WeekStripProps> = ({
  days,
  todayStr,
  selectedDate,
  datesWithTasks,
  onSelectDay,
  onTouchStart,
  onTouchEnd,
}) => {
  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="px-3 py-2 border-b border-white/[0.06] bg-panel/80 shrink-0"
    >
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const isToday = day.dateStr === todayStr;
          const isSelected = day.dateStr === selectedDate;
          const hasTasks = datesWithTasks.has(day.dateStr);

          return (
            <button
              key={day.dateStr}
              type="button"
              onClick={() => onSelectDay(day.dateStr)}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl cursor-pointer relative motion-press ${
                isSelected
                  ? 'bg-white text-black font-bold shadow-sm'
                  : isToday
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
              }`}
            >
              <span className={`text-[10px] font-mono uppercase ${isSelected ? 'text-black/70' : 'text-zinc-500'}`}>
                {RUSSIAN_WEEKDAYS[day.weekdayIndex]}
              </span>
              <span className="text-xs font-semibold mt-0.5">
                {day.dayNum}
              </span>

              {/* Event Dot Indicator */}
              <div className="h-1 flex items-center justify-center mt-0.5">
                {hasTasks ? (
                  <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-black' : 'bg-zinc-400'}`} />
                ) : isToday && !isSelected ? (
                  <span className="w-1 h-1 rounded-full bg-zinc-600" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
