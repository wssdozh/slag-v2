/**
 * calendarRange.ts — чистые вычисления календарной сетки мобильного календаря:
 * недельный стрип, трёхдневное окно, заголовок месяца и переходы по датам.
 *
 * Только даты: ни React, ни DOM. Поэтому проверяется в отрыве от вёрстки.
 */
import {
  getISODateString,
  getMondayOfWeek,
  getTodayString,
  getWeekDays,
  RUSSIAN_MONTHS,
  RUSSIAN_WEEKDAYS,
} from '../../../lib/time/dateUtils';

export type MobileCalendarMode = 'agenda' | '3day';

export interface CalendarDay {
  date: Date;
  dateStr: string;
  dayNum: number;
  /** 0 = понедельник, как в `RUSSIAN_WEEKDAYS`. */
  weekdayIndex: number;
}

/** `2026-11-12` → локальная полночь этого дня (не UTC, в отличие от `new Date(str)`). */
export function parseISODate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** Семь дней недели начиная с понедельника. */
export function buildWeekDays(monday: Date): CalendarDay[] {
  return getWeekDays(monday).map((date, weekdayIndex) => ({
    date,
    dateStr: getISODateString(date),
    dayNum: date.getDate(),
    weekdayIndex,
  }));
}

/** Три подряд идущих дня, начиная со `startDateStr`. */
export function buildThreeDayWindow(startDateStr: string): CalendarDay[] {
  const base = parseISODate(startDateStr);
  const days: CalendarDay[] = [];

  for (let i = 0; i < 3; i++) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    days.push({
      date,
      dateStr: getISODateString(date),
      dayNum: date.getDate(),
      weekdayIndex: (date.getDay() + 6) % 7,
    });
  }

  return days;
}

/** Сдвиг понедельника на `weekDelta` недель. */
export function shiftWeek(monday: Date, weekDelta: number): Date {
  const shifted = new Date(monday);
  shifted.setDate(shifted.getDate() + weekDelta * 7);
  return shifted;
}

/** Сдвиг ISO-даты на `dayDelta` дней. */
export function shiftDateStr(dateStr: string, dayDelta: number): string {
  const date = parseISODate(dateStr);
  date.setDate(date.getDate() + dayDelta);
  return getISODateString(date);
}

/**
 * Подпись периода в шапке: в повестке — месяц середины недели, в трёхдневке —
 * месяц первого дня окна.
 */
export function formatMonthHeading(
  mode: MobileCalendarMode,
  currentWeekMonday: Date,
  threeDayStartDate: string
): string {
  if (mode === '3day') {
    const start = parseISODate(threeDayStartDate);
    return `${RUSSIAN_MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }

  const middle = new Date(currentWeekMonday);
  middle.setDate(currentWeekMonday.getDate() + 3);
  return `${RUSSIAN_MONTHS[middle.getMonth()]} ${middle.getFullYear()}`;
}

export function isCurrentWeekMonday(currentWeekMonday: Date, todayStr: string): boolean {
  if (!todayStr) return false;
  const todayMonday = getMondayOfWeek(parseISODate(todayStr));
  return getISODateString(todayMonday) === getISODateString(currentWeekMonday);
}

/** «Сегодня · 12 ноя., СР» / «12 ноя., СР». */
export function formatDayHeading(day: CalendarDay, todayStr: string, tomorrowStr: string): string {
  const shortMonth = RUSSIAN_MONTHS[day.date.getMonth()].slice(0, 3).toLowerCase();
  const body = `${day.dayNum} ${shortMonth}., ${RUSSIAN_WEEKDAYS[day.weekdayIndex]}`;

  if (day.dateStr === todayStr) return `Сегодня · ${body}`;
  if (day.dateStr === tomorrowStr) return `Завтра · ${body}`;
  return body;
}

/** Понедельник и ISO-строка сегодняшнего дня — общая точка для «Сегодня» и пикера. */
export function todayAnchor(todayStr: string): { monday: Date; dateStr: string } {
  const date = parseISODate(todayStr || getTodayString());
  return { monday: getMondayOfWeek(date), dateStr: getISODateString(date) };
}

/** Дата, с которой открывается месячный пикер. */
export function pickerAnchorDate(
  mode: MobileCalendarMode,
  currentWeekMonday: Date,
  threeDayStartDate: string
): Date {
  return mode === '3day' ? parseISODate(threeDayStartDate) : currentWeekMonday;
}
