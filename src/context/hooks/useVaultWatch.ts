// Keeps the open vault honest about the disk. Files the MCP server, another editor or a script
// write land in the feed without a restart, and a stale note is reported instead of silently
// overwritten. Desktop only: on a phone nothing else writes into the vault.
import { useEffect, useRef } from 'react';
import type { VaultMeta } from '../../types';
import { storage } from '../../lib/storage';
import { canWatchVault, startVaultWatch, type VaultWatch } from '../../lib/storage/vaultWatch';
import { isPrimaryWindow } from '../../lib/platform/windowControls';
import { pluralRu } from '../../lib/time/dateUtils';
import { logger } from '../../lib/logger/logger';

const watchLog = logger.scope('FS');

type Toast = (text: string, type?: 'info' | 'success' | 'error') => void;

export interface UseVaultWatchOptions {
  vault: VaultMeta;
  addToast: Toast;
}

/**
 * One sweep loop per open vault, owned by the provider. It is started by the primary window only:
 * the quick composer mounts the same provider, and two loops would read every note twice.
 */
export function useVaultWatch({ vault, addToast }: UseVaultWatchOptions): void {
  // The toast outlives a re-render; keeping it in a ref keeps the watch from restarting on it.
  const toastRef = useRef(addToast);
  useEffect(() => {
    toastRef.current = addToast;
  }, [addToast]);

  // The effect follows the vault id, not the object: `refreshData` hands back a fresh copy of the
  // same vault on every reload, and restarting the sweep for that would stash a loop per render.
  const vaultId = vault.id;

  useEffect(() => {
    if (!canWatchVault() || !isPrimaryWindow()) return;

    let watch: VaultWatch | null = null;
    let cancelled = false;

    const unsubscribe = storage.subscribeChanges((event) => {
      if (event.kind !== 'item' || event.action !== 'conflict') return;
      toastRef.current(`«${event.payload?.title || 'заметка'}» изменена снаружи — показала версию с диска`, 'info');
    });

    void startVaultWatch({
      notesPath: storage.getVaultNotesPath(),
      onChanged: (change) => {
        if (cancelled) return;
        // Folders travel with the same call: the sweep is the only thing that sees a directory
        // the MCP server made, and a reload without them would leave the sidebar stale.
        void storage
          .reloadFromDisk(change)
          .then(({ removed }) => {
            if (cancelled || removed === 0) return;
            // Updates land silently: an outside editor saves on every keystroke, and a toast per
            // save would be noise. A note that disappeared under the person is worth saying out
            // loud, and so is a save the disk refused.
            toastRef.current(`${removed} ${pluralRu(removed, ['заметка удалена', 'заметки удалены', 'заметок удалено'])} снаружи`, 'info');
          })
          .catch((error: unknown) => {
            watchLog.warn('reload of external notes failed', { error: String(error) });
          });
      },
    }).then(started => {
      if (cancelled) {
        started.stop();
        return;
      }
      watch = started;
      if (document.visibilityState === 'hidden') started.pause();
    }).catch((error: unknown) => {
      watchLog.warn('vault watch failed to start', { error: String(error) });
    });

    // A hidden window has nothing to redraw and the sweep is pure disk io: pause until it is back.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') watch?.pause();
      else watch?.resume();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribe();
      watch?.stop();
    };
  }, [vaultId]);
}
