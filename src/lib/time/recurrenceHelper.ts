// Recurrence rules: parse, describe and advance a repeating task to its next occurrence.
import type { RecurrenceRule, SlagItem } from '../../types';
import { getISODateString, parseISODateString } from './dateUtils';
import { shiftReminderToDay } from './reminder';
import { setAllCheckboxesInContent, parseSubtasksFromContent } from '../tasks/taskUtils';

export const RECURRENCE_PRESETS: Array<{ label: string; rule: RecurrenceRule }> = [
  { label: 'Каждый день', rule: { freq: 'daily', interval: 1, resetSubtasks: true } },
  { label: 'По будням (Пн-Пт)', rule: { freq: 'weekdays', interval: 1, resetSubtasks: true } },
  { label: 'Каждую неделю', rule: { freq: 'weekly', interval: 1, resetSubtasks: true } },
  { label: 'Каждый месяц', rule: { freq: 'monthly', interval: 1, resetSubtasks: true } },
];

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
        if (interval > 1) return `Каждые ${interval} нед. по ${days}`;
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
 * Strictly advances baseDueDate by the recurrence rule without clamping to today.
 */
export function computeNextStrictOccurrenceDate(
  baseDueDate: string,
  recurrence: RecurrenceRule
): string {
  const baseDate = parseISODateString(baseDueDate);
  if (!Number.isFinite(baseDate.getTime())) return baseDueDate;
  const rawInterval = recurrence.interval;
  const interval = rawInterval !== undefined && Number.isSafeInteger(rawInterval) && rawInterval >= 1
    ? rawInterval
    : 1;
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
      const days = [...new Set(recurrence.weekdays || [])]
        .filter(day => Number.isInteger(day) && day >= 1 && day <= 7)
        .sort((a, b) => a - b);
      if (days.length > 0) {
        const weekday = getIsoWeekday(baseDate);
        const laterDay = days.find(day => day > weekday);
        // Selected days share an active ISO week; interval skips whole inactive weeks.
        const offset = laterDay !== undefined ? laterDay - weekday : 7 * interval - weekday + days[0];
        nextDate.setDate(nextDate.getDate() + offset);
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
      if (nextDate.getMonth() !== baseDate.getMonth()) nextDate.setDate(0);
      break;
    }

    default: {
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    }
  }

  // Invalid/overflowing input must never create a non-advancing recurrence loop.
  return Number.isFinite(nextDate.getTime()) && nextDate.getFullYear() <= 9999
    ? getISODateString(nextDate)
    : baseDueDate;
}

function occurrenceOnOrAfter(baseDueDate: string, recurrence: RecurrenceRule, target: string): string {
  let current = baseDueDate;
  while (current < target) {
    const next = computeNextStrictOccurrenceDate(current, recurrence);
    if (next <= current) return current;
    current = next;
  }
  return current;
}

/**
 * Computes the next occurrence date for a recurring task when completed or rescheduled.
 * If overdue, advances along the existing schedule to its first occurrence on or after the reference day.
 */
export function computeNextOccurrence(
  currentDueDate: string,
  recurrence: RecurrenceRule,
  currentTimeIso?: string,
  referenceDate: Date = new Date()
): { nextDueDate: string; nextReminder?: string } {
  const firstNext = computeNextStrictOccurrenceDate(currentDueDate, recurrence);
  const nextDueDate = Number.isFinite(referenceDate.getTime())
    ? occurrenceOnOrAfter(firstNext, recurrence, getISODateString(referenceDate))
    : firstNext;
  return { nextDueDate, nextReminder: shiftReminderToDay(currentTimeIso, currentDueDate, nextDueDate) };
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
  if (!task.recurrence || !task.dueDate || !Number.isSafeInteger(maxCount) || maxCount < 1
    || ![task.dueDate, startRangeStr, endRangeStr].every(date => Number.isFinite(parseISODateString(date).getTime()))
    || startRangeStr > endRangeStr) return [];

  const occurrences: string[] = [];
  let currentDue = task.dueDate;

  while (occurrences.length < maxCount) {
    const nextDueDate = computeNextStrictOccurrenceDate(currentDue, task.recurrence);
    if (nextDueDate <= currentDue) break; // Infinite loop safeguard
    currentDue = nextDueDate;

    if (currentDue > endRangeStr) break;
    if (currentDue >= startRangeStr) {
      occurrences.push(currentDue);
    }
  }

  return occurrences;
}

/**
 * Evaluates recurring tasks upon app startup, date changes, or at midnight.
 * Automatically handles:
 * 1. Advancing completed recurring tasks to their next cycle once nextDueDate arrives,
 *    reopening them, resetting subtasks if configured, and maintaining streak.
 * 2. Rolling over overdue uncompleted tasks to the first scheduled date on or after today,
 *    and resetting streak to 0. Creation and completion history never change here.
 *
 * ponytail: in-memory scan across items array on date change, upgrade to indexed cursor if vault items exceed 10,000
 */
export function evaluateRecurringTasks(
  items: SlagItem[],
  referenceDate: Date = new Date()
): { updatedItems: SlagItem[]; changedCount: number; changedItems: SlagItem[] } {
  const todayStr = getISODateString(referenceDate);
  const nowTs = referenceDate.getTime();
  let changedCount = 0;
  if (!Number.isFinite(nowTs)) return { updatedItems: items, changedCount, changedItems: [] };

  const updatedItems = items.map(item => {
    if (item.type !== 'task' || !item.recurrence || !item.dueDate
      || !Number.isFinite(parseISODateString(item.dueDate).getTime())) {
      return item;
    }

    const shouldResetSubtasks = item.recurrence.resetSubtasks !== false;

    // Case 1: Completed recurring task
    if (item.status === 'done') {
      const nextDue = computeNextStrictOccurrenceDate(item.dueDate, item.recurrence);

      // If next recurrence date hasn't arrived yet, keep it done where it is
      if (nextDue <= item.dueDate || todayStr < nextDue) {
        return item;
      }

      // Next due date has arrived
      // ponytail: no persisted anchor/history; advance the existing clamped schedule, not an invented day.
      const targetDueDate = occurrenceOnOrAfter(nextDue, item.recurrence, todayStr);
      if (targetDueDate < todayStr) return item;
      changedCount++;
      const isExactOrNextCycle = todayStr === nextDue;
      // If user was absent for multiple cycles, streak resets to 0; otherwise kept
      const newStreak = isExactOrNextCycle ? (item.streak ?? 1) : 0;

      const updatedContent = shouldResetSubtasks
        ? setAllCheckboxesInContent(item.content, false)
        : item.content;
      const parsedSubtasks = parseSubtasksFromContent(updatedContent);
      const updatedSubtasks = parsedSubtasks.length > 0
        ? parsedSubtasks
        : item.subtasks?.map(st => ({
            ...st,
            completed: shouldResetSubtasks ? false : st.completed,
          }));

      return {
        ...item,
        status: 'todo' as const,
        dueDate: targetDueDate,
        reminder: shiftReminderToDay(item.reminder, item.dueDate, targetDueDate),
        streak: newStreak,
        content: updatedContent,
        subtasks: updatedSubtasks,
        updatedAt: nowTs,
      };
    }

    // Case 2: Missed task -> next scheduled date on/after today, preserving schedule phase.
    if (item.dueDate < todayStr) {
      const targetDueDate = occurrenceOnOrAfter(item.dueDate, item.recurrence, todayStr);
      if (targetDueDate < todayStr) return item;
      changedCount++;
      return {
        ...item,
        status: 'todo' as const,
        dueDate: targetDueDate,
        reminder: shiftReminderToDay(item.reminder, item.dueDate, targetDueDate),
        streak: 0,
        updatedAt: nowTs,
      };
    }

    return item;
  });

  const changedItems = changedCount ? updatedItems.filter((item, index) => item !== items[index]) : [];
  return { updatedItems, changedCount, changedItems };
}
