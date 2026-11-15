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
      className="px-3 py-2 border-b border-tint-6 bg-panel/80 shrink-0"
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
                  ? 'bg-tint-8 text-white'
                  : 'text-fg-secondary hover:text-white hover:bg-tint-3'
              }`}
            >
              <span className={`text-3xs font-mono uppercase ${isSelected ? 'text-scrim-70' : 'text-fg-muted'}`}>
                {RUSSIAN_WEEKDAYS[day.weekdayIndex]}
              </span>
              <span className="text-xs font-semibold mt-0.5">
                {day.dayNum}
              </span>

              {/* Event Dot Indicator */}
              <div className="h-1 flex items-center justify-center mt-0.5">
                {hasTasks ? (
                  <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-black' : 'bg-fg-secondary'}`} />
                ) : isToday && !isSelected ? (
                  <span className="w-1 h-1 rounded-full bg-fg-dim" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
