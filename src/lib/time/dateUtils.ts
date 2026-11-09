/**
 * dateUtils.ts — единый модуль работы с датами и расписанием в SLAG v2.
 */

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
