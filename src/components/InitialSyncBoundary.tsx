// Holds the shell until the first sync settles, so nobody is shown half a vault.
import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../context/AppContext';
import { syncEngine } from '../lib/sync/syncEngine';

export function InitialSyncBoundary({ children }: { children: ReactNode }) {
  const { vault, openVaultModal, addToast } = useApp();
  const [status, setStatus] = useState(() => syncEngine.getStatus());
  const [retrying, setRetrying] = useState(false);
  useEffect(() => syncEngine.subscribe(setStatus), []);

  const initial = status.initialSync;
  if (initial.vaultId !== vault.id) return children;

  const warning = initial.rejected > 0 && (
    <p role="alert" className="px-4 py-2 text-sm text-amber-400">
      отклонено пакетов: {initial.rejected}. часть данных не загружена.
    </p>
  );

  if (initial.state !== 'loading' && initial.state !== 'error') {
    return warning ? <div className="flex h-full w-full flex-col">{warning}<div className="min-h-0 flex-1">{children}</div></div> : children;
  }

  const retry = async () => {
    setRetrying(true);
    try {
      await syncEngine.retryInitialSync();
    } catch {
      addToast('не удалось загрузить хранилище. попробуйте ещё раз.', 'error');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-4 bg-canvas-subtle px-6 text-center text-fg-primary" aria-busy={initial.state === 'loading'}>
      <div role="status" aria-live="polite">
        <h1 className="text-lg font-medium">{initial.state === 'loading' ? 'загружаем хранилище…' : 'не удалось загрузить хранилище'}</h1>
        <p className="mt-2 text-sm text-fg-secondary">обработано пакетов: {initial.processed}</p>
      </div>
      {warning}
      <div className="flex flex-wrap justify-center gap-3">
        {initial.state === 'error' && (
          <button onClick={() => void retry()} disabled={retrying} className="min-h-11 rounded-lg bg-tint-10 px-4 text-sm outline-none ring-0 hover:bg-tint-15 disabled:opacity-50">
            {retrying ? 'повторяем…' : 'повторить загрузку'}
          </button>
        )}
        <button onClick={openVaultModal} className="min-h-11 rounded-lg px-4 text-sm text-fg-secondary outline-none ring-0 hover:bg-tint-5 hover:text-fg-primary">
          сменить хранилище
        </button>
      </div>
    </main>
  );
}
