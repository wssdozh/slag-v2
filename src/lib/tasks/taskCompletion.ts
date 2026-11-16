import type { SlagItem } from '../../types';
import { getISODateString } from '../time/dateUtils';
import { parseSubtasksFromContent, setAllCheckboxesInContent } from './taskUtils';

/**
 * A checklist with no open lines. Content checkboxes are the source of truth; the legacy
 * `subtasks` array counts only when the body has no checklist, same as the serializer.
 */
function allSubtasksCompleted(item: SlagItem): boolean {
  const parsed = parseSubtasksFromContent(item.content);
  const subtasks = parsed.length > 0 ? parsed : (item.subtasks ?? []);
  return subtasks.length > 0 && subtasks.every(st => st.completed);
}

/** keep every local status entry point consistent, without applying transitions to sync imports. */
export function applyTaskCompletion(previous: SlagItem, next: SlagItem, referenceDate = new Date()): SlagItem {
  if (next.type !== 'task') return next;

  // Ticking the last subtask is a completion, so it takes the same route as the status click.
  // Only a write that keeps the status as it was counts: an explicit status change always wins,
  // otherwise reopening a done task would be swallowed by its still-checked checklist.
  const autoClosed: SlagItem =
    next.status === previous.status && next.status !== 'done' && allSubtasksCompleted(next)
      ? { ...next, status: 'done' }
      : next;

  if ((previous.status === 'done') === (autoClosed.status === 'done')) return autoClosed;

  const completed = autoClosed.status === 'done';
  // reopening one subtask must not uncheck its completed siblings.
  const content = completed ? setAllCheckboxesInContent(autoClosed.content, true) : autoClosed.content;
  const parsed = parseSubtasksFromContent(content);
  const updated: SlagItem = {
    ...autoClosed,
    content,
    subtasks: parsed.length > 0 ? parsed : autoClosed.subtasks?.map(st => completed ? { ...st, completed: true } : st),
  };
  if (!autoClosed.recurrence) return updated;

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
