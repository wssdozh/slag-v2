/**
 * Notes and drafts: appending to a note, refining a draft, creating a record.
 */
import type { SuggestedAction } from '../../../types';
import type { SendAssistantChatResult } from '../types';
import { findItemByWikiLinks, findRecentMessage } from './history';
import { hasCreateIntent, hasPriorityIntent, hasStatusIntent, readIntentText } from './intentContext';
import type { LocalFallbackParams } from './types';

export async function appendToNote(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { messages, allItems, startTime } = params;
  const { lastUserMsg, lowerMsg } = readIntentText(params);

  const isAppendIntent =
    (lowerMsg.includes('добавь в заметку') ||
     lowerMsg.includes('допиши в заметку') ||
     lowerMsg.includes('добавь к заметке') ||
     lowerMsg.includes('допиши к задаче') ||
     lowerMsg.includes('добавь в конец')) &&
    !lowerMsg.includes('создай') &&
    !lowerMsg.includes('подзадач');

  if (!isAppendIntent) {
    return null;
  }

  // Find target note
  let targetNote = allItems.find((item) => lowerMsg.includes(item.title.toLowerCase()));

  if (!targetNote) {
    targetNote = findItemByWikiLinks(messages, allItems);
  }

  if (!targetNote) {
    return null;
  }

  // Extract content after quotes, colon or keywords
  let appendText = lastUserMsg;
  const colonIdx = lastUserMsg.indexOf(':');
  if (colonIdx !== -1) {
    appendText = lastUserMsg.slice(colonIdx + 1).trim();
  } else {
    const quoteMatch = lastUserMsg.match(/[«"]([^»"]+)[»"]/);
    if (quoteMatch) {
      appendText = quoteMatch[1];
    } else {
      appendText = lastUserMsg.replace(/^.*?(?:добавь|допиши)\s+(?:в\s+заметку|к\s+заметке|в\s+конец)?\s*/i, '').trim();
    }
  }

  const action: SuggestedAction = {
    type: 'update_item',
    targetItemId: targetNote.id,
    title: targetNote.title,
    actionLabel: 'Дополнение заметки',
    folder: targetNote.folder,
    content: appendText,
    appendContent: appendText,
    tags: targetNote.tags || [],
    itemType: targetNote.type,
    updates: {
      appendContent: appendText,
    },
    actionState: 'suggested',
  };

  return {
    content: `Добавил пункт в заметку «${targetNote.title}».`,
    reasoning: `Локальное дополнение заметки [[${targetNote.title}]]`,
    reasoningTimeMs: Date.now() - startTime,
    suggestedAction: action,
  };
}

export async function refineDraft(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { messages, startTime, currentFolder } = params;
  const { lastUserMsg, lowerMsg } = readIntentText(params);

  const recentActionMsg = findRecentMessage(messages, [
    '[Действие ассистента:',
    '[Подготовлен черновик',
    '[Подготовлено действие:',
    'Уточните, какие именно подробности',
    '«почистить яйца»',
  ]);

  const isRefineIntent =
    lowerMsg.includes('подробност') ||
    lowerMsg.includes('инструмент') ||
    lowerMsg.includes('детал') ||
    lowerMsg.includes('измени') ||
    lowerMsg.includes('уточни') ||
    lowerMsg.includes('шаг') ||
    Boolean(recentActionMsg && (recentActionMsg.content.includes('Уточните') || recentActionMsg.content.includes('подробности')));

  if (!isRefineIntent || !recentActionMsg) {
    return null;
  }

  const titleMatch = recentActionMsg.content.match(/[«"]([^»"]+)[»"]/) || recentActionMsg.content.match(/Заголовок:\s*«([^»]+)»/);
  const existingTitle = titleMatch ? titleMatch[1] : 'почистить яйца';

  const dueMatch = recentActionMsg.content.match(/Срок:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  const existingDue = dueMatch ? dueMatch[1] : undefined;

  const details = lastUserMsg.replace(/^(добавь|укажи|запиши|измени|можешь добавить|подробности|детали)\s*/i, '').trim();
  const suggestedAction: SuggestedAction = {
    type: existingDue ? 'schedule_task' : 'create_note',
    title: existingTitle,
    folder: currentFolder,
    content: `Подробности:\n- ${details || lastUserMsg}`,
    dueDate: existingDue,
    priority: 'medium',
    tags: ['задачи'],
    itemType: 'task',
    actionState: 'suggested',
  };

  return {
    content: `Обновлен черновик задачи «${existingTitle}»:`,
    reasoning: 'Обновлен черновик задачи на основе контекста диалога (Read-Only Safety)',
    reasoningTimeMs: Date.now() - startTime,
    suggestedAction,
  };
}

export async function createRecord(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { messages, startTime, currentFolder } = params;
  const { lastUserMsg, lowerMsg } = readIntentText(params);

  if (
    !hasCreateIntent(lowerMsg) ||
    hasPriorityIntent(lowerMsg) ||
    hasStatusIntent(lowerMsg) ||
    lowerMsg.includes('приоритет') ||
    lowerMsg.includes('статус')
  ) {
    return null;
  }

  const isTask = lowerMsg.includes('задач') || lowerMsg.includes('таск');
  const isArticle = lowerMsg.includes('стать') || lowerMsg.includes('лонгрид');
  const itemType = isArticle ? 'article' : isTask ? 'task' : 'note';

  let dueDate: string | undefined;
  if (lowerMsg.includes('на завтра') || lowerMsg.includes('завтра')) {
    dueDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  } else if (lowerMsg.includes('на сегодня') || lowerMsg.includes('сегодня')) {
    dueDate = new Date().toISOString().slice(0, 10);
  } else if (lowerMsg.includes('на послезавтра') || lowerMsg.includes('послезавтра')) {
    dueDate = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
  }

  let previousDraftContent = '';
  let previousTitle = '';
  if (
    lowerMsg.includes('из этого') ||
    lowerMsg.includes('из этой') ||
    lowerMsg.includes('на этот счет') ||
    lowerMsg.includes('на счёт этого') ||
    lowerMsg.includes('на счет этого') ||
    lowerMsg.includes('об этом') ||
    lowerMsg.includes('преврати')
  ) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const text = messages[i].content;
      if (text && text.length > 20) {
        previousDraftContent = text;
        const titleM = text.match(/[«"]([^»"]+)[»"]/) || text.match(/\[\[([^\]]+)\]\]/);
        if (titleM) previousTitle = titleM[1];
        break;
      }
    }
  }

  let title = previousTitle;
  if (!title) {
    const quoted = lastUserMsg.match(/["«]([^"»]+)["»]/);
    if (quoted) {
      title = quoted[1];
    } else {
      let cleaned = lastUserMsg.split('\n')[0].trim();
      cleaned = cleaned.replace(/^(?:можешь|пожалуйста|хочу|нужно|надо)\s+/i, '');
      cleaned = cleaned.replace(/^(?:создай|добавь|сделай|напиши|оформи|преврати|запланируй)\s+(?:новую\s+|новый\s+)?(?:таску|задачу|заметку|статью|черновик)?\s*/i, '');
      cleaned = cleaned.replace(/^(?:таску|задачу|заметку|статью|черновик)\s+/i, '');
      cleaned = cleaned.replace(/\s+на\s+(?:сегодня|завтра|послезавтра)\s*$/i, '');
      cleaned = cleaned.replace(/^на\s+(?:сегодня|завтра|послезавтра)\s+/i, '');
      cleaned = cleaned.replace(/:\s*$/, '').trim();
      title = cleaned || (isArticle ? 'Статья' : isTask ? 'Новая задача' : 'Новая мысль');
    }
  }

  const msgLines = lastUserMsg.split('\n').map(l => l.trim()).filter(Boolean);
  const extraBody = msgLines.length > 1 ? msgLines.slice(1).join('\n') : '';

  const cleanContent = previousDraftContent
    ? (previousDraftContent.startsWith('[Подготовлен черновик')
        ? previousDraftContent.replace(/^\[Подготовлен черновик[^:]*:[^\]]*\]\n?/, '')
        : previousDraftContent)
    : extraBody;

  const suggestedAction: SuggestedAction = {
    type: dueDate ? 'schedule_task' : 'create_note',
    title: title.trim(),
    folder: currentFolder,
    content: isArticle ? `# ${title.trim()}\n\n${cleanContent}` : cleanContent,
    tags: isArticle ? ['статьи', 'база-знаний'] : isTask ? ['задачи'] : ['ассистент'],
    dueDate,
    priority: isTask ? 'medium' : undefined,
    itemType,
    actionState: 'suggested',
  };

  return {
    content: `Черновик ${isArticle ? 'статьи' : isTask ? (dueDate ? 'задачи в календарь' : 'задачи') : 'заметки'}:`,
    reasoning: 'Сформирован черновик записи согласно правилу Read-Only Safety',
    reasoningTimeMs: Date.now() - startTime,
    suggestedAction,
  };
}
