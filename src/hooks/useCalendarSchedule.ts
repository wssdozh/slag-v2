// Splits tasks into overdue, unscheduled and per-day buckets, expanding recurrences.
import { useMemo } from 'react';
import type { SlagItem } from '../types';
import { getTodayString } from '../lib/time/dateUtils';
import { getRecurringOccurrencesInRange } from '../lib/time/recurrenceHelper';
import { reminderClock, reminderToIso } from '../lib/time/reminder';
import { DEFAULT_INBOX_FOLDER } from '../config';
import { matchesTaskQuickFilter, type TaskQuickFilter } from '../lib/tasks/taskQuickFilter';

export interface CalendarTask extends SlagItem {
  isVirtual?: boolean;
}

export interface UseCalendarScheduleParams {
  items: SlagItem[];
  currentFolder?: string;
  filterByFolder?: boolean;
  rangeStart?: string;
  rangeEnd?: string;
  taskFilter?: TaskQuickFilter;
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
  taskFilter,
}: UseCalendarScheduleParams): CalendarScheduleResult {
  const initialDay = useMemo(() => getTodayString(), []);
  const todayStr = taskFilter?.today ?? initialDay;

  const folderTasks = useMemo(() => {
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

  const scopedTasks = useMemo(() => taskFilter
    ? folderTasks.filter(item => (currentFolder !== DEFAULT_INBOX_FOLDER || item.folder === currentFolder)
      && matchesTaskQuickFilter(item, taskFilter)) : folderTasks, [folderTasks, currentFolder, taskFilter]);

  const overdueTasks = useMemo(() => {
    return scopedTasks
      .filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [scopedTasks, todayStr]);

  const unscheduledTasks = useMemo(() => {
    return scopedTasks.filter((t) => !t.dueDate && (taskFilter?.id === 'completed' || t.status !== 'done'));
  }, [scopedTasks, taskFilter?.id]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();

    // 1. Place real tasks
    scopedTasks.forEach((task) => {
      if (task.dueDate && (taskFilter?.id !== 'today' || task.dueDate === todayStr)) {
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
          const matchesDate = !taskFilter || (taskFilter.id === 'today' ? occDate === todayStr : occDate > todayStr);
          if (occDate !== task.dueDate && matchesDate) {
            const list = map.get(occDate) || [];
            if (!list.some((it) => it.id.startsWith(task.id + '_virtual_'))) {
              // Проекция несёт тот же час, но свой день: собираем момент тем же модулем, что и
              // редактор, иначе виртуальная задача показывалась бы без времени.
              const clock = reminderClock(task.reminder);
              const nextReminder = clock ? reminderToIso(occDate, clock) : undefined;

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
  }, [scopedTasks, todayStr, rangeStart, rangeEnd, taskFilter]);

  return {
    allTasks: scopedTasks,
    overdueTasks,
    unscheduledTasks,
    tasksByDate,
    todayStr,
  };
}
