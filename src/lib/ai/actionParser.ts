import type { SlagItem, SlagItemType, SuggestedAction, BatchUpdateItem, ItemUpdates } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
export function cleanSnippetText(text: string, maxLen = 140): string {
  if (!text) return '';
  return text
    .replace(/#+\s*/g, '')
    .replace(/[-*]\s+/g, '')
    .replace(/\d+\.\s+/g, '')
    .replace(/---[-*]*/g, ' ')
    .replace(/[`~_>|]/g, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function extractBalancedJsonObject(text: string, start: number): string | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function actionFields(parsed: Record<string, any>, fallbackTitle: string) {
  return {
    title: parsed.title || fallbackTitle,
    folder: parsed.folder || DEFAULT_INBOX_FOLDER,
    content: parsed.content || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };
}

function parseBatchItems(items: unknown, validatePriority: boolean): BatchUpdateItem[] {
  return Array.isArray(items) ? items.map((it: any) => ({
    targetItemId: it.targetItemId || it.id || '',
    title: it.title || 'Задача',
    updates: it.updates || {
      dueDate: it.dueDate,
      reminder: it.reminder,
      priority: validatePriority && !['none', 'low', 'medium', 'high'].includes(it.priority) ? undefined : it.priority,
      status: it.status,
    },
    reason: it.reason,
  })) : [];
}

function batchAction(batchItems: BatchUpdateItem[], title?: string, folder?: string): SuggestedAction {
  return {
    type: 'batch_update',
    title: title || `Перенос задач (${batchItems.length})`,
    folder: folder || DEFAULT_INBOX_FOLDER,
    content: '',
    tags: [],
    itemType: 'task',
    batchUpdateItems: batchItems,
  };
}

/**
 * Parses embedded action block from assistant response (create_note, schedule_task, reschedule_task, update_task_status, decompose_task, move_note)
 */
export function extractActionBlock(
  text: string,
  allItems?: SlagItem[],
  currentFolder?: string
): { cleanText: string; suggestedAction?: SuggestedAction } {
  // Matches ```action:name, ```json:name, ```action, ```json or ```\n{...}
  const actionRegex = /```(?:action:?([\w_]+)|json:?([\w_]+)?|([\w_]+))?\s*\n?(\{[\s\S]*?\})\s*```/i;
  const match = text.match(actionRegex);

  if (match) {
    try {
      const tagAction = (match[1] || match[2] || match[3] || '').trim();
      const jsonStr = match[4] || (match[1]?.startsWith('{') ? match[1] : undefined);
      if (!jsonStr) return { cleanText: text };
      const parsed = JSON.parse(jsonStr);
      const cleanText = text.replace(match[0], '').trim();
      const actionKind = parsed.action || tagAction;

      if (actionKind === 'batch_update' || actionKind === 'batch_update_items' || actionKind === 'batch_reschedule' || actionKind === 'batch_reschedule_tasks' || Array.isArray(parsed.items)) {
        const batchItems = parseBatchItems(parsed.items, true);
        if (batchItems.length > 0) {
          return {
            cleanText,
            suggestedAction: batchAction(batchItems, parsed.title, parsed.folder),
          };
        }
      }

      if (actionKind === 'save_item') {
        const hasExistingId = parsed.id || parsed.targetItemId;
        if (hasExistingId) {
          return {
            cleanText,
            suggestedAction: {
              type: 'update_item',
              targetItemId: parsed.id || parsed.targetItemId,
              ...actionFields(parsed, 'Обновление записи'),
              appendContent: parsed.appendContent,
              itemType: parsed.itemType || 'note',
              dueDate: parsed.dueDate,
              reminder: parsed.reminder,
              priority: parsed.priority,
              status: parsed.status,
              updates: parsed.updates || parsed,
            },
          };
        }
        return {
          cleanText,
          suggestedAction: {
            type: 'create_note',
            ...actionFields(parsed, 'Новая запись'),
            appendContent: parsed.appendContent,
            itemType: ['note', 'task', 'article'].includes(parsed.itemType) ? parsed.itemType : (parsed.dueDate ? 'task' : 'note'),
            dueDate: parsed.dueDate,
            reminder: parsed.reminder,
            priority: ['none', 'low', 'medium', 'high'].includes(parsed.priority) ? parsed.priority : undefined,
            status: parsed.status,
          },
        };
      }

      if (actionKind === 'create_note' || actionKind === 'schedule_task') {
        return {
          cleanText,
          suggestedAction: {
            type: actionKind === 'schedule_task' ? 'schedule_task' : 'create_note',
            ...actionFields(parsed, 'Новая запись'),
            itemType: ['note', 'task', 'article'].includes(parsed.itemType) ? parsed.itemType : (actionKind === 'schedule_task' ? 'task' : 'note'),
            dueDate: parsed.dueDate,
            reminder: parsed.reminder,
            priority: ['none', 'low', 'medium', 'high'].includes(parsed.priority) ? parsed.priority : undefined,
          },
        };
      }

      if (actionKind === 'update_item') {
        return {
          cleanText,
          suggestedAction: {
            type: 'update_item',
            targetItemId: parsed.targetItemId || parsed.id,
            ...actionFields(parsed, 'Обновление записи'),
            itemType: parsed.itemType || 'note',
            updates: parsed.updates || parsed,
          },
        };
      }

      if (actionKind === 'reschedule_task' || actionKind === 'update_task_status' || actionKind === 'decompose_task' || actionKind === 'append_to_note' || actionKind === 'move_note') {
        const rawUpdates: ItemUpdates = {};
        if (parsed.dueDate) rawUpdates.dueDate = parsed.dueDate;
        if (parsed.reminder) rawUpdates.reminder = parsed.reminder;
        if (parsed.priority) rawUpdates.priority = parsed.priority;
        if (parsed.status) rawUpdates.status = parsed.status;
        if (parsed.content) rawUpdates.appendContent = parsed.content;
        if (parsed.folder) rawUpdates.folder = parsed.folder;
        if (parsed.subtasks) rawUpdates.subtasks = parsed.subtasks;

        return {
          cleanText,
          suggestedAction: {
            type: 'update_item',
            targetItemId: parsed.targetItemId,
            title: parsed.title || 'Обновление записи',
            folder: parsed.folder || DEFAULT_INBOX_FOLDER,
            content: parsed.content || '',
            appendContent: parsed.content || undefined,
            dueDate: parsed.dueDate,
            reminder: parsed.reminder,
            priority: parsed.priority,
            status: parsed.status,
            tags: [],
            itemType: 'task',
            updates: rawUpdates,
          },
        };
      }
    } catch {
      // JSON parse failed, return as is
    }
  }

  // Safeguard against raw pseudo-protocol string leak:
  // e.g. [Действие ассистента: batch_reschedule_tasks | ... | Параметры: {"items":[...]}]
  // Balanced extraction: nested item objects are valid params, a lazy regex would truncate them.
  const pseudoHeader = /\[Действие ассистента:\s*([\w_]+)\s*\|[^|]*\|[^|]*Параметры:\s*/i;
  const pseudoMatch = text.match(pseudoHeader);
  const pseudoJson = pseudoMatch?.index !== undefined
    ? extractBalancedJsonObject(text, pseudoMatch.index + pseudoMatch[0].length)
    : null;
  if (pseudoMatch?.index !== undefined && pseudoJson) {
    try {
      const actionName = pseudoMatch[1].trim();
      const params = JSON.parse(pseudoJson);
      const blockEnd = text.indexOf(']', pseudoMatch.index + pseudoMatch[0].length + pseudoJson.length);
      const cleanText = text.replace(text.slice(
        pseudoMatch.index,
        blockEnd >= 0 ? blockEnd + 1 : pseudoMatch.index + pseudoMatch[0].length + pseudoJson.length
      ), '').trim();

      if (actionName === 'batch_update_items' || actionName === 'batch_update' || actionName === 'batch_reschedule_tasks' || actionName === 'batch_reschedule') {
        const batchItems = parseBatchItems(params.items, false);
        return {
          cleanText,
          suggestedAction: batchAction(batchItems),
        };
      }
    } catch {
      // Ignore fallback error
    }
  }

  // 3. Fallback: Parse markdown code block ```task, ```todo, or ```action:decompose
  const taskBlockMatch = text.match(/```(?:task|todo|action:task|action:decompose)\s*\n([\s\S]*?)```/i);
  if (taskBlockMatch) {
    const rawBlock = taskBlockMatch[1].trim();
    const lines = rawBlock.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      const rawTitle = lines[0].replace(/^[#*-\d.]+\s*/, '').trim();
      let folder = currentFolder || DEFAULT_INBOX_FOLDER;
      let contentStartIndex = 1;
      const fLine = lines[1] || '';
      if (fLine.includes('/') || fLine === DEFAULT_INBOX_FOLDER || fLine === 'Личное' || fLine === 'Проекты' || fLine === 'Карьера' || fLine === 'Будущее' || fLine === 'База знаний') {
        folder = fLine;
        contentStartIndex = 2;
      }

      const subtasks: Array<{ id: string; title: string; completed: boolean }> = [];
      const contentLines: string[] = [];
      for (let i = contentStartIndex; i < lines.length; i++) {
        const line = lines[i];
        const numMatch = line.match(/^\d+\.\s+(.*)$/);
        const checkMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
        const bulletMatch = line.match(/^[-*]\s+(.*)$/);

        if (checkMatch) {
          subtasks.push({
            id: `st_${Date.now()}_${subtasks.length}`,
            title: checkMatch[2].trim(),
            completed: checkMatch[1].toLowerCase() === 'x',
          });
        } else if (numMatch) {
          subtasks.push({
            id: `st_${Date.now()}_${subtasks.length}`,
            title: numMatch[1].trim(),
            completed: false,
          });
        } else if (bulletMatch && (contentLines.some(l => /шаги|подзадач|план/i.test(l)) || subtasks.length > 0)) {
          subtasks.push({
            id: `st_${Date.now()}_${subtasks.length}`,
            title: bulletMatch[1].trim(),
            completed: false,
          });
        } else {
          contentLines.push(line);
        }
      }

      const matched = allItems?.find(it =>
        it.type === 'task' && (
          it.title.toLowerCase() === rawTitle.toLowerCase() ||
          contentLines.some(cl => cl.includes(`«${it.title}»`) || cl.includes(`"${it.title}"`))
        )
      );

      const title = matched ? matched.title : rawTitle;
      const cleanText = text.replace(taskBlockMatch[0], '').trim() ||
        `Подготовил задачу из декомпозиции «${title}». Вы можете подтвердить её сохранение ниже:`;

      return {
        cleanText,
        suggestedAction: {
          type: matched ? 'update_item' : 'create_note',
          targetItemId: matched ? matched.id : undefined,
          title,
          folder: matched ? matched.folder : folder,
          itemType: 'task',
          tags: matched?.tags || ['задача', 'декомпозиция'],
          content: contentLines.join('\n'),
          subtasks: subtasks.length > 0 ? subtasks : undefined,
          updates: matched ? {
            subtasks: subtasks.length > 0 ? subtasks : undefined,
            content: contentLines.join('\n') || undefined,
          } : undefined,
          actionLabel: matched ? 'Декомпозиция задачи' : 'Создать задачу из декомпозиции',
          actionState: 'suggested',
        },
      };
    }
  }

  // 4. Fallback: Parse raw note metadata dump
  // e.g.:
  // personal_goals
  // Личные цели и контрольные точки
  // task
  // Личное/Быт
  // ["цели", "планы", "личное"]
  const pseudoHeaderRegex = /(?:^|\n)([a-zA-Z0-9_-]{3,})\s*\n([^\n]+)\s*\n(task|note|article)\s*\n([^\n]+)\s*\n(\[[^\]]*\]|\S+)\s*\n([\s\S]*)$/i;
  const pseudoHeaderMatch = text.match(pseudoHeaderRegex);
  if (pseudoHeaderMatch) {
    const rawId = pseudoHeaderMatch[1].trim();
    const rawTitle = pseudoHeaderMatch[2].trim();
    const rawType = (pseudoHeaderMatch[3].toLowerCase() === 'task' || pseudoHeaderMatch[3].toLowerCase() === 'article')
      ? pseudoHeaderMatch[3].toLowerCase() as SlagItemType
      : 'note';
    const rawFolder = pseudoHeaderMatch[4].trim();
    const rawTagsStr = pseudoHeaderMatch[5].trim();
    const rawBody = pseudoHeaderMatch[6].trim();

    let tags: string[] = [];
    try {
      if (rawTagsStr.startsWith('[')) {
        tags = JSON.parse(rawTagsStr);
      }
    } catch {
      tags = rawTagsStr.split(/[,\s]+/).map(t => t.replace(/[#"\][]/g, '')).filter(Boolean);
    }

    const subtasks: Array<{ id: string; title: string; completed: boolean }> = [];
    for (const line of rawBody.split('\n')) {
      const m = line.trim().match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
      if (m) {
        subtasks.push({
          id: `st_${Date.now()}_${subtasks.length}`,
          title: m[2].trim(),
          completed: m[1].toLowerCase() === 'x',
        });
      }
    }

    const matched = allItems?.find(it => it.id === rawId || it.title.toLowerCase() === rawTitle.toLowerCase());
    const finalTitle = matched ? matched.title : rawTitle;
    const cleanText = text.replace(pseudoHeaderMatch[0], '').trim() ||
      `Подготовил обновленную декомпозицию задачи «${finalTitle}» (${subtasks.length} шагов). Вы можете применить шаги к задаче:`;

    return {
      cleanText,
      suggestedAction: {
        type: matched ? 'update_item' : 'create_note',
        targetItemId: matched ? matched.id : rawId,
        title: finalTitle,
        folder: matched ? matched.folder : rawFolder,
        itemType: rawType,
        tags: tags.length > 0 ? tags : (matched?.tags || []),
        subtasks: subtasks.length > 0 ? subtasks : undefined,
        content: rawBody,
        updates: matched ? {
          subtasks: subtasks.length > 0 ? subtasks : undefined,
          content: rawBody,
        } : undefined,
        actionLabel: 'Декомпозиция задачи',
        actionState: 'suggested',
      },
    };
  }

  return { cleanText: text };
}
