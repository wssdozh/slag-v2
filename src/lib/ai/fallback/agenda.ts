/**
 * Agenda intent: what is scheduled and overdue for a given day.
 */
import type { ChatToolCall } from '../../../types';
import type { SendAssistantChatResult } from '../types';
import { hasCreateIntent, hasRescheduleIntent, readIntentText } from './intentContext';
import type { LocalFallbackParams } from './types';

export async function calendarAgenda(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { executeLocalTool, startTime } = params;
  const { lowerMsg } = readIntentText(params);

  const isCalendarQuery =
    (lowerMsg.includes('повестк') ||
    lowerMsg.includes('план') ||
    lowerMsg.includes('расписани') ||
    lowerMsg.includes('календар') ||
    lowerMsg.includes('просроченн') ||
    lowerMsg.includes('сегодня') ||
    lowerMsg.includes('завтра') ||
    lowerMsg.includes('послезавтра') ||
    lowerMsg.includes('вчера') ||
    lowerMsg === 'а на завтра чо' ||
    lowerMsg === 'а на завтра то чо' ||
    lowerMsg.includes('чо на завтра') ||
    lowerMsg.includes('че на завтра') ||
    lowerMsg.includes('что на завтра') ||
    lowerMsg.includes('на завтра') ||
    (lowerMsg.includes('дела') && (lowerMsg.includes('день') || lowerMsg.includes('сегодня') || lowerMsg.includes('завтра'))) ||
    (lowerMsg.includes('задач') && (lowerMsg.includes('день') || lowerMsg.includes('сегодня') || lowerMsg.includes('завтра') || lowerMsg.includes('просроч')))) &&
    !lowerMsg.includes('сколько') &&
    !lowerMsg.includes('статистик') &&
    !hasRescheduleIntent(lowerMsg);

  if (!isCalendarQuery || hasCreateIntent(lowerMsg) || lowerMsg.includes('разбей')) {
    return null;
  }

  let targetDate = new Date().toISOString().slice(0, 10);
  let dateLabel = 'сегодня';
  if (lowerMsg.includes('послезавтра')) {
    targetDate = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    dateLabel = 'послезавтра';
  } else if (lowerMsg.includes('завтра')) {
    targetDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    dateLabel = 'завтра';
  } else if (lowerMsg.includes('вчера')) {
    targetDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    dateLabel = 'вчера';
  }

  const agenda = await executeLocalTool('get_calendar_agenda', { date: targetDate });
  const executedToolCalls: ChatToolCall[] = [
    { name: 'get_calendar_agenda', args: { date: agenda.targetDate }, result: agenda },
  ];

  let content = `Повестка на ${agenda.targetDate} (${dateLabel}):\n`;
  if (agenda.scheduledCount === 0 && agenda.overdueCount === 0) {
    content += '- Запланированных задач нет. День свободен для глубокой работы.';
  } else {
    if (agenda.scheduledCount > 0) {
      content += `\n**Запланировано (${agenda.scheduledCount}):**\n`;
      agenda.scheduledTasks.forEach((t: any) => {
        content += `- [[${t.title}]] (${t.status || 'todo'}, приоритет: ${t.priority || 'обычный'})\n`;
      });
    }
    if (agenda.overdueCount > 0) {
      content += `\n**Просроченные задачи (${agenda.overdueCount}):**\n`;
      agenda.overdueTasks.forEach((t: any) => {
        content += `- [[${t.title}]] (срок: ${t.dueDate})\n`;
      });
    }
  }

  return {
    content,
    reasoning: `Сформирована сводка календаря через get_calendar_agenda(${agenda.targetDate})`,
    reasoningTimeMs: Date.now() - startTime,
    toolCalls: executedToolCalls,
  };
}
