// Rolls recurring tasks over at midnight and after the tab wakes, with no user.
import { useCallback, useEffect } from 'react';
import { evaluateRecurringTasks } from '../../lib/time/recurrenceHelper';
import { getISODateString } from '../../lib/time/dateUtils';
import { logger } from '../../lib/logger/logger';
import { storage } from '../../lib/storage';
import { isPrimaryWindow } from '../../lib/platform/windowControls';

const appLog = logger.scope('APP');

/**
 * Recurring tasks roll over on their own schedule: at midnight, and when the tab
 * comes back after a long sleep. One reason to change — the rollover rules.
 *
 * It fires without a user, which is why it is not part of any command the UI calls.
 */
export function useRecurringRollover(refreshData: () => void) {
  const runRecurringEvaluation = useCallback(() => {
    const currentItems = storage.getItems();
    const { updatedItems, changedCount } = evaluateRecurringTasks(currentItems);
    if (changedCount > 0) {
      storage.saveItems(updatedItems);
      refreshData();
      appLog.info(`Recurring tasks evaluated: ${changedCount} tasks rolled over/respawned`);
    }
  }, [refreshData]);

  // Midnight transition and tab visibility wakeup listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Only the main window rolls tasks over: two windows meant two respawns and two pushes.
    if (!isPrimaryWindow()) return;
    let timerId: number | undefined;

    const scheduleMidnightCheck = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const delayMs = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timerId = window.setTimeout(() => {
        runRecurringEvaluation();
        scheduleMidnightCheck();
      }, delayMs);
    };

    scheduleMidnightCheck();

    let lastCheckedDate = getISODateString(new Date());
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentDate = getISODateString(new Date());
        if (currentDate !== lastCheckedDate) {
          lastCheckedDate = currentDate;
          runRecurringEvaluation();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerId !== undefined) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runRecurringEvaluation]);

}
