// Reconcile the active vault after its read, incoming changes, and local midnight.
import { useEffect, useState } from 'react';
import { evaluateRecurringTasks } from '../../lib/time/recurrenceHelper';
import { logger } from '../../lib/logger/logger';
import { storage } from '../../lib/storage';
import { isPrimaryWindow } from '../../lib/platform/windowControls';

const appLog = logger.scope('APP');

export function useRecurringRollover(
  read: Promise<boolean>,
  today: string,
  refreshData: () => void,
): boolean {
  const [readyRead, setReadyRead] = useState<Promise<boolean> | null>(null);
  const isReady = readyRead === read;

  useEffect(() => {
    if (!isPrimaryWindow()) return;
    let cancelled = false;
    let timer: number | undefined;

    const reconcile = () => {
      if (cancelled || storage.getCurrentVaultRead() !== read) return;
      try {
        const { changedItems } = evaluateRecurringTasks(storage.getItems());
        if (changedItems.length) {
          storage.saveItems(changedItems, 'local', { rollover: true });
          appLog.info('Recurring tasks rolled over', { changedCount: changedItems.length });
        }
        setReadyRead(read);
      } catch (error) {
        setReadyRead(null);
        appLog.error('Could not reconcile recurring tasks', error);
      }
      refreshData();
    };

    let canReconcile = false;
    const queueReconcile = () => {
      if (!canReconcile || timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        reconcile();
      }, 0);
    };

    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ hasItemsChanged?: boolean }>).detail;
      if (storage.getCurrentVaultRead() !== read || !canReconcile || detail?.hasItemsChanged === false) {
        refreshData();
      } else {
        queueReconcile();
      }
    };
    window.addEventListener('slag-sync-updated', onSync);
    const unsubscribe = storage.subscribeChanges(event => {
      if (event.kind === 'item' && event.action === 'upsert' && event.origin === 'external' && event.payload?.recurrence) queueReconcile();
    });
    void read.then((ok) => {
      if (cancelled || storage.getCurrentVaultRead() !== read) return;
      if (!ok) {
        refreshData();
        return;
      }
      canReconcile = true;
      reconcile();
    }).catch((error: unknown) => appLog.error('Could not read tasks for recurrence', error));

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('slag-sync-updated', onSync);
      unsubscribe();
    };
  }, [read, today, refreshData]);

  return isReady;
}
