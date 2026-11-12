/**
 * Decomposition intents: split a note into tasks and break a task into subtasks.
 */
import type { BatchUpdateItem, SuggestedAction } from '../../../types';
import type { SendAssistantChatResult } from '../types';
import { findItemByWikiLinks, findRecentMessage } from './history';
import { readIntentText } from './intentContext';
import type { LocalFallbackParams } from './types';

export async function splitNote(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { messages, allItems, startTime } = params;
  const { lowerMsg } = readIntentText(params);

  const isSplitIntent =
    /раздели|разбей|декомпозируй|располовинь/i.test(lowerMsg) &&
    (lowerMsg.includes('заметк') || lowerMsg.includes('таск') || lowerMsg.includes('несколько') || lowerMsg.includes('пункт'));

  if (!isSplitIntent) {
    return null;
  }

  const targetNote = findItemByWikiLinks(messages, allItems);

  if (!targetNote || !targetNote.content) {
    return null;
  }

  const lines = targetNote.content
    .split('\n')
    .map((l) => l.replace(/^[-\s*]*\[[ xX]?\]\s*|^[-*\d.]+\s*/, '').trim())
    .filter((l) => l.length > 2 && !l.startsWith('#'));

  if (lines.length > 1) {
    const batchItems: BatchUpdateItem[] = lines.slice(0, 10).map((line, idx) => ({
      targetItemId: `new_${idx}`,
      title: line,
      updates: {
        status: 'todo',
      },
    }));

    return {
      content: `Разделил заметку «${targetNote.title}» на ${batchItems.length} задач в папке «${targetNote.folder}». Нажмите «Применить» для подтверждения.`,
      reasoning: `Декомпозиция заметки [[${targetNote.title}]] на ${batchItems.length} задач`,
      reasoningTimeMs: Date.now() - startTime,
      suggestedAction: {
        type: 'batch_update',
        title: `Разделение заметки (${batchItems.length} задач)`,
        actionLabel: `Создать ${batchItems.length} задач`,
        folder: targetNote.folder,
        content: '',
        tags: targetNote.tags || [],
        itemType: 'task',
        batchUpdateItems: batchItems,
        actionState: 'suggested',
      },
    };
  }

  return null;
}

export async function decomposeTask(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { messages, allItems, startTime, currentFolder } = params;
  const { lastUserMsg, lowerMsg } = readIntentText(params);

  if (!lowerMsg.includes('разбей') && !lowerMsg.includes('декомпози') && !lowerMsg.includes('подзадач') && !lowerMsg.includes('шаги')) {
    return null;
  }

  const recentActionMsg = findRecentMessage(messages, ['[Действие ассистента:', '[Подготовлен черновик', '«']);
  const titleFromHistory = recentActionMsg?.content.match(/[«"]([^»"]+)[»"]/) || recentActionMsg?.content.match(/Заголовок:\s*«([^»]+)»/);

  let taskTitle = '';
  const explicitTaskM = lastUserMsg.match(/(?:есть\s+задача|задача|задачу|таска|таску|в\s+задаче|к\s+задаче|для\s+задачи)\s+[«"]?([^«".,\n]+)[»"]?/i);
  if (explicitTaskM) {
    const candidate = explicitTaskM[1].trim().split(/\s+(?:нужно|надо|сделай|добавь|хочу|на\s+подзадачи|на\s+шаги)/i)[0].trim();
    if (candidate) {
      taskTitle = candidate;
    }
  }

  let targetTask = taskTitle
    ? allItems.find((i) => i.type === 'task' && (
        i.title.toLowerCase() === taskTitle.toLowerCase() ||
        i.title.toLowerCase().includes(taskTitle.toLowerCase()) ||
        taskTitle.toLowerCase().includes(i.title.toLowerCase())
      ))
    : allItems.find((i) => i.type === 'task' && lowerMsg.includes(i.title.toLowerCase()));

  if (targetTask) {
    taskTitle = targetTask.title;
  }

  if (!targetTask && !taskTitle) {
    if (titleFromHistory && lowerMsg.includes(titleFromHistory[1].toLowerCase())) {
      taskTitle = titleFromHistory[1];
      targetTask = allItems.find((i) => i.type === 'task' && i.title.toLowerCase() === taskTitle.toLowerCase());
    } else {
      targetTask = allItems.find((i) => {
        if (i.type !== 'task') return false;
        const lowerTitle = i.title.toLowerCase();
        const titleTokens = lowerTitle.split(/\s+/).filter((w) => w.length > 3);
        return titleTokens.length > 0 && titleTokens.every((tok) => lowerMsg.includes(tok));
      });
    }
  }

  if (!taskTitle) {
    taskTitle = targetTask ? targetTask.title : (titleFromHistory ? titleFromHistory[1] : 'Реализовать ИИ-тегирование заметок');
  }
  const taskId = targetTask?.id || allItems.find((i) => i.type === 'task')?.id;

  const parsedSubtaskTitles: string[] = [];
  const lines = lastUserMsg.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/на\s+(?:подзадачи|шаги|подзадач)\s*$/i.test(trimmed)) {
      continue;
    }

    const subtaskMatch = trimmed.match(/(?:сделать|добавить|создать|включить)?\s*подзадач(?:у|а|е|и)?\s*[:\-–—]\s*(.+)/i)
      || trimmed.match(/(?:сделать|добавить|создать|включить)\s+подзадач(?:у|а|е|и)?\s+(.+)/i);

    if (subtaskMatch) {
      const cleanSub = subtaskMatch[1].replace(/^(сделать|добавить|создать|записать)\s*/i, '').trim();
      if (cleanSub.length >= 2 && !parsedSubtaskTitles.includes(cleanSub) && !/^на\s+(?:подзадачи|шаги)$/i.test(cleanSub)) {
        parsedSubtaskTitles.push(cleanSub);
      }
    }
    const listMatch = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const itemText = listMatch[1].trim();
      if (itemText && !parsedSubtaskTitles.includes(itemText)) {
        parsedSubtaskTitles.push(itemText);
      }
    }
  }

  const subtasks = parsedSubtaskTitles.length > 0
    ? parsedSubtaskTitles.map((stTitle, idx) => ({
        id: `st_${Date.now()}_${idx + 1}`,
        title: stTitle.charAt(0).toUpperCase() + stTitle.slice(1),
        completed: false,
      }))
    : taskTitle.toLowerCase().includes('тегирован') || taskTitle.toLowerCase().includes('архитектур')
    ? [
        { id: `st_${Date.now()}_1`, title: 'Собрать требования и составить список спецификаций', completed: false },
        { id: `st_${Date.now()}_2`, title: 'Разработать архитектурный прототип', completed: false },
        { id: `st_${Date.now()}_3`, title: 'Написать E2E-тесты и провести визуальную верификацию', completed: false },
        { id: `st_${Date.now()}_4`, title: 'Зафиксировать изменения коммитом и обновить документацию', completed: false },
      ]
    : [
        { id: `st_${Date.now()}_1`, title: `Подготовить принадлежности для «${taskTitle}»`, completed: false },
        { id: `st_${Date.now()}_2`, title: `Выполнить действия по задаче «${taskTitle}»`, completed: false },
        { id: `st_${Date.now()}_3`, title: 'Проверить результат', completed: false },
      ];

  const suggestedAction: SuggestedAction = {
    type: 'update_item',
    targetItemId: taskId,
    title: taskTitle,
    folder: targetTask?.folder || currentFolder,
    content: '',
    tags: [],
    itemType: 'task',
    subtasks,
    updates: {
      subtasks,
    },
    actionState: 'suggested',
  };

  const replyText = `Подзадачи для «${taskTitle}»:`;

  return {
    content: replyText,
    reasoning: 'Сформирован чеклист декомпозиции (action:decompose_task)',
    reasoningTimeMs: Date.now() - startTime,
    suggestedAction,
  };
}
