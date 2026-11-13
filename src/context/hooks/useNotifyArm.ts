// Keeps the relay armed with the current reminders and fires the local ones.
import { useEffect } from 'react';
import type { SlagItem, VaultMeta } from '../../types';
import {
  answerAssistantQuestion,
  getNotifyPrefs,
  getNotifyRoutes,
  reconcileNotifications,
  runLocalReminders,
} from '../../lib/notify';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';

/** Editing a reminder fires a burst of saves; one arm request wins, not four. */
const ARM_DEBOUNCE_MS = 2000;
/** Due times are minute-precision, so a half-minute tick is enough to be punctual. */
const LOCAL_TICK_MS = 30_000;

function armReminders(items: SlagItem[]): void {
  if (!accountClient.isAuthenticated()) return;
  let vaultId = '';
  try {
    vaultId = syncEngine.getSyncVaultId();
  } catch {
    return;
  }
  void reconcileNotifications(items, vaultId, getNotifyRoutes(), getNotifyPrefs());
}

/**
 * Two channels, one owner per reminder: with a telegram route the relay delivers
 * (it is online when the machine is not), without one the app toasts locally.
 */
export function useNotifyArm(items: SlagItem[], vault: VaultMeta): void {
  const vaultId = vault.id;

  // The relay forwards a question from the bot; this device is the only thing that can answer.
  useEffect(() => {
    const syncVaultId = (): string => {
      try {
        return syncEngine.getSyncVaultId();
      } catch {
        return '';
      }
    };
    syncEngine.setAssistantHandler((requestId) => {
      const id = syncVaultId();
      if (id) void answerAssistantQuestion(id, requestId);
    });
    return () => syncEngine.setAssistantHandler(null);
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
