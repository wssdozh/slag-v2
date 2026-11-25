import type { ItemUpdates, SlagItem } from '../../types';
import { parseSubtasksFromContent } from '../tasks/taskUtils.ts';
import { projectItemKind } from './noteSemantics.ts';

/**
 * Applies a partial update to an item without touching storage.
 * Shared by the assistant action pipeline and the diff preview.
 */
export function applyItemUpdates(target: SlagItem, updates: ItemUpdates): SlagItem {
  let content = target.content;
  if (updates.content !== undefined) {
    content = updates.content;
  }
  if (updates.appendContent) {
    content = content ? `${content}\n\n${updates.appendContent}` : updates.appendContent;
  }

  let subtasks = target.subtasks;
  if (updates.subtasks !== undefined && Array.isArray(updates.subtasks) && updates.subtasks.length > 0) {
    const first = updates.subtasks[0];
    const newChecklines = typeof first === 'string'
      ? (updates.subtasks as string[]).map(st => `- [ ] ${st}`)
      : (updates.subtasks as Array<{ id?: string; title: string; completed?: boolean }>).map(
          st => `- [${st.completed ? 'x' : ' '}] ${st.title}`
        );
    content = content ? `${content}\n\n${newChecklines.join('\n')}` : newChecklines.join('\n');
  }
  if (content !== target.content) {
    const parsed = parseSubtasksFromContent(content);
    if (parsed.length || parseSubtasksFromContent(target.content).length) subtasks = parsed;
  }

  let tags = target.tags || [];
  if (updates.tags !== undefined) {
    tags = updates.tags;
  } else {
    if (updates.addTags && updates.addTags.length > 0) {
      tags = Array.from(new Set([...tags, ...updates.addTags]));
    }
    if (updates.removeTags && updates.removeTags.length > 0) {
      const removeSet = new Set(updates.removeTags.map(t => t.toLowerCase()));
      tags = tags.filter(t => !removeSet.has(t.toLowerCase()));
    }
  }

  const SPECIAL_KEYS = new Set([
    'title', 'content', 'appendContent', 'tags', 'addTags', 'removeTags', 'subtasks', 'dueDate', 'reminder', 'customProps'
  ]);

  const result: SlagItem = {
    ...target,
    title: updates.title !== undefined && updates.title.trim() ? updates.title.trim() : target.title,
    content,
    tags,
    subtasks,
    dueDate: updates.dueDate !== undefined ? (updates.dueDate === null ? undefined : updates.dueDate) : target.dueDate,
    reminder: updates.reminder !== undefined ? (updates.reminder === null ? undefined : updates.reminder) : target.reminder,
    customProps: updates.customProps !== undefined
      ? { ...(target.customProps || {}), ...updates.customProps }
      : target.customProps,
    updatedAt: Date.now(),
  };

  // Dynamically apply any additional scalar properties from updates
  for (const key of Object.keys(updates) as Array<keyof ItemUpdates>) {
    if (!SPECIAL_KEYS.has(key) && updates[key] !== undefined) {
      Object.assign(result, { [key]: updates[key] });
    }
  }

  return result.type === target.type ? result : projectItemKind(result);
}
