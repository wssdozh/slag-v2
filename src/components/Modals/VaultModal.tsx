import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BaseModal } from './BaseModal';
import { Button } from '../UI/Button';
import { Database, FolderSync, HardDrive, Check } from 'lucide-react';

export const VaultModal: React.FC = () => {
  const {
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

  if (!isVaultModalOpen) return null;

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
      isOpen={isVaultModalOpen}
      onClose={closeVaultModal}
      title="Новое хранилище"
      subtitle="Выберите тип и параметры хранения ваших заметок"
      icon={<Database className="w-4 h-4 text-zinc-300" />}
      maxWidth="max-w-md"
      footer={footer}
    >
      <form id="vault-create-form" onSubmit={handleCreate} className="p-5 flex flex-col gap-4">
        {/* Storage Type Selector */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setStorageType('indexeddb')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[86px] ${
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
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[86px] ${
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
            className={`p-3 rounded-xl bg-black/30 border border-white/[0.08] flex items-center justify-between gap-3 animate-in fade-in duration-150 ${
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
        </div>
      </form>
    </BaseModal>
  );
};
