// Applies an action tapped under a telegram answer, and tells the relay what it did.
import { useEffect, useRef } from 'react';
import type { SlagItem, SuggestedAction } from '../../types';
import { logger } from '../../lib/logger/logger';
import { describeActionTarget, parseAssistantAction } from '../../lib/notify/assistantAction';
import { describeError } from '../../lib/notify/prefs';
import { accountClient } from '../../lib/sync/account';
import { syncEngine } from '../../lib/sync/syncEngine';

const assistantLog = logger.scope('NOTIFY');

/** Why a tap changed nothing: the card would have shown a toast, the relay needs the words. */
function failureReason(action: SuggestedAction): string {
  switch (action.type) {
    case 'update_item':
      return `не нашёл запись «${action.title}»`;
    case 'batch_update':
      return 'ни одна запись не подошла';
    default:
      return 'не удалось создать запись';
  }
}

/** The relay edits its own message with this line, so the report travels even when it failed. */
async function report(vaultId: string, requestId: string, ok: boolean, text: string): Promise<void> {
  try {
    await accountClient.appliedAssistant({ vaultId, requestId, ok, text });
  } catch (error) {
    assistantLog.warn('Reporting a tapped telegram action failed', { requestId, error: describeError(error) });
  }
}

/**
 * Runs the action behind a telegram button and reports back.
 *
 * The executor arrives as an argument instead of being read from the context: this hook stays a
 * thin bridge, and the tap lands in exactly the same code the confirmation card in the feed
 * calls, so a button never grows its own second path into the vault.
 */
export function useAssistantActions(
  executeSuggestedAction: (action: SuggestedAction, messageId?: string) => SlagItem | void
): void {
  // A repeated frame for one tap must not create a second task. The set outlives the effect
  // because the executor is rebuilt on every item change.
  const handled = useRef(new Set<string>());

  useEffect(() => {
    const apply = async (requestId: string, raw: unknown): Promise<void> => {
      if (handled.current.has(requestId) || !syncEngine.canUseVaultRelay()) return;
      const vaultId = syncEngine.getSyncVaultId();
      if (!vaultId) {
        assistantLog.warn('Telegram action dropped: no sync vault', { requestId });
        return;
      }
      handled.current.add(requestId);

      const action = parseAssistantAction(raw);
      if (!action) {
        assistantLog.warn('Telegram action dropped: unknown shape', { requestId });
        await report(vaultId, requestId, false, 'не понял действие');
        return;
      }

      let saved: SlagItem | void = undefined;
      let failure: string | null = null;
      try {
        saved = executeSuggestedAction(action);
      } catch (error) {
        failure = describeError(error);
      }

      if (saved) {
        assistantLog.info('Telegram action applied', { requestId, itemId: saved.id, type: action.type });
        await report(vaultId, requestId, true, describeActionTarget(saved));
        return;
      }
      // `void` is the executor's honest "nothing happened": the target was missing, or the card
      // had already been applied somewhere else.
      const text = failure ?? failureReason(action);
      assistantLog.warn('Telegram action not applied', { requestId, type: action.type, reason: text });
      await report(vaultId, requestId, false, text);
    };

    syncEngine.setAssistantActionHandler(apply);
    return () => {
      syncEngine.setAssistantActionHandler(null);
    };
  }, [executeSuggestedAction]);
}
