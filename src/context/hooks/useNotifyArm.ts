// Keeps the relay armed with the current reminders and fires the local ones.
import { useEffect } from 'react';
import type { AssistantMode, SlagItem, VaultMeta } from '../../types';
import { logger } from '../../lib/logger/logger';
import { isChatConfigured } from '../../lib/ai/connections/resolve';
import { loadAiSettings } from '../../lib/ai/connections/settings';
import { answerAssistantQuestion } from '../../lib/notify/assistant';
import { reconcileNotifications, runLocalReminders } from '../../lib/notify/plan';
import { describeError, getNotifyPrefs, getNotifyRoutes } from '../../lib/notify/prefs';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';

/** Editing a reminder fires a burst of saves; one arm request wins, not four. */
const ARM_DEBOUNCE_MS = 2000;
/** Due times are minute-precision, so a half-minute tick is enough to be punctual. */
const LOCAL_TICK_MS = 30_000;

const notifyLog = logger.scope('NOTIFY');

function syncVaultId(): string {
  try {
    return syncEngine.getSyncVaultId();
  } catch {
    return '';
  }
}

function armReminders(items: SlagItem[]): void {
  if (!accountClient.isAuthenticated()) return;
  const vaultId = syncVaultId();
  if (!vaultId) return;
  void reconcileNotifications(items, vaultId, getNotifyRoutes(), getNotifyPrefs());
}

/**
 * Two channels, one owner per reminder: with a telegram route the relay delivers
 * (it is online when the machine is not), without one the app toasts locally.
 */
export function useNotifyArm(items: SlagItem[], vault: VaultMeta): void {
  const vaultId = vault.id;

  // The relay forwards a question from the bot; this device is the only thing that can answer.
  // A socket message can be missed while the link is reconnecting, so connecting also asks the
  // relay what is still waiting — one question must not die to a dropped connection.
  useEffect(() => {
    const handled = new Set<string>();
    const answer = (requestId: string, question: string, mode: AssistantMode): void => {
      if (handled.has(requestId)) return;
      handled.add(requestId);
      const id = syncVaultId();
      if (!id) return;
      void answerAssistantQuestion(id, requestId, question, mode);
    };
    syncEngine.setAssistantHandler(answer);
    // The relay elects one device per question; this is the half of the answer only the app knows.
    syncEngine.setAssistantReadyProvider(() => isChatConfigured(loadAiSettings()));

    const pull = (status: { state: string }): void => {
      if (status.state !== 'connected') return;
      const id = syncVaultId();
      if (!id || !accountClient.isAuthenticated()) return;
      void accountClient
        .pendingAssistant(id)
        .then((pending) => {
          for (const request of pending.requests) {
            answer(request.requestId, request.question, request.mode);
          }
        })
        .catch((error: unknown) => {
          notifyLog.warn('Could not fetch pending telegram questions', { error: describeError(error) });
        });
    };
    const unsubscribe = syncEngine.subscribe(pull);
    pull(syncEngine.getStatus());
    return () => {
      unsubscribe();
      syncEngine.setAssistantHandler(null);
      syncEngine.setAssistantReadyProvider(null);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => armReminders(items), ARM_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, vaultId]);

  useEffect(() => {
    void runLocalReminders(items, getNotifyPrefs());
    const timer = setInterval(() => {
      void runLocalReminders(items, getNotifyPrefs());
      // A route goes live only when the recipient taps the link, and that changes
      // no item: without this pass a pending channel would stay pending forever.
      armReminders(items);
    }, LOCAL_TICK_MS);
    return () => clearInterval(timer);
  }, [items]);
}
