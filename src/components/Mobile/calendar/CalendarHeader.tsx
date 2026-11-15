// The phone calendar's top row: month dropdown, today button, agenda / 3-day switch.
import React from 'react';
import { Icon } from '../../UI/icons/Icon';
import type { MobileCalendarMode } from './calendarRange';
import { ResponsiveSegmented, type SegmentedOption } from '../../UI/ResponsiveSegmented';

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

const MODE_OPTIONS: SegmentedOption<MobileCalendarMode>[] = [
  {
    value: 'agenda',
    label: 'Список',
    icon: <Icon name="entity.taskList" size="xs" tone="inherit" />,
    title: 'Режим списка (Повестка)',
  },
  {
    value: '3day',
    label: '3 дня',
    icon: <Icon name="time.threeDay" size="xs" tone="inherit" />,
    title: 'Режим 3 дня (24 часа)',
  },
];

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
      className="border-b border-tint-6 bg-panel px-2 flex items-center justify-between shrink-0 z-20 gap-1 overflow-x-auto scrollbar-none"
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
          className="flex items-center gap-1 py-1 px-1.5 rounded-lg hover:bg-tint-6 motion-press cursor-pointer text-left shrink-0"
        >
          <span className="text-xs font-bold text-white tracking-tight truncate max-w-[105px]">
            {monthLabel}
          </span>
          <Icon name="nav.down" size="sm" className="shrink-0" />
        </button>

        <button
          type="button"
          onClick={onGoToToday}
          className={`h-6 px-1.5 rounded-md text-3xs font-medium cursor-pointer motion-press flex items-center gap-0.5 shrink-0 ${
            isViewingToday
              ? 'text-fg-muted hover:text-fg-tertiary'
              : 'bg-tint-10 text-white font-semibold'
          }`}
          title="Перейти к сегодняшнему дню"
        >
          <span>Сегодня</span>
        </button>
      </div>

      {/* Center: Layout toggle [Список | 3 дня] */}
      <ResponsiveSegmented<MobileCalendarMode>
        variant="xs"
        value={mode}
        onChange={onChangeMode}
        options={MODE_OPTIONS}
      />

      {/* Right: ViewModeSwitcher / Extra slot */}
      {rightSlot && (
        <div className="flex items-center shrink-0">
          {rightSlot}
        </div>
      )}
    </header>
  );
};
