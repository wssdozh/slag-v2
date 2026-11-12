/**
 * Conversational intents: a link from context, deletion refusal, meta talk, greetings and the noise guard.
 */
import type { SendAssistantChatResult } from '../types';
import { readIntentText } from './intentContext';
import type { LocalFallbackParams } from './types';

export async function contextualLink(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { messages, startTime } = params;
  const { lowerMsg } = readIntentText(params);

  if (
    !lowerMsg.includes('линк на') &&
    !lowerMsg.includes('дай мне линк') &&
    !lowerMsg.includes('дай ссылку') &&
    !lowerMsg.includes('ссылк')
  ) {
    return null;
  }

  let foundTitle: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messages[i].content;
    const wikiMatch = text.match(/\[\[([^\]]+)\]\]/);
    if (wikiMatch) {
      foundTitle = wikiMatch[1];
      break;
    }
    const quoteMatch = text.match(/[«"]([^»"]+)[»"]/);
    if (quoteMatch) {
      foundTitle = quoteMatch[1];
      break;
    }
  }

  if (!foundTitle) {
    return null;
  }

  return {
    content: `Вот ссылка на запись из контекста: [[${foundTitle}]]`,
    reasoning: `Извлечена ссылка из контекста предыдущих сообщений диалога: [[${foundTitle}]]`,
    reasoningTimeMs: Date.now() - startTime,
  };
}

export async function refuseDelete(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { startTime } = params;
  const { lowerMsg } = readIntentText(params);

  if (!lowerMsg.includes('удали') && !lowerMsg.includes('стереть') && !lowerMsg.includes('delete')) {
    return null;
  }

  return {
    content: 'Удаление заметок не поддерживается напрямую из диалога ради безопасности данных. Возможны только создание, перемещение в архив/корзину, изменение статуса и планирование задач.',
    reasoning: 'Сработало правило Read-Only Safety (удаление заблокировано)',
    reasoningTimeMs: Date.now() - startTime,
  };
}

export async function metaTalk(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { startTime } = params;
  const { lowerMsg } = readIntentText(params);

  if (
    lowerMsg !== 'не хочу' &&
    lowerMsg !== 'не надо' &&
    lowerMsg !== 'что' &&
    lowerMsg !== 'что?' &&
    lowerMsg !== 'чо' &&
    !lowerMsg.includes('почему ты') &&
    !lowerMsg.includes('почему не') &&
    !lowerMsg.includes('молч') &&
    !lowerMsg.includes('не общ') &&
    !lowerMsg.includes('даун') &&
    !lowerMsg.includes('дурак') &&
    !lowerMsg.includes('туп') &&
    !lowerMsg.includes('глуп') &&
    !lowerMsg.includes('поговори')
  ) {
    return null;
  }

  return {
    content: `Я работаю в локальном автономном режиме без активного API-ключа.\n\nВ этом режиме доступны базовые функции: календарная повестка («план на сегодня/завтра»), статистика хранилища, поиск заметок и создание задач.\n\nДля свободного диалога и рассуждений подключите API-ключ Groq или KIE.AI в Настройках (⌘,).`,
    reasoning: 'Локальный диалоговый ответ (автономный режим без LLM API)',
    reasoningTimeMs: Date.now() - startTime,
  };
}

export async function greetingHelp(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { startTime } = params;
  const { lowerMsg } = readIntentText(params);

  if (
    lowerMsg !== 'привет' &&
    lowerMsg !== 'здравствуй' &&
    lowerMsg !== 'здравствуйте' &&
    lowerMsg !== 'хай' &&
    lowerMsg !== 'hello' &&
    !lowerMsg.includes('кто ты') &&
    !lowerMsg.includes('что ты умеешь') &&
    !lowerMsg.includes('помощь') &&
    lowerMsg !== 'help'
  ) {
    return null;
  }

  return {
    content: `Ассистент базы знаний SLAG v2 (локальный режим):\n\n- 📅 **Повестка дня**: «план на сегодня», «что на завтра»\n- 🔍 **Поиск заметок**: введите тему или ключевое слово\n- 📊 **Статистика**: «сколько заметок в базе?»\n- ✏️ **Создание**: «создай задачу: ...»\n\nДля подключения полной языковой модели укажите ключ Groq или KIE.AI в Настройках (⌘,).`,
    reasoning: 'Справочный ответ локального агента',
    reasoningTimeMs: Date.now() - startTime,
  };
}

export async function shortNoise(params: LocalFallbackParams): Promise<SendAssistantChatResult | null> {
  const { startTime } = params;
  const { lowerMsg } = readIntentText(params);

  if (lowerMsg.length >= 2) {
    return null;
  }

  return {
    content: 'Пожалуйста, введите запрос для поиска или команду для ассистента.',
    reasoning: 'Слишком короткий запрос',
    reasoningTimeMs: Date.now() - startTime,
  };
}
