/**
 * calendarPositions.ts — чистая раскладка повестки: порядок строк, линия «сейчас»,
 * геометрия таймлайна. Минуты и пиксели вместо JSX, чтобы это можно было проверить
 * без рендера.
 */
import type { LayoutPositionedTask } from '../../../lib/time/calendarLayout';
import { computeAntiOverlapLayout } from '../../../lib/time/calendarLayout';
import { getTaskTimeSlot } from '../../../lib/time/todoistTaskParser';
import type { CalendarTask } from '../../../hooks/useCalendarSchedule';
import type { CalendarDay } from './calendarRange';
import { formatDayHeading } from './calendarRange';

export const HOURS_24: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);

/** Высота часа в трёхдневной сетке. */
export const HOUR_HEIGHT = 54;

export interface CalendarSlotTarget {
  dateStr: string;
  hour: number;
}

export interface AgendaDayLayout {
  day: CalendarDay;
  isToday: boolean;
  heading: string;
  sortedTasks: CalendarTask[];
  /** Перед этой строкой встаёт линия «сейчас»; -1 — в этом дне линии нет. */
  nowLineIndex: number;
}

/** Повторяющаяся таска живёт в календаре под синтетическим id `<id>_virtual_<дата>`. */
export function realTaskId(taskId: string): string {
  return taskId.replace(/_virtual_.*$/, '');
}

export function formatClockLabel(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Сначала таски на весь день, дальше по времени начала. */
export function sortTasksChronologically(tasks: CalendarTask[]): CalendarTask[] {
  return [...tasks].sort((a, b) => {
    const slotA = getTaskTimeSlot(a);
    const slotB = getTaskTimeSlot(b);
    if (slotA.isAllDay && !slotB.isAllDay) return -1;
    if (!slotA.isAllDay && slotB.isAllDay) return 1;
    if (!slotA.isAllDay && !slotB.isAllDay) {
      const minutesA = slotA.startHour * 60 + slotA.startMinute;
      const minutesB = slotB.startHour * 60 + slotB.startMinute;
      return minutesA - minutesB;
    }
    return 0;
  });
}

/** Индекс первой таски, которая начинается позже «сейчас»; `length` — линия в конце. */
export function findNowLineIndex(tasks: CalendarTask[], nowMinute: number): number {
  for (let index = 0; index < tasks.length; index++) {
    const slot = getTaskTimeSlot(tasks[index]);
    const startMinutes = slot.isAllDay ? -1 : slot.startHour * 60 + slot.startMinute;
    if (startMinutes > nowMinute) return index;
  }
  return tasks.length;
}

/** Всё, что нужно одному дню повестки: заголовок, порядок строк, место линии «сейчас». */
export function buildAgendaDay(
  day: CalendarDay,
  tasks: CalendarTask[],
  now: { todayStr: string; tomorrowStr: string; nowMinute: number }
): AgendaDayLayout {
  const isToday = day.dateStr === now.todayStr;
  const sortedTasks = sortTasksChronologically(tasks);

  return {
    day,
    isToday,
    heading: formatDayHeading(day, now.todayStr, now.tomorrowStr),
    sortedTasks,
    nowLineIndex: isToday ? findNowLineIndex(sortedTasks, now.nowMinute) : -1,
  };
}

export function minuteToPx(minuteOfDay: number, hourHeight = HOUR_HEIGHT): number {
  return (minuteOfDay / 60) * hourHeight;
}

/** Прокрутка дневной сетки на час выше текущего часа. */
export function scrollTopForHour(hour: number, hourHeight = HOUR_HEIGHT): number {
  return Math.max(0, hour - 1) * hourHeight;
}

export interface ThreeDayColumn {
  day: CalendarDay;
  isToday: boolean;
  allDayTasks: CalendarTask[];
  timedBlocks: LayoutPositionedTask[];
  ribbonTopPx: number;
}

/** Колонки трёхдневки: чипы на весь день, блоки по времени и позиция красной линии. */
export function buildThreeDayColumns(
  days: CalendarDay[],
  tasksByDate: Record<string, CalendarTask[]>,
  todayStr: string,
  nowMinute: number
): ThreeDayColumn[] {
  const ribbonTopPx = minuteToPx(nowMinute);

  return days.map(day => {
    const dayTasks = tasksByDate[day.dateStr] ?? [];

    return {
      day,
      isToday: day.dateStr === todayStr,
      allDayTasks: dayTasks.filter(task => getTaskTimeSlot(task).isAllDay),
      timedBlocks: computeAntiOverlapLayout(
        dayTasks.filter(task => !getTaskTimeSlot(task).isAllDay),
        HOUR_HEIGHT
      ),
      ribbonTopPx,
    };
  });
}
