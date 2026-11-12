// Splits tasks into overdue, unscheduled and per-day buckets, expanding recurrences.
import { useMemo } from 'react';
import type { SlagItem } from '../types';
import { getTodayString } from '../lib/time/dateUtils';
import { getRecurringOccurrencesInRange } from '../lib/time/recurrenceHelper';
import { DEFAULT_INBOX_FOLDER } from '../config';

export interface CalendarTask extends SlagItem {
  isVirtual?: boolean;
}

export interface UseCalendarScheduleParams {
  items: SlagItem[];
  currentFolder?: string;
  filterByFolder?: boolean;
  rangeStart?: string;
  rangeEnd?: string;
}

export interface CalendarScheduleResult {
  allTasks: SlagItem[];
  overdueTasks: SlagItem[];
  unscheduledTasks: SlagItem[];
  tasksByDate: Map<string, CalendarTask[]>;
  todayStr: string;
}

export function useCalendarSchedule({
  items,
  currentFolder,
  filterByFolder = false,
  rangeStart,
  rangeEnd,
}: UseCalendarScheduleParams): CalendarScheduleResult {
  const todayStr = useMemo(() => getTodayString(), []);

  const scopedTasks = useMemo(() => {
    return items.filter((item) => {
      const isTaskLike =
        item.type === 'task' || (item.subtasks && item.subtasks.length > 0);
      if (!isTaskLike) return false;

      if (!filterByFolder || !currentFolder || currentFolder === DEFAULT_INBOX_FOLDER) {
        return true;
      }
      return item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
    });
  }, [items, currentFolder, filterByFolder]);

  const overdueTasks = useMemo(() => {
    return scopedTasks
      .filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [scopedTasks, todayStr]);

  const unscheduledTasks = useMemo(() => {
    return scopedTasks.filter((t) => t.status !== 'done' && !t.dueDate);
  }, [scopedTasks]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();

    // 1. Place real tasks
    scopedTasks.forEach((task) => {
      if (task.dueDate) {
        const list = map.get(task.dueDate) || [];
        list.push(task);
        map.set(task.dueDate, list);
      }
    });

    // 2. Project virtual occurrences of recurring tasks in visible range
    const startRange = rangeStart || todayStr;
    const endRange = rangeEnd || todayStr;

    scopedTasks.forEach((task) => {
      if (task.recurrence && task.dueDate && task.status !== 'done') {
        const occurrences = getRecurringOccurrencesInRange(task, startRange, endRange);
        occurrences.forEach((occDate) => {
          if (occDate !== task.dueDate) {
            const list = map.get(occDate) || [];
            if (!list.some((it) => it.id.startsWith(task.id + '_virtual_'))) {
              let nextReminder: string | undefined = undefined;
              if (task.reminder) {
                try {
                  const orig = new Date(task.reminder);
                  const [y, m, d] = occDate.split('-').map(Number);
                  nextReminder = new Date(
                    y,
                    m - 1,
                    d,
                    orig.getHours(),
                    orig.getMinutes(),
                    0,
                    0
                  ).toISOString();
                } catch {
                  // ignore
                }
              }

              const virtualItem: CalendarTask = {
                ...task,
                id: `${task.id}_virtual_${occDate}`,
                dueDate: occDate,
                reminder: nextReminder,
                isVirtual: true,
              };
              list.push(virtualItem);
              map.set(occDate, list);
            }
          }
        });
      }
    });

    return map;
  }, [scopedTasks, todayStr, rangeStart, rangeEnd]);

  return {
    allTasks: scopedTasks,
    overdueTasks,
    unscheduledTasks,
    tasksByDate,
    todayStr,
  };
}
