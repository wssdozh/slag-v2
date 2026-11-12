/**
 * Task intents: priority/status changes and rescheduling, single and batch.
 */
import type { BatchUpdateItem, ItemUpdates, SlagItem, SuggestedAction } from '../../../types';
import { parseTodoistInput } from '../../time/todoistTaskParser';
import type { SendAssistantChatResult } from '../types';
import { hasPriorityIntent, hasRescheduleIntent, hasStatusIntent, readIntentText } from './intentContext';
import type { LocalFallbackParams } from './types';

function tasksInFolder(params: LocalFallbackParams): SlagItem[] {
  const { allItems, currentFolder, isInbox } = params;
  return allItems.filter(
    (i) => i.type === 'task' && (isInbox || i.folder === currentFolder || i.folder.startsWith(currentFolder + '/')),
  );
}

export async function changeTaskParams(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { startTime, currentFolder } = params;
  const { lowerMsg } = readIntentText(params);
  const isPriorityIntent = hasPriorityIntent(lowerMsg);
  const isStatusIntent = hasStatusIntent(lowerMsg);

  if ((!isPriorityIntent && !isStatusIntent) || lowerMsg.includes('создай') || lowerMsg.includes('план')) {
    return null;
  }

  let newPriority: 'none' | 'low' | 'medium' | 'high' | undefined;
  if (/высок|high|p1|срочн|максим/i.test(lowerMsg)) newPriority = 'high';
  else if (/средн|medium|p2|обычн/i.test(lowerMsg)) newPriority = 'medium';
  else if (/низк|low|p3|миним/i.test(lowerMsg)) newPriority = 'low';
  else if (/сброс|убери приоритет|none/i.test(lowerMsg)) newPriority = 'none';

  let newStatus: 'backlog' | 'todo' | 'in_progress' | 'done' | undefined;
  if (/выполнен|завершен|закр|done|готов/i.test(lowerMsg)) newStatus = 'done';
  else if (/в процесс|в работ|in_progress|делаю/i.test(lowerMsg)) newStatus = 'in_progress';
  else if (/бэклог|backlog|потом/i.test(lowerMsg)) newStatus = 'backlog';
  else if (/к исполнен|todo|надо/i.test(lowerMsg)) newStatus = 'todo';

  const isBatch = /всех|всеми|все\s+задач|кажд(ой|ую)\s+задач|у\s+всех|всем/i.test(lowerMsg);

  if (isBatch && (newPriority || newStatus)) {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const isTodayTarget = lowerMsg.includes('сегодня') || lowerMsg.includes('сегодняшн');
    const isTomorrowTarget = lowerMsg.includes('завтра') || lowerMsg.includes('завтрашн');
    const isOverdueTarget = lowerMsg.includes('просрочен') || lowerMsg.includes('долг');

    const scopedTasks = tasksInFolder(params);

    let candidateTasks: SlagItem[] = [];
    let dateLabel = 'хранилище';
    if (isTodayTarget) {
      dateLabel = 'сегодня';
      const explicitToday = scopedTasks.filter(t => t.dueDate === today && t.status !== 'done');
      candidateTasks = explicitToday.length > 0
        ? explicitToday
        : scopedTasks.filter(t => t.status !== 'done' && (!t.dueDate || t.dueDate === today));
    } else if (isTomorrowTarget) {
      dateLabel = 'завтра';
      candidateTasks = scopedTasks.filter(t => t.status !== 'done' && t.dueDate === tomorrow);
    } else if (isOverdueTarget) {
      dateLabel = 'просроченные';
      candidateTasks = scopedTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today);
    } else {
      candidateTasks = scopedTasks.filter(t => t.status !== 'done');
    }

    if (candidateTasks.length === 0) {
      return {
        content: `В расписании на ${dateLabel} не найдено подходящих задач для изменения параметров.`,
        reasoning: `Поиск задач на ${dateLabel} дал 0 результатов`,
        reasoningTimeMs: Date.now() - startTime,
      };
    }

    const batchItems: BatchUpdateItem[] = candidateTasks.map(t => ({
      targetItemId: t.id,
      title: t.title,
      updates: {
        ...(newPriority ? { priority: newPriority } : {}),
        ...(newStatus ? { status: newStatus } : {}),
      },
    }));

    const actionTitle = newPriority
      ? `Изменение приоритета (${batchItems.length})`
      : `Смена статуса (${batchItems.length})`;
    const actionLabel = newPriority
      ? `Приоритет ➔ ${newPriority.toUpperCase()} (${batchItems.length})`
      : `Статус ➔ ${newStatus} (${batchItems.length})`;

    const action: SuggestedAction = {
      type: 'batch_update',
      title: actionTitle,
      actionLabel,
      folder: currentFolder,
      content: '',
      tags: [],
      itemType: 'task',
      batchUpdateItems: batchItems,
      actionState: 'suggested',
    };

    return {
      content: `Подготовил изменение параметров для ${batchItems.length} задач на ${dateLabel}${newPriority ? `: приоритет ➔ ${newPriority.toUpperCase()}` : ''}${newStatus ? `: статус ➔ ${newStatus}` : ''}.`,
      reasoning: `Локальное пакетное обновление параметров задач (${dateLabel})`,
      reasoningTimeMs: Date.now() - startTime,
      suggestedAction: action,
    };
  }

  let targetTask: SlagItem | undefined;
  for (const item of params.allItems) {
    if (item.type === 'task' && lowerMsg.includes(item.title.toLowerCase())) {
      targetTask = item;
      break;
    }
  }
  if (!targetTask) {
    for (const item of params.allItems) {
      if (item.type === 'task') {
        const words = item.title.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
        if (words.some(w => lowerMsg.includes(w))) {
          targetTask = item;
          break;
        }
      }
    }
  }

  if (targetTask) {
    if (newPriority || newStatus) {
      const updates: ItemUpdates = {};
      if (newPriority) updates.priority = newPriority;
      if (newStatus) updates.status = newStatus;

      const action: SuggestedAction = {
        type: 'update_item',
        targetItemId: targetTask.id,
        title: targetTask.title,
        actionLabel: newPriority ? `Приоритет ➔ ${newPriority.toUpperCase()}` : `Статус ➔ ${newStatus}`,
        folder: targetTask.folder,
        content: '',
        tags: targetTask.tags || [],
        itemType: 'task',
        priority: newPriority || targetTask.priority,
        status: newStatus || targetTask.status,
        updates,
        actionState: 'suggested',
      };

      return {
        content: `Подготовил изменение параметров задачи «${targetTask.title}»: ${newPriority ? `приоритет ➔ ${newPriority.toUpperCase()}` : ''}${newStatus ? ` статус ➔ ${newStatus}` : ''}.`,
        reasoning: `Локальное обновление параметров задачи [[${targetTask.title}]]`,
        reasoningTimeMs: Date.now() - startTime,
        suggestedAction: action,
      };
    }
  }

  return null;
}

export async function rescheduleTasks(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { messages, startTime, currentFolder } = params;
  const { lastUserMsg, lowerMsg } = readIntentText(params);

  if (!hasRescheduleIntent(lowerMsg)) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const isOverdueTarget = lowerMsg.includes('просрочен') || lowerMsg.includes('долг');
  const isTomorrowTarget = lowerMsg.includes('завтрашн') || (lowerMsg.includes('завтра') && (lowerMsg.includes('задач') || lowerMsg.includes('таск')));
  const isTodayTarget = lowerMsg.includes('сегодняшн') || (lowerMsg.includes('сегодня') && (lowerMsg.includes('задач') || lowerMsg.includes('таск')));
  const allTasks = tasksInFolder(params);

  let candidateTasks: SlagItem[] = [];
  if (isOverdueTarget) {
    candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today);
    if (candidateTasks.length === 0) {
      candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate <= today);
    }
  } else if (isTomorrowTarget) {
    candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate === tomorrow);
    if (candidateTasks.length === 0) {
      candidateTasks = allTasks.filter(t => t.status !== 'done');
    }
  } else if (isTodayTarget) {
    candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate === today);
    if (candidateTasks.length === 0) {
      candidateTasks = allTasks.filter(t => t.status !== 'done');
    }
  } else {
    candidateTasks = allTasks.filter(t => {
      const tLower = t.title.toLowerCase();
      return lowerMsg.includes(tLower) || (tLower.length > 3 && lowerMsg.includes(tLower.slice(0, 4)));
    });
    if (candidateTasks.length === 0 && (lowerMsg.includes('все задачи') || lowerMsg.includes('все таски'))) {
      candidateTasks = allTasks.filter(t => t.status !== 'done');
    }
  }

  if (candidateTasks.length === 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const text = messages[i].content || '';
      const wikiMatches = Array.from(text.matchAll(/\[\[([^\]]+)\]\]/g)).map(m => m[1]);
      if (wikiMatches.length > 0) {
        candidateTasks = allTasks.filter(t => wikiMatches.some(w => w.toLowerCase() === t.title.toLowerCase()));
        if (candidateTasks.length > 0) break;
      }
      const mentioned = allTasks.filter(t => t.title.length > 3 && text.toLowerCase().includes(t.title.toLowerCase()));
      if (mentioned.length > 0) {
        candidateTasks = mentioned;
        break;
      }
    }
  }

  if (candidateTasks.length === 0) {
    const hasTomorrowContext = messages.some(m => m.content && (m.content.includes('завтра') || m.content.includes(tomorrow)));
    if (hasTomorrowContext) {
      candidateTasks = allTasks.filter(t => t.status !== 'done' && (t.dueDate === tomorrow || !t.dueDate));
    }
  }

  if (candidateTasks.length === 0) {
    candidateTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today);
    if (candidateTasks.length === 0) {
      candidateTasks = allTasks.filter(t => t.status !== 'done');
    }
  }

  if (candidateTasks.length > 0) {
    // Detect composite split conditions, e.g.:
    // 1. "1. задачу перенести на завтра, остальные две на послезавтра"
    // 2. "можешь задачу про чай перенести на завтра остальные просроченные на послезавтра"
    const hasRemainder = lowerMsg.includes('остальн') || lowerMsg.includes('друг');
    const hasNumberSplit = (lowerMsg.includes('1.') || lowerMsg.includes('перв')) && hasRemainder;

    // Find if a specific task was named before the remainder clause
    let namedTaskTarget: SlagItem | undefined;
    if (hasRemainder && candidateTasks.length > 1) {
      namedTaskTarget = candidateTasks.find(t => {
        const words = t.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        return words.some(w => lowerMsg.includes(w));
      });
    }

    const isCompositeSplit = (hasNumberSplit || Boolean(namedTaskTarget)) && candidateTasks.length > 1;
    const isInverse = lowerMsg.includes('инверт') || lowerMsg.includes('задом на пер') || lowerMsg.includes('наоборот');

    const isIntraDay =
      lowerMsg.includes('в течении дня') ||
      lowerMsg.includes('в течение дня') ||
      lowerMsg.includes('по часам') ||
      lowerMsg.includes('в течении суток') ||
      lowerMsg.includes('в течение суток') ||
      isInverse ||
      (lowerMsg.includes('день') && /разброс|раскид|распредел/i.test(lowerMsg) && !lowerMsg.includes('по дням'));

    const isDistribute =
      isIntraDay ||
      isCompositeSplit ||
      /раскид|разброс|распредел/i.test(lowerMsg) ||
      lowerMsg.includes('на неделю') ||
      lowerMsg.includes('по дням');

    let baseDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10); // tomorrow by default
    let baseReminder: string | undefined = undefined;
    let basePriority: 'none' | 'low' | 'medium' | 'high' | undefined = undefined;

    if (lowerMsg.includes('послезавтра') && !isCompositeSplit) {
      baseDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    } else if (lowerMsg.includes('сегодня') && !lowerMsg.includes('завтра') && !isCompositeSplit) {
      baseDate = today;
    } else if (isTomorrowTarget) {
      baseDate = tomorrow;
    } else {
      const parsed = parseTodoistInput(lastUserMsg);
      if (parsed.dueDate) baseDate = parsed.dueDate;
      if (parsed.reminder) baseReminder = parsed.reminder;
      if (parsed.priority) basePriority = parsed.priority;
    }

    if (candidateTasks.length === 1 && !isDistribute) {
      const task = candidateTasks[0];
      const action: SuggestedAction = {
        type: 'update_item',
        targetItemId: task.id,
        title: task.title,
        folder: task.folder,
        content: '',
        tags: task.tags || [],
        itemType: 'task',
        dueDate: baseDate,
        reminder: baseReminder,
        priority: basePriority || task.priority,
        updates: {
          dueDate: baseDate,
          reminder: baseReminder,
          priority: basePriority || task.priority,
        },
        actionState: 'suggested',
      };
      return {
        content: `Перенес задачу «${task.title}» на ${baseDate}.`,
        reasoning: `Локальный перенос задачи: ${task.title} ➔ ${baseDate}`,
        reasoningTimeMs: Date.now() - startTime,
        suggestedAction: action,
      };
    }

    const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
    const sortedTasks = [...candidateTasks].sort((a, b) => {
      if (namedTaskTarget) {
        if (a.id === namedTaskTarget.id) return -1;
        if (b.id === namedTaskTarget.id) return 1;
      }
      const pA = priorityOrder[a.priority || 'none'] || 0;
      const pB = priorityOrder[b.priority || 'none'] || 0;
      return isInverse ? pA - pB : pB - pA;
    });

    const tomorrowIso = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dayAfterTomorrowIso = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    const timeSlots = ['10:00', '12:00', '14:30', '16:30', '18:00', '19:30'];

    const batchItems: BatchUpdateItem[] = sortedTasks.map((t, idx) => {
      let dueDate = baseDate;
      let reminder = baseReminder;
      let reason: string | undefined = undefined;

      if (isIntraDay) {
        const slot = timeSlots[Math.min(idx, timeSlots.length - 1)];
        dueDate = baseDate;
        reminder = `${baseDate}T${slot}:00`;
        reason = isInverse ? `Инвертированный слот ${slot}` : `Слот ${slot}`;
      } else if (isCompositeSplit) {
        // Named or first task -> tomorrow; remaining tasks -> day after tomorrow
        const isLead = namedTaskTarget ? t.id === namedTaskTarget.id : idx === 0;
        dueDate = isLead ? tomorrowIso : dayAfterTomorrowIso;
        reason = isLead ? 'Первая задача' : 'Остальные задачи';
      } else if (isDistribute) {
        dueDate = new Date(Date.now() + 86400000 * (idx + 1)).toISOString().slice(0, 10);
        reason = `День ${idx + 1}`;
      }
      return {
        targetItemId: t.id,
        title: t.title,
        updates: {
          dueDate,
          reminder,
          priority: basePriority || t.priority,
        },
        reason,
      };
    });

    const action: SuggestedAction = {
      type: 'batch_update',
      title: isIntraDay ? `Распределение на день (${batchItems.length})` : `Перенос задач (${batchItems.length})`,
      folder: currentFolder,
      content: '',
      tags: [],
      itemType: 'task',
      batchUpdateItems: batchItems,
      actionState: 'suggested',
    };

    let messageText = `Перенес ${batchItems.length} задач на ${baseDate}.`;
    if (isInverse) {
      messageText = `Инвертировал порядок ${batchItems.length} задач (задом наперед) на ${baseDate}.`;
    } else if (isIntraDay) {
      messageText = `Разбросал ${batchItems.length} задач на ${baseDate} в течение дня по слотам времени.`;
    } else if (isCompositeSplit) {
      const leadTitle = namedTaskTarget ? namedTaskTarget.title : sortedTasks[0].title;
      messageText = `Задачу «${leadTitle}» перенес на завтра, остальные просроченные — на послезавтра.`;
    } else if (isDistribute) {
      messageText = `Раскидал ${batchItems.length} задач по свободным дням недели.`;
    }

    return {
      content: messageText,
      reasoning: isIntraDay
        ? `Сформировано внутридневное распределение ${batchItems.length} задач по слотам времени на ${baseDate}`
        : `Сформирован пакетный перенос ${batchItems.length} задач на ${isDistribute ? 'разные дни' : baseDate}`,
      reasoningTimeMs: Date.now() - startTime,
      suggestedAction: action,
    };
  } else {
    return {
      content: 'В хранилище не найдено задач для переноса.',
      reasoning: 'Задачи для переноса не обнаружены',
      reasoningTimeMs: Date.now() - startTime,
    };
  }
}
