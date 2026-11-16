// The vault switcher: choose a store, create one on a backend, or delete one.
import React, { useState } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import { BaseModal } from './BaseModal';
import { Button } from '../UI/Button';
import { Icon } from '../UI/icons/Icon';
import { getVaultDisplayName } from '../../lib/vault/vaultDisplay';

export const VaultModal: React.FC = () => {
  const {
    vault,
    vaults,
    switchVault,
    deleteVault,
    isVaultModalOpen,
    closeVaultModal,
    createVault,
    pickVaultDirectory,
    addToast,
  } = useApp();

  const [name, setName] = useState('');
  const [storageType, setStorageType] = useState<'indexeddb' | 'disk'>('indexeddb');
  const [diskPath, setDiskPath] = useState<string | null>(null);
  const [diskMode, setDiskMode] = useState<'tauri' | 'fsa'>('indexeddb' as any);
  const [isPicking, setIsPicking] = useState(false);

  const presence = usePresence(isVaultModalOpen);
  if (!presence.isPresent) return null;

  const handlePickFolder = async () => {
    setIsPicking(true);
    try {
      const result = await pickVaultDirectory();
      if (result) {
        if (!name.trim()) {
          setName(result.name);
        }
        setDiskPath(result.path || result.name);
        setDiskMode(result.mode);
      }
    } catch {
      addToast('Не удалось открыть папку', 'error');
    } finally {
      setIsPicking(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (storageType === 'disk') {
      createVault(trimmedName, diskMode || 'indexeddb', diskPath || undefined);
    } else {
      createVault(trimmedName, 'indexeddb');
    }

    setName('');
    setDiskPath(null);
    setStorageType('indexeddb');
    closeVaultModal();
  };

  const isSubmitDisabled = !name.trim() || (storageType === 'disk' && !diskPath);

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setName('');
          setDiskPath(null);
          closeVaultModal();
        }}
      >
        Отмена
      </Button>
      <Button
        type="submit"
        form="vault-create-form"
        variant="primary"
        size="sm"
        disabled={isSubmitDisabled}
      >
        Создать хранилище
      </Button>
    </div>
  );

  return (
    <BaseModal
      presence={presence}
      isOpen={isVaultModalOpen}
      onClose={closeVaultModal}
      title="Новое хранилище"
      subtitle="Выберите тип и параметры хранения ваших заметок"
      icon={<Icon name="entity.vault" size="md" tone="tertiary" />}
      maxWidth="max-w-md"
      footer={footer}
    >
      <div className="p-5 flex flex-col gap-4">
        {/* Existing Vaults Section */}
        {vaults.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-2xs font-semibold text-fg-secondary uppercase tracking-wider">
              Ваши хранилища ({vaults.length})
            </div>
            <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-0.5 scrollbar-thin">
              {vaults.map((v) => {
                const isCurrent = v.id === vault.id;
                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-colors ${
                      isCurrent
                        ? 'bg-tint-8 border-tint-20 text-white'
                        : 'bg-tint-2 border-tint-6 text-fg-tertiary hover:bg-tint-4'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-tint-5 flex items-center justify-center shrink-0">
                        {v.mode === 'tauri' || v.mode === 'fsa' || v.path ? (
                          <Icon name="entity.folderSynced" size="sm" />
                        ) : (
                          <Icon name="entity.vault" size="sm" />
                        )}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{getVaultDisplayName(v, vaults)}</span>
                          {isCurrent && (
                            <span className="text-3xs px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                              активно
                            </span>
                          )}
                        </div>
                        {v.path && (
                          <span className="text-3xs text-fg-muted font-mono truncate">{v.path}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => switchVault(v.id)}
                          className="px-2 py-1 rounded-md text-2xs bg-tint-6 hover:bg-tint-12 text-fg-soft transition-colors cursor-pointer"
                        >
                          Переключить
                        </button>
                      )}
                      {v.id !== 'default_vault' && (
                        <button
                          type="button"
                          onClick={() => deleteVault(v.id)}
                          title="Удалить хранилище"
                          className="p-1.5 rounded-md text-fg-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Icon name="action.delete" size="sm" tone="inherit" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form id="vault-create-form" onSubmit={handleCreate} className="flex flex-col gap-4 pt-2 border-t border-tint-6">
          <div className="text-2xs font-semibold text-fg-secondary uppercase tracking-wider">
            Создать новое хранилище
          </div>
        {/* Storage Type Selector */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setStorageType('indexeddb')}
            className={`p-3.5 rounded-xl border text-left motion-surface cursor-pointer flex flex-col justify-between min-h-[86px] ${
              storageType === 'indexeddb'
                ? 'bg-tint-8 border-tint-20 text-white shadow-sm'
                : 'bg-tint-2 border-tint-6 text-fg-secondary hover:text-fg-soft hover:bg-tint-4'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Icon name="entity.disk" size="md" tone="inherit" className={`${storageType === 'indexeddb' ? 'text-fg-primary' : 'text-fg-secondary'}`} />
                <span className="text-xs font-medium text-fg-primary">Локальное</span>
              </div>
              {storageType === 'indexeddb' && <Icon name="action.check" size="sm" tone="soft" />}
            </div>
            <p className="text-2xs text-fg-secondary leading-normal mt-2">
              Внутри приложения (IndexedDB)
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStorageType('disk')}
            className={`p-3.5 rounded-xl border text-left motion-surface cursor-pointer flex flex-col justify-between min-h-[86px] ${
              storageType === 'disk'
                ? 'bg-tint-8 border-tint-20 text-white shadow-sm'
                : 'bg-tint-2 border-tint-6 text-fg-secondary hover:text-fg-soft hover:bg-tint-4'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Icon name="entity.folderSynced" size="md" tone="inherit" className={`${storageType === 'disk' ? 'text-fg-primary' : 'text-fg-secondary'}`} />
                <span className="text-xs font-medium text-fg-primary">Папка на диске</span>
              </div>
              {storageType === 'disk' && <Icon name="action.check" size="sm" tone="soft" />}
            </div>
            <p className="text-2xs text-fg-secondary leading-normal mt-2">
              Файлы .md в выбранной папке
            </p>
          </button>
        </div>

        {/* Disk Folder Picker Section */}
        {storageType === 'disk' && (
          <div
            onClick={!diskPath ? handlePickFolder : undefined}
            className={`p-3 rounded-xl bg-scrim-30 border border-tint-8 flex items-center justify-between gap-3 motion-fade ${
              !diskPath ? 'cursor-pointer hover:border-tint-20 hover:bg-scrim-40 transition-colors' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-tint-5 border border-tint-6 flex items-center justify-center shrink-0">
                <Icon name="entity.folderSynced" size="md" tone="tertiary" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-fg-soft truncate">
                  {diskPath || 'Папка не выбрана'}
                </div>
                <div className="text-3xs text-fg-muted truncate">
                  {diskPath ? 'Путь к хранилищу' : 'Укажите папку на диске для файлов .md'}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant={diskPath ? 'secondary' : 'primary'}
              size="sm"
              disabled={isPicking}
              onClick={(e) => {
                e.stopPropagation();
                void handlePickFolder();
              }}
            >
              {diskPath ? 'Изменить' : 'Выбрать'}
            </Button>
          </div>
        )}

        {/* Vault Name Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-fg-secondary">
            Название хранилища
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="например, work или notes"
            autoFocus
            className="w-full bg-scrim-40 border border-tint-8 rounded-lg px-3 py-2 text-xs text-white placeholder-fg-muted focus:border-tint-20 focus:outline-none transition-colors"
          />
          <p className="text-2xs text-fg-muted flex items-center gap-1.5 mt-0.5 select-none">
            <Icon name="system.ai" size="sm" tone="inherit" className="text-amber-400/80 shrink-0" />
            <span>В новом хранилище будут созданы только системные папки</span>
          </p>
        </div>
      </form>
    </div>
  </BaseModal>
  );
};
