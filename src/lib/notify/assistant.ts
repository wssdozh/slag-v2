// The assistant path of the bot: what a question forwarded from telegram is answered with.
import type { AssistantMode, NotifyRoute, SlagItem } from '../../types';
import type { AssistantActionPayload } from '../sync/accountTypes';
import { DEFAULT_INBOX_FOLDER } from '../../config/storage';
import { logger } from '../logger/logger';
import { storage } from '../storage';
import { accountClient } from '../sync/account';
import { assistantOrchestrator } from '../ai/orchestrator';
import { loadAiSettings } from '../ai/connections/settings';
import { isChatConfigured } from '../ai/connections/resolve';
import { toAssistantAction } from './assistantAction';
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

/** A short thread, device-local on purpose: the relay never stores what was asked or answered. */
const HISTORY_LIMIT = 8;
const HISTORY_ENTRY_CHARS = 600;

interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

function historyKey(vaultId: string): string {
  return `slag_tg_history_${vaultId}`;
}

function loadHistory(vaultId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(historyKey(vaultId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is HistoryEntry => (
        Boolean(entry) && typeof entry === 'object'
        && (entry as HistoryEntry).role !== undefined
        && ((entry as HistoryEntry).role === 'user' || (entry as HistoryEntry).role === 'assistant')
        && typeof (entry as HistoryEntry).content === 'string'
      ))
      .slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveHistory(vaultId: string, entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(historyKey(vaultId), JSON.stringify(entries.slice(-HISTORY_LIMIT)));
  } catch {
    // Quota or a locked storage: losing the thread is better than losing the answer.
  }
}

/**
 * Forgets the thread on this device after `/clear` in the bot.
 *
 * The relay holds no history, so it can only forward the command to the sockets that might;
 * whoever is not in the room keeps a thread that a restart of the conversation no longer needs.
 */
export function clearAssistantHistory(vaultId: string): void {
  try {
    localStorage.removeItem(historyKey(vaultId));
  } catch {
    // A locked storage keeps the old thread; there is nothing to report to the person either.
  }
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
  mode: AssistantMode,
  reportStage: (stage: 'thinking') => void = () => {}
): Promise<void> {
  const items = storage.getItems();
  const history = loadHistory(vaultId);
  const asked: HistoryEntry = { role: 'user', content: (question.trim() || 'что по задачам?').slice(0, HISTORY_ENTRY_CHARS) };
  let answer = '';
  let offered: AssistantActionPayload | null = null;
  // The stages are logged one by one because "бот задумался" is answered by exactly one of
  // them being last: a received question with no `model started` never reached the model.
  notifyLog.info('Telegram question received', { requestId, mode });
  try {
    const settings = loadAiSettings();
    if (isChatConfigured(settings)) {
      // The relay keeps one bubble for the whole exchange: this is the moment it stops saying
      // "handed to a device" and starts saying "writing".
      reportStage('thinking');
      const startedAt = Date.now();
      notifyLog.info('Telegram answer model started', { requestId });
      const result = await assistantOrchestrator.runChat({
        // The thread from this chat, so "а конкретной записи нет?" means what it meant a minute
        // ago. Only the device that answers holds it; the relay stays oblivious.
        messages: [...history, asked],
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
      // The first proposal is the one that becomes the button: a telegram message has room for
      // one tap, and the rest of the answer already says what else could be done.
      offered = toAssistantAction(requestId, result.suggestedActions?.[0] ?? result.suggestedAction);
      notifyLog.info(
        'Telegram answer model done',
        { requestId, hasAction: offered !== null, chars: answer.length },
        Date.now() - startedAt
      );
    }
  } catch (error) {
    notifyLog.warn('The assistant could not answer a telegram question', { error: describeError(error) });
  }
  if (!answer) answer = buildAssistantAnswer(items);
  // The thread grows only with what the person saw: a failed delivery would otherwise leave a
  // question in the history that was never answered.
  try {
    await accountClient.answerAssistant(
      offered ? { vaultId, requestId, answer, action: offered } : { vaultId, requestId, answer }
    );
    notifyLog.info('Telegram answer sent', { requestId, withAction: offered !== null });
    saveHistory(vaultId, [...history, asked, { role: 'assistant', content: answer.slice(0, HISTORY_ENTRY_CHARS) }]);
  } catch (error) {
    notifyLog.warn('Answering a telegram question failed', { error: describeError(error) });
  }
}
