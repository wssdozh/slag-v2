// The assistant path of the bot: what a question forwarded from telegram is answered with.
import type { AssistantMode, NotifyRoute, SlagItem } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config/storage';
import { logger } from '../logger/logger';
import { storage } from '../storage';
import { accountClient } from '../sync/account';
import { assistantOrchestrator } from '../ai/orchestrator';
import { loadAiSettings } from '../ai/connections/settings';
import { isChatConfigured } from '../ai/connections/resolve';
import { localDateKey, resolveReminder } from './plan';
import { describeError } from './prefs';

const notifyLog = logger.scope('NOTIFY');

/**
 * Tools a forwarded question may use per mode; `null` means no restriction.
 *
 * A question typed here and a question typed into telegram are not the same trust boundary:
 * in `minimal` the assistant never gets a tool that returns a note body, so an answer can only
 * ever summarise tasks. `risky` is the person explicitly saying "read whatever you find".
 */
export const ASSISTANT_TOOL_ALLOWLIST: Record<AssistantMode, string[] | null> = {
  minimal: ['get_calendar_agenda', 'get_vault_stats'],
  risky: null,
};

/** Points the bot at every live channel, or takes all of them out of the assistant path. */
export async function setAssistantForRoutes(
  vaultId: string,
  routes: NotifyRoute[],
  enabled: boolean,
  mode: AssistantMode
): Promise<void> {
  for (const route of routes.filter((entry) => entry.state === 'active')) {
    await accountClient.setAssistantLink({ vaultId, routeToken: route.token, enabled, mode });
  }
}

/** The honest local answer: no model, no invented text, just what the vault already knows. */
export function buildAssistantAnswer(items: SlagItem[], now = Date.now()): string {
  const todayKey = localDateKey(now);
  const open = items.filter((item) => item.type === 'task' && item.status !== 'done');
  const dueToday = open.filter((item) => item.dueDate === todayKey);
  const overdue = open.filter((item) => !!item.dueDate && item.dueDate < todayKey);
  const upcoming = open
    .map((item) => ({ item, at: resolveReminder(item) }))
    .filter((entry): entry is { item: SlagItem; at: number } => entry.at !== null && entry.at > now)
    .sort((left, right) => left.at - right.at)[0];

  // Plain text, one fact per line: the relay escapes the answer and sends it as is, so this is
  // the shape a phone shows — a headline that answers the question, then the items behind it.
  const lines: string[] = [];
  if (dueToday.length === 0) {
    lines.push(overdue.length > 0 ? 'На сегодня задач нет.' : 'На сегодня задач нет, просроченного тоже.');
  } else {
    lines.push(`На сегодня ${dueToday.length} ${dueToday.length === 1 ? 'задача' : 'задачи'}:`);
    for (const task of dueToday.slice(0, 5)) lines.push(`• ${task.title}`);
    if (dueToday.length > 5) lines.push(`• и ещё ${dueToday.length - 5}`);
  }
  if (overdue.length > 0) lines.push('', `Просрочено: ${overdue.length}.`);
  if (upcoming) {
    const time = new Date(upcoming.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    lines.push('', `Ближайшее: «${upcoming.item.title}» в ${time}.`);
  }
  return lines.join('\n');
}

/**
 * Answers a question the relay forwarded from the bot.
 *
 * The model runs here, on the device, whichever lane pays for it: `resolveChatTarget` already
 * routes "own key" and "subscription" to the same orchestrator, so there is one answerer rather
 * than a second one on the relay. Whatever the model cannot produce falls back to the local
 * summary — a question must always end with a message, never with silence.
 */
export async function answerAssistantQuestion(
  vaultId: string,
  requestId: string,
  question: string,
  mode: AssistantMode
): Promise<void> {
  const items = storage.getItems();
  let answer = '';
  try {
    const settings = loadAiSettings();
    if (isChatConfigured(settings)) {
      const result = await assistantOrchestrator.runChat({
        messages: [{ role: 'user', content: question.trim() || 'что по задачам?' }],
        // The whole vault, not a folder: the bot has no idea which folder the person meant.
        currentFolder: DEFAULT_INBOX_FOLDER,
        settings,
        folders: storage.getFolders(),
        allItems: items,
        // Undefined means "everything" to the orchestrator; null here means the same thing.
        toolAllowlist: ASSISTANT_TOOL_ALLOWLIST[mode] ?? undefined,
        // The answer is delivered as escaped plain text by the relay, so the model is told how
        // telegram reads it instead of producing markdown nobody will render.
        channel: 'telegram',
      });
      answer = (result.content ?? '').trim();
    }
  } catch (error) {
    notifyLog.warn('The assistant could not answer a telegram question', { error: describeError(error) });
  }
  if (!answer) answer = buildAssistantAnswer(items);
  try {
    await accountClient.answerAssistant({ vaultId, requestId, answer });
  } catch (error) {
    notifyLog.warn('Answering a telegram question failed', { error: describeError(error) });
  }
}
