// Pure windowing for the feed: how many cards stay mounted and when to grow the window.
import type { SlagItem } from '../../../types';
import { noteGapPx, parseISODateString } from '../../../lib/time/dateUtils';
import { classifyTaskSchedule } from '../../../lib/tasks/taskSchedule';

export function partitionFeedBySchedule(items: readonly SlagItem[], today: string) {
  const history: SlagItem[] = [];
  const scheduledToday: SlagItem[] = [];
  const overdue: SlagItem[] = [];
  for (const item of items) {
    const status = classifyTaskSchedule(item, today);
    if (status === 'today') scheduledToday.push(item);
    else if (status === 'overdue') overdue.push(item);
    else history.push(item);
  }
  overdue.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  return { history, scheduledToday, overdue };
}

/** Карточек в окне; столько же добавляет один шаг догрузки старого. */
export const WINDOW_CHUNK = 15;

/**
 * Новое всегда в кадре: окно прижато к концу списка, а не к началу.
 */
export function takeWindow<T>(items: readonly T[], windowSize: number): T[] {
  return items.slice(Math.max(0, items.length - windowSize));
}

export function hasOlderItems(total: number, windowSize: number): boolean {
  return total > windowSize;
}

/** Догрузка одним куском, но не больше, чем записей осталось. */
export function nextWindowSize(windowSize: number, total: number): number {
  return Math.min(windowSize + WINDOW_CHUNK, total);
}

/**
 * Переход по ссылке на старую запись: окно растёт ровно настолько, чтобы цель попала
 * в кадр, плюс запас снизу — иначе карточка прилипнет к верхней кромке.
 */
export function windowSizeAroundTarget(
  windowSize: number,
  total: number,
  targetIndex: number,
): number {
  if (targetIndex === -1 || targetIndex >= total - windowSize) return windowSize;
  return Math.max(windowSize, total - targetIndex + 10);
}

export interface FeedGroupItem {
  item: SlagItem;
  gap: number;
}

export interface FeedDateGroup {
  dateLabel: string;
  items: FeedGroupItem[];
}

/**
 * Деление ленты по календарным дням: «Сегодня», «Вчера» или дата. Год виден только
 * у записей не из текущего. Внутри группы шаг — это разрыв во времени между соседями,
 * а не ровный отступ колонки: лента дышит, но не пляшет.
 */
export function groupFeedByDate(items: readonly SlagItem[], today: string | number): FeedDateGroup[] {
  const day = typeof today === 'string' ? parseISODateString(today) : new Date(today);
  const todayMidnight = day.setHours(0, 0, 0, 0);
  const currentYear = day.getFullYear();
  const yesterdayMidnight = day.setDate(day.getDate() - 1);
  const groups: FeedDateGroup[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const dateLabel = feedDateLabel(item.createdAt, todayMidnight, yesterdayMidnight, currentYear);
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.dateLabel !== dateLabel) {
      groups.push({ dateLabel, items: [{ item, gap: 0 }] });
      continue;
    }

    lastGroup.items.push({
      item,
      gap: noteGapPx(items[index - 1].createdAt, item.createdAt),
    });
  }

  return groups;
}

function feedDateLabel(
  createdAt: number,
  todayMidnight: number,
  yesterdayMidnight: number,
  currentYear: number,
): string {
  if (createdAt >= todayMidnight) return 'Сегодня';
  if (createdAt >= yesterdayMidnight) return 'Вчера';

  const itemDate = new Date(createdAt);
  return itemDate.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: itemDate.getFullYear() !== currentYear ? 'numeric' : undefined,
  });
}
