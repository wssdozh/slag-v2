import type { SlagItem } from '../../types';
import { getISODateString } from '../time/dateUtils';
import { parseSubtasksFromContent, setAllCheckboxesInContent } from './taskUtils';

/** keep every local status entry point consistent, without applying transitions to sync imports. */
export function applyTaskCompletion(previous: SlagItem, next: SlagItem, referenceDate = new Date()): SlagItem {
  if (next.type !== 'task' || (previous.status === 'done') === (next.status === 'done')) return next;

  const completed = next.status === 'done';
  // reopening one subtask must not uncheck its completed siblings.
  const content = completed ? setAllCheckboxesInContent(next.content, true) : next.content;
  const parsed = parseSubtasksFromContent(content);
  const updated: SlagItem = {
    ...next,
    content,
    subtasks: parsed.length > 0 ? parsed : next.subtasks?.map(st => completed ? { ...st, completed: true } : st),
  };
  if (!next.recurrence) return updated;

  const today = getISODateString(referenceDate);
  let history = [...(previous.history || [])];
  let streak = previous.streak ?? 0;
  let lastCompletedDate = previous.lastCompletedDate;
  if (completed) {
    if (lastCompletedDate !== today) streak++;
    history = Array.from(new Set([...history, today]));
    lastCompletedDate = today;
  } else if (lastCompletedDate === today) {
    streak = Math.max(0, streak - 1);
    history = history.filter(day => day !== today);
    lastCompletedDate = history.length > 0 ? history[history.length - 1] : undefined;
  }
  return { ...updated, streak, history, lastCompletedDate };
}
