import { useState } from 'react';
import { storage } from '../../lib/storage';
import type { VaultRecoverySnapshot } from '../../lib/storage/vaultFiles';
import { isDesktopApp, startDraggingWindow } from '../../lib/platform/windowControls';
import { WindowControls } from '../UI/WindowControls';

/** Disk copies are never fed into the normal workspace or sync until the journal is verified. */
export function VaultRecoveryView({ snapshot }: { snapshot: VaultRecoverySnapshot }) {
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<string>();
  const vault = storage.getCurrentVault();
  const otherVaults = storage.getVaults().filter(({ id }) => id !== vault.id);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const items = snapshot.items.filter(({ title, folder, filename }) =>
    !normalizedQuery || [title, folder, filename].some(text => text?.toLocaleLowerCase().includes(normalizedQuery)));
  const actionClass = 'min-h-12 rounded-md border border-hover px-4 text-sm font-medium hover:bg-surface-hover active:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2';

  return (
    <main data-testid="vault-recovery" className="h-dvh overflow-y-auto bg-canvas text-fg-primary">
      {isDesktopApp() && (
        <>
          <div aria-hidden="true" className="h-[34px] border-b border-subtle" onPointerDown={event => { if (event.button === 0) void startDraggingWindow(); }} />
          <WindowControls />
        </>
      )}
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-[max(1.5rem,var(--sat))] pb-[max(1.5rem,var(--sab))] sm:px-8">
        <header className="flex flex-col gap-2" role="alert">
          <p className="text-sm text-fg-secondary">Хранилище «{vault.name}» · Только чтение</p>
          <h1 className="text-xl font-semibold">Повреждено состояние хранилища</h1>
          <p className="text-sm leading-relaxed text-fg-secondary">
            Синхронизация приостановлена. SLAG показывает локальные файлы и не меняет их. Могут быть видны обе копии заметки, если её перенос прервался.
          </p>
        </header>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={actionClass} disabled={snapshot.loading} onClick={() => void storage.syncCurrentVaultFs()}>
            Проверить снова
          </button>
          {otherVaults.length > 0 && (
            <label className="flex flex-col gap-1 text-sm text-fg-secondary">
              Открыть другое хранилище
              <select className={`${actionClass} bg-surface text-fg-primary`} value="" onChange={event => storage.switchVault(event.target.value)}>
                <option value="" disabled>Выбрать…</option>
                {otherVaults.map(other => <option key={other.id} value={other.id}>{other.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {snapshot.loading ? (
          <p role="status" className="text-sm text-fg-secondary">Читаем заметки с диска…</p>
        ) : (
          <section aria-label="Локальные заметки" className="flex flex-col gap-3">
            {snapshot.error && <p role="status" className="text-sm text-fg-secondary">Не все файлы удалось прочитать. Ниже — доступные заметки.</p>}
            <p data-testid="vault-recovery-count" className="text-sm text-fg-secondary">Найдено файлов заметок: {snapshot.items.length}</p>
            {snapshot.items.length > 0 && (
              <label className="flex flex-col gap-1 text-sm text-fg-secondary">
                Поиск по названию или папке
                <input className={`${actionClass} bg-surface text-fg-primary`} type="search" value={query} onChange={event => setQuery(event.target.value)} />
              </label>
            )}
            <ul className="divide-y divide-subtle border-y border-subtle">
              {items.map((item, index) => {
                const path = `${item.folder}/${item.filename ?? item.id}`;
                const id = `vault-recovery-note-${index}`;
                const expanded = opened === path;
                return (
                  <li key={path}>
                    <button type="button" data-testid="vault-recovery-note" className="flex min-h-12 w-full flex-col justify-center gap-0.5 rounded-md px-2 py-1 text-left hover:bg-surface-hover active:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2" aria-expanded={expanded} aria-controls={expanded ? id : undefined} onClick={() => setOpened(expanded ? undefined : path)}>
                      <span className="w-full wrap-anywhere text-sm font-medium">{item.title || item.filename || 'Без названия'}</span>
                      <span className="w-full wrap-anywhere text-xs text-fg-secondary">{item.folder || 'Корень хранилища'}</span>
                    </button>
                    {expanded && <pre id={id} data-testid="vault-recovery-content" className="select-text px-2 py-3 text-sm whitespace-pre-wrap wrap-anywhere">{item.content || 'Нет текста'}</pre>}
                  </li>
                );
              })}
            </ul>
            {snapshot.items.length > 0 && items.length === 0 && <p className="text-sm text-fg-secondary">Ничего не найдено по этому запросу</p>}
          </section>
        )}
      </div>
    </main>
  );
}
