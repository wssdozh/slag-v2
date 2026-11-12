import React from 'react';
import { ChevronDown, ListTodo, Columns } from 'lucide-react';
import type { MobileCalendarMode } from './calendarRange';

export interface CalendarHeaderProps {
  embedded: boolean;
  mode: MobileCalendarMode;
  /** «Ноябрь 2026» из `formatMonthHeading`. */
  monthLabel: string;
  /** Уже смотрим сегодняшний период — кнопка «Сегодня» гаснет. */
  isViewingToday: boolean;
  rightSlot?: React.ReactNode;
  onOpenMonthPicker: () => void;
  onGoToToday: () => void;
  onChangeMode: (mode: MobileCalendarMode) => void;
}

/** Одна строка 44px: месяц-дропдаун, «Сегодня», переключатель «Список / 3 дня». */
export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  embedded,
  mode,
  monthLabel,
  isViewingToday,
  rightSlot,
  onOpenMonthPicker,
  onGoToToday,
  onChangeMode,
}) => {
  return (
    <header
      className="border-b border-white/[0.06] bg-panel px-2 flex items-center justify-between shrink-0 z-20 gap-1 overflow-x-auto scrollbar-none"
      style={{
        height: embedded ? '2.75rem' : 'calc(2.75rem + max(var(--sat), 0px))',
        paddingTop: embedded ? '0px' : 'max(var(--sat), 0px)',
      }}
    >
      {/* Left: Month Dropdown Button & Today shortcut */}
      <div className="flex items-center gap-1 min-w-0 shrink-0">
        <button
          type="button"
          onClick={onOpenMonthPicker}
          className="flex items-center gap-1 py-1 px-1.5 rounded-lg hover:bg-white/[0.06] motion-press cursor-pointer text-left shrink-0"
        >
          <span className="text-xs font-bold text-white tracking-tight truncate max-w-[105px]">
            {monthLabel}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={onGoToToday}
          className={`h-6 px-1.5 rounded-md text-[10px] font-medium cursor-pointer motion-press flex items-center gap-0.5 shrink-0 ${
            isViewingToday
              ? 'text-zinc-500 hover:text-zinc-300'
              : 'bg-white/10 text-white font-semibold'
          }`}
          title="Перейти к сегодняшнему дню"
        >
          <span>Сегодня</span>
        </button>
      </div>

      {/* Center: Layout toggle [Список | 3 дня] */}
      <div className="flex items-center bg-surface p-0.5 rounded-lg border border-white/[0.08] shrink-0">
        <button
          type="button"
          onClick={() => onChangeMode('agenda')}
          className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
            mode === 'agenda'
              ? 'bg-white/10 text-white shadow-xs font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="Режим списка (Повестка)"
        >
          <ListTodo className="w-3 h-3" />
          <span>Список</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeMode('3day')}
          className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
            mode === '3day'
              ? 'bg-white/10 text-white shadow-xs font-semibold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
          title="Режим 3 дня (24 часа)"
        >
          <Columns className="w-3 h-3" />
          <span>3 дня</span>
        </button>
      </div>

      {/* Right: ViewModeSwitcher / Extra slot */}
      {rightSlot && (
        <div className="flex items-center shrink-0">
          {rightSlot}
        </div>
      )}
    </header>
  );
};
