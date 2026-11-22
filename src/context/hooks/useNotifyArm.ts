// Keeps the relay armed with the current reminders and fires the local ones.
import { useEffect } from 'react';
import type { AssistantMode, SlagItem, VaultMeta } from '../../types';
import { logger } from '../../lib/logger/logger';
import { isChatConfigured } from '../../lib/ai/connections/resolve';
import { loadAiSettings } from '../../lib/ai/connections/settings';
import { answerAssistantQuestion, clearAssistantHistory } from '../../lib/notify/assistant';
import { reconcileNotifications, runLocalReminders } from '../../lib/notify/plan';
import { describeError, getNotifyPrefs, getNotifyRoutes, integrationsLive } from '../../lib/notify/prefs';
import { isPrimaryWindow } from '../../lib/platform/windowControls';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';
import { storage } from '../../lib/storage';

/** Editing a reminder fires a burst of saves; one arm request wins, not four. */
const ARM_DEBOUNCE_MS = 2000;
/** Due times are minute-precision, so a half-minute tick is enough to be punctual. */
const LOCAL_TICK_MS = 30_000;
/**
 * Safety net for a question that arrived while the socket was down and no edge follows.
 *
 * Five seconds, not thirty: this is the only path that picks up a question the relay could not
 * hand to a live socket, and at thirty a person watched the placeholder for half a minute.
 */
const PENDING_PULL_MS = 5_000;

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
  // The master switch takes every route out of the arm path: the relay disarms what this
  // session queued there, and nothing new leaves the device.
  const prefs = getNotifyPrefs();
  void reconcileNotifications(
    items,
    vaultId,
    integrationsLive(prefs) ? getNotifyRoutes() : [],
    prefs
  );
}

/**
 * Two channels, one owner per reminder: with a telegram route the relay delivers
 * (it is online when the machine is not), without one the app toasts locally.
 */
export function useNotifyArm(items: SlagItem[], vault: VaultMeta, ready: boolean, read: Promise<boolean>): void {
  const vaultId = vault.id;
  // One window answers questions and arms reminders. The quick composer mounts the same
  // provider, and two arming loops meant two arm requests per edit, two telegram polls and
  // two "arming a reminder failed" lines for one broken channel.
  const isPrimary = isPrimaryWindow();

  // The relay forwards a question from the bot; this device is the only thing that can answer.
  // A socket message can be missed while the link is reconnecting, so connecting also asks the
  // relay what is still waiting — one question must not die to a dropped connection.
  useEffect(() => {
    if (!isPrimary) return;
    const handled = new Set<string>();
    const answer = (
      requestId: string,
      question: string,
      mode: AssistantMode,
      // Absent on the catch-up path: that question came over HTTP, not over the socket that
      // could report a stage back to the relay.
      reportStage: (stage: 'thinking') => void = () => {},
    ): void => {
      if (handled.has(requestId)) return;
      handled.add(requestId);
      const id = syncVaultId();
      if (!id) return;
      void answerAssistantQuestion(id, requestId, question, mode, reportStage);
    };
    syncEngine.setAssistantHandler(answer);
    // `/clear` in the bot: the thread is stored here, so this device is the only one that can
    // drop it. The relay just forwards the command.
    syncEngine.setAssistantClearHandler(() => {
      const id = syncVaultId();
      if (id) clearAssistantHistory(id);
    });
    // The relay elects one device per question; this is the half of the answer only the app knows.
    syncEngine.setAssistantReadyProvider(() => isChatConfigured(loadAiSettings()));

    const pull = (): void => {
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
    // Only on the edge into "connected", not on every status notify: the engine notifies on pings,
    // acks and device counts, and pulling then raced the socket dispatch — this device took the
    // question over HTTP while the relay was still deciding to send it, so answers kept arriving
    // "before" their own dispatch. The timer covers the reconnect that would otherwise be missed.
    let wasConnected = false;
    const onStatus = (status: { state: string }): void => {
      const connected = status.state === 'connected';
      if (connected && !wasConnected) pull();
      wasConnected = connected;
    };
    const unsubscribe = syncEngine.subscribe(onStatus);
    onStatus(syncEngine.getStatus());
    const retry = setInterval(pull, PENDING_PULL_MS);
    return () => {
      unsubscribe();
      clearInterval(retry);
      syncEngine.setAssistantHandler(null);
      syncEngine.setAssistantClearHandler(null);
      syncEngine.setAssistantReadyProvider(null);
    };
  }, [isPrimary]);

  useEffect(() => {
    if (!isPrimary || !ready) return;
    const isCurrent = () => storage.getCurrentVaultRead() === read && storage.getCurrentVault().id === vaultId;
    const arm = () => {
      if (isCurrent() && syncEngine.getCurrentVaultId() === vaultId) armReminders(items);
    };
    const local = () => {
      if (isCurrent()) void runLocalReminders(items, getNotifyPrefs());
    };
    local();
    const debounce = setTimeout(arm, ARM_DEBOUNCE_MS);
    // A route can go live without an item change, so retry arming on the existing tick.
    const tick = setInterval(() => { local(); arm(); }, LOCAL_TICK_MS);
    return () => {
      clearTimeout(debounce);
      clearInterval(tick);
    };
  }, [isPrimary, ready, read, items, vaultId]);
}
