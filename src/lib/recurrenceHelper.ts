import type { RecurrenceRule, SlagItem } from '../types';
import { getISODateString } from './dateUtils';

export { getISODateString };

export const RECURRENCE_PRESETS: Array<{ label: string; rule: RecurrenceRule }> = [
  { label: 'Каждый день', rule: { freq: 'daily', interval: 1, resetSubtasks: true } },
  { label: 'По будням (Пн-Пт)', rule: { freq: 'weekdays', interval: 1, resetSubtasks: true } },
  { label: 'Каждую неделю', rule: { freq: 'weekly', interval: 1, resetSubtasks: true } },
  { label: 'Каждый месяц', rule: { freq: 'monthly', interval: 1, resetSubtasks: true } },
];

export function parseISODateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/**
 * ISO weekday: 1 = Monday, 2 = Tuesday, ..., 7 = Sunday
 */
export function getIsoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

const RUSSIAN_DAY_NAMES: Record<number, string> = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Вс',
};

/**
 * Returns human-readable label for recurrence rule
 */
export function formatRecurrenceLabel(recurrence?: RecurrenceRule): string {
  if (!recurrence) return '';
  const interval = recurrence.interval || 1;

  switch (recurrence.freq) {
    case 'daily':
      return interval === 1 ? 'Каждый день' : `Каждые ${interval} дн.`;
    case 'weekdays':
      return 'По будням';
    case 'weekly':
      if (recurrence.weekdays && recurrence.weekdays.length > 0) {
        const days = recurrence.weekdays.map(d => RUSSIAN_DAY_NAMES[d] || String(d)).join(', ');
        return `Каждый ${days}`;
      }
      return interval === 1 ? 'Каждую неделю' : `Каждые ${interval} нед.`;
    case 'monthly':
      return interval === 1 ? 'Каждый месяц' : `Каждые ${interval} мес.`;
    case 'yearly':
      return interval === 1 ? 'Каждый год' : `Каждые ${interval} г.`;
    default:
      return 'Повторяется';
  }
}

/**
 * Computes the next occurrence date for a recurring task when completed or rescheduled.
 * If the task is overdue (currentDueDate < today), advances to the next future occurrence.
 */
export function computeNextOccurrence(
  currentDueDate: string,
  recurrence: RecurrenceRule,
  currentTimeIso?: string,
  referenceDate: Date = new Date()
): { nextDueDate: string; nextReminder?: string } {
  const todayStr = getISODateString(referenceDate);
  const baseDate = parseISODateString(currentDueDate < todayStr ? todayStr : currentDueDate);
  const interval = Math.max(1, recurrence.interval || 1);

  let nextDate = new Date(baseDate);

  switch (recurrence.freq) {
    case 'daily': {
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    }

    case 'weekdays': {
      do {
        nextDate.setDate(nextDate.getDate() + 1);
      } while (getIsoWeekday(nextDate) > 5);
      break;
    }

    case 'weekly': {
      if (recurrence.weekdays && recurrence.weekdays.length > 0) {
        const targetDays = new Set(recurrence.weekdays);
        let found = false;
        // Search up to 3 weeks ahead for the next matching weekday
        for (let i = 1; i <= 21; i++) {
          const candidate = new Date(baseDate);
          candidate.setDate(candidate.getDate() + i);
          if (targetDays.has(getIsoWeekday(candidate))) {
            nextDate = candidate;
            found = true;
            break;
          }
        }
        if (!found) {
          nextDate.setDate(nextDate.getDate() + 7 * interval);
        }
      } else {
        nextDate.setDate(nextDate.getDate() + 7 * interval);
      }
      break;
    }

    case 'monthly': {
      const originalDay = baseDate.getDate();
      nextDate.setMonth(nextDate.getMonth() + interval);
      // Guard against month day overflow (e.g. Jan 31 -> Feb 28)
      if (nextDate.getDate() !== originalDay) {
        nextDate.setDate(0); // clamp to last day of target month
      }
      break;
    }

    case 'yearly': {
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
    }

    default: {
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    }
  }

  const nextDueDate = getISODateString(nextDate);
  let nextReminder: string | undefined = undefined;

  if (currentTimeIso) {
    try {
      const orig = new Date(currentTimeIso);
      if (!isNaN(orig.getTime())) {
        const nextDt = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), orig.getHours(), orig.getMinutes(), 0, 0);
        nextReminder = nextDt.toISOString();
      }
    } catch {
      // fallback
    }
  }

  return { nextDueDate, nextReminder };
}

/**
 * Computes all future occurrences of a recurring task that fall inside [startRangeStr, endRangeStr].
 * Does NOT include the task's base dueDate itself (since the real task already represents it).
 */
export function getRecurringOccurrencesInRange(
  task: SlagItem,
  startRangeStr: string,
  endRangeStr: string,
  maxCount: number = 50
): string[] {
  if (!task.recurrence || !task.dueDate) return [];

  const occurrences: string[] = [];
  let currentDue = task.dueDate;
  let count = 0;

  while (count < maxCount) {
    count++;
    const { nextDueDate } = computeNextOccurrence(currentDue, task.recurrence, task.reminder);
    if (nextDueDate <= currentDue) break; // Infinite loop safeguard
    currentDue = nextDueDate;

    if (currentDue > endRangeStr) break;
    if (currentDue >= startRangeStr) {
      occurrences.push(currentDue);
    }
  }

  return occurrences;
}
