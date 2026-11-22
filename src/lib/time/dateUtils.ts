/**
 * dateUtils.ts — единый модуль работы с датами и расписанием в SLAG v2.
 *
 * Что означает `reminder` и как его записать — в `./reminder`, чтобы разбор часа был один.
 */
import { reminderClock, reminderClockLabel, reminderDay } from './reminder';

export const RUSSIAN_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
] as const;

export const RUSSIAN_WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'] as const;

export function getISODateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODateString(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return new Date(NaN);
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(y, m - 1, d);
  return y >= 1 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : new Date(NaN);
}

export function getTodayIso(): string {
  return getISODateString(new Date());
}

export function getTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getISODateString(d);
}

export function getNextWeekIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return getISODateString(d);
}

// Алиасы для обратной совместимости
export const getTodayString = getTodayIso;
export const getTomorrowString = getTomorrowIso;
export const getNextWeekString = getNextWeekIso;

export function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getWeekDays(monday: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const next = new Date(monday);
    next.setDate(monday.getDate() + i);
    days.push(next);
  }
  return days;
}

export interface MonthCalendarCell {
  date: Date;
  isCurrentMonth: boolean;
  dateStr: string;
}

export function getMonthCalendarDays(year: number, month: number): MonthCalendarCell[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startMonday = getMondayOfWeek(firstDay);

  const cells: MonthCalendarCell[] = [];
  const current = new Date(startMonday);

  while (current <= lastDay || cells.length % 7 !== 0) {
    cells.push({
      date: new Date(current),
      isCurrentMonth: current.getMonth() === month,
      dateStr: getISODateString(current),
    });
    current.setDate(current.getDate() + 1);
  }

  return cells;
}

export function formatDueDateLabel(dateIso: string, rawMatchedText?: string): string {
  if (rawMatchedText && rawMatchedText.length <= 16) {
    return rawMatchedText.charAt(0).toUpperCase() + rawMatchedText.slice(1);
  }
  const today = getTodayIso();
  const tomorrow = getTomorrowIso();
  if (dateIso === today) return 'Сегодня';
  if (dateIso === tomorrow) return 'Завтра';

  try {
    const [y, m, d] = dateIso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return dateIso;
  }
}

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] as const;

/**
 * День со днём недели: `пн, 16 ноя`. Для карточки действия — там дата стоит первой,
 * потому что человек ищет в ней «когда», а не «что».
 */
export function formatDayStamp(dueDate?: string, reminder?: string): string {
  const stamp = formatDueStamp(dueDate, reminder);
  if (!stamp || !dueDate) return stamp;
  const [year, month, day] = dueDate.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return stamp;
  // Monday-first, like the calendar above the feed.
  const weekday = RUSSIAN_WEEKDAYS[(new Date(year, month - 1, day).getDay() + 6) % 7];
  return `${weekday.toLowerCase()}, ${stamp}`;
}

/**
 * Срок так, как его читают в ленте: `13 ноя · 17:42`.
 *
 * Время показываем только когда `reminder` действительно про этот день: у задачи
 * с датой и отдельно поставленным напоминанием «на послезавтра» подпись не должна
 * обещать чужой день. Голое `HH:MM` считается временем самого `dueDate`.
 */
export function formatDueStamp(dueDate?: string, reminder?: string): string {
  if (!dueDate) return '';
  const parts = dueDate.split('-');
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (parts.length !== 3 || ![year, monthIdx, day].every(Number.isFinite) || monthIdx < 0 || monthIdx > 11) {
    return dueDate;
  }

  const shortDay = year === new Date().getFullYear()
    ? `${day} ${SHORT_MONTHS[monthIdx]}`
    : `${day} ${SHORT_MONTHS[monthIdx]} ${year}`;

  // Голое время принадлежит самому `dueDate`; у момента свои сутки, и чужие часы под этой
  // датой обещали бы не тот день.
  const clock = reminderClock(reminder);
  const momentDay = reminderDay(reminder);
  if (!clock || (momentDay !== null && momentDay !== dueDate)) return shortDay;

  return `${shortDay} · ${reminderClockLabel(reminder)}`;
}

/**
 * Русское склонение по числу: pluralRu(2, ['таска', 'таски', 'тасок']) → «таски».
 * Одна функция вместо тернарников в каждом счётчике.
 */
export function pluralRu(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (tail > 1 && tail < 5) return forms[1];
  if (tail === 1) return forms[0];
  return forms[2];
}

/**
 * Дыхание между соседними заметками: записи одного часа стоят плотно, разрыв в часы — шире.
 *
 * Ступени, а не непрерывная шкала: отступ растёт от разницы во времени, и любая формула с
 * минутами превращает список в дрожащую вёрстку, которую дёргает любой пересохранённый элемент.
 * Границу дня отдельно не считаем — её задаёт групповой gap с пузырём даты.
 */
export function noteGapPx(previousMs: number, nextMs: number): number {
  return Math.abs(nextMs - previousMs) < 60 * 60 * 1000 ? 6 : 12;
}
