import React, { useState } from 'react';
import { usePresence } from '../../hooks/ui/usePresence';
import { useApp } from '../../context/AppContext';
import { BaseModal } from './BaseModal';
import { Button } from '../UI/Button';
import { Database, FolderSync, HardDrive, Check, Trash2, Sparkles } from 'lucide-react';
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
      icon={<Database className="w-4 h-4 text-zinc-300" />}
      maxWidth="max-w-md"
      footer={footer}
    >
      <div className="p-5 flex flex-col gap-4">
        {/* Existing Vaults Section */}
        {vaults.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
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
                        ? 'bg-white/[0.08] border-white/20 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] text-zinc-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center shrink-0">
                        {v.mode === 'tauri' || v.mode === 'fsa' || v.path ? (
                          <FolderSync className="w-3.5 h-3.5 text-zinc-400" />
                        ) : (
                          <Database className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{getVaultDisplayName(v, vaults)}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                              активно
                            </span>
                          )}
                        </div>
                        {v.path && (
                          <span className="text-[10px] text-zinc-500 font-mono truncate">{v.path}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => switchVault(v.id)}
                          className="px-2 py-1 rounded-md text-[11px] bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 transition-colors cursor-pointer"
                        >
                          Переключить
                        </button>
                      )}
                      {v.id !== 'default_vault' && (
                        <button
                          type="button"
                          onClick={() => deleteVault(v.id)}
                          title="Удалить хранилище"
                          className="p-1.5 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form id="vault-create-form" onSubmit={handleCreate} className="flex flex-col gap-4 pt-2 border-t border-white/[0.06]">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Создать новое хранилище
          </div>
        {/* Storage Type Selector */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setStorageType('indexeddb')}
            className={`p-3.5 rounded-xl border text-left motion-surface cursor-pointer flex flex-col justify-between min-h-[86px] ${
              storageType === 'indexeddb'
                ? 'bg-white/[0.08] border-white/20 text-white shadow-sm'
                : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <HardDrive className={`w-4 h-4 ${storageType === 'indexeddb' ? 'text-zinc-100' : 'text-zinc-400'}`} />
                <span className="text-xs font-medium text-zinc-100">Локальное</span>
              </div>
              {storageType === 'indexeddb' && <Check className="w-3.5 h-3.5 text-zinc-200" />}
            </div>
            <p className="text-[11px] text-zinc-400 leading-normal mt-2">
              Внутри приложения (IndexedDB)
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStorageType('disk')}
            className={`p-3.5 rounded-xl border text-left motion-surface cursor-pointer flex flex-col justify-between min-h-[86px] ${
              storageType === 'disk'
                ? 'bg-white/[0.08] border-white/20 text-white shadow-sm'
                : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <FolderSync className={`w-4 h-4 ${storageType === 'disk' ? 'text-zinc-100' : 'text-zinc-400'}`} />
                <span className="text-xs font-medium text-zinc-100">Папка на диске</span>
              </div>
              {storageType === 'disk' && <Check className="w-3.5 h-3.5 text-zinc-200" />}
            </div>
            <p className="text-[11px] text-zinc-400 leading-normal mt-2">
              Файлы .md в выбранной папке
            </p>
          </button>
        </div>

        {/* Disk Folder Picker Section */}
        {storageType === 'disk' && (
          <div
            onClick={!diskPath ? handlePickFolder : undefined}
            className={`p-3 rounded-xl bg-black/30 border border-white/[0.08] flex items-center justify-between gap-3 motion-fade ${
              !diskPath ? 'cursor-pointer hover:border-white/20 hover:bg-black/40 transition-colors' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/[0.06] flex items-center justify-center shrink-0">
                <FolderSync className="w-4 h-4 text-zinc-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-zinc-200 truncate">
                  {diskPath || 'Папка не выбрана'}
                </div>
                <div className="text-[10px] text-zinc-500 truncate">
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
          <label className="text-xs font-medium text-zinc-400">
            Название хранилища
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="например, work или notes"
            autoFocus
            className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-white/20 focus:outline-none transition-colors"
          />
          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-0.5 select-none">
            <Sparkles className="w-3 h-3 text-amber-400/80 shrink-0" />
            <span>В новом хранилище будут созданы только системные папки</span>
          </p>
        </div>
      </form>
    </div>
  </BaseModal>
  );
};
