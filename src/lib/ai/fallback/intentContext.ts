/**
 * Message normalization and intent flags shared by the fallback handlers.
 */
import type { LocalFallbackParams } from './types';

export interface IntentText {
  lastUserMsg: string;
  lowerMsg: string;
}

export function readIntentText(params: LocalFallbackParams): IntentText {
  const lastUserMsg = [...params.messages].reverse().find((m) => m.role === 'user')?.content || '';
  const rawLowerMsg = lastUserMsg.toLowerCase().trim();
  // Ponytail: normalize common slang into canonical terms in one line
  const lowerMsg = rawLowerMsg
    .replace(/сёдня|седня/g, 'сегодня')
    .replace(/таск(у|и|а|е|ом|ах)?\b/gi, 'задачу');
  return { lastUserMsg, lowerMsg };
}

export function hasPriorityIntent(lowerMsg: string): boolean {
  return /приоритет/i.test(lowerMsg);
}

export function hasStatusIntent(lowerMsg: string): boolean {
  return /статус/i.test(lowerMsg) || /отметь как|переведи в/i.test(lowerMsg);
}

export function hasCreateIntent(lowerMsg: string): boolean {
  return (
    !hasPriorityIntent(lowerMsg) &&
    !hasStatusIntent(lowerMsg) &&
    !lowerMsg.includes('приоритет') &&
    !lowerMsg.includes('статус') &&
    (lowerMsg.includes('созда') ||
      lowerMsg.includes('добав') ||
      lowerMsg.includes('сдела') ||
      lowerMsg.includes('написа') ||
      lowerMsg.includes('напиш') ||
      lowerMsg.includes('оформ') ||
      lowerMsg.includes('преврат') ||
      lowerMsg.includes('запланир') ||
      lowerMsg.includes('постав') ||
      lowerMsg.includes('новая заметка') ||
      lowerMsg.includes('новую задачу') ||
      lowerMsg.includes('статью'))
  );
}

export function hasRescheduleIntent(lowerMsg: string): boolean {
  return (
    /перенес|сдвин|раскид|разброс|распредел|отлож|передвин|инвертир|задом на пер/i.test(lowerMsg) ||
    (lowerMsg.includes('задач') &&
      (lowerMsg.includes('на завтра') || lowerMsg.includes('на послезавтра')) &&
      !hasCreateIntent(lowerMsg))
  );
}
