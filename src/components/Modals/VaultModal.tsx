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
      icon={<Database className="w-5 h-5 text-zinc-400" />}
      maxWidth="max-w-md"
      footer={footer}
    >
      <form id="vault-create-form" onSubmit={handleCreate} className="space-y-4">
        {/* Storage Type Selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setStorageType('indexeddb')}
            className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[82px] ${
              storageType === 'indexeddb'
                ? 'bg-white/[0.08] border-white/20 text-white'
                : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-zinc-300" />
                <span className="text-xs font-medium text-zinc-100">Локальное</span>
              </div>
              {storageType === 'indexeddb' && <Check className="w-3.5 h-3.5 text-zinc-200" />}
            </div>
            <p className="text-[11px] text-zinc-400 leading-tight">
              Внутри приложения (IndexedDB)
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setStorageType('disk');
              if (!diskPath) {
                void handlePickFolder();
              }
            }}
            className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[82px] ${
              storageType === 'disk'
                ? 'bg-white/[0.08] border-white/20 text-white'
                : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <FolderSync className="w-4 h-4 text-zinc-300" />
                <span className="text-xs font-medium text-zinc-100">Папка на диске</span>
              </div>
              {storageType === 'disk' && <Check className="w-3.5 h-3.5 text-zinc-200" />}
            </div>
            <p className="text-[11px] text-zinc-400 leading-tight">
              Файлы .md в выбранной папке
            </p>
          </button>
        </div>

        {/* Disk Folder Picker Section */}
        {storageType === 'disk' && (
          <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.08] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FolderSync className="w-4 h-4 text-zinc-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs text-zinc-200 truncate">
                  {diskPath || 'Папка не выбрана'}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {diskPath ? 'Путь к хранилищу' : 'Необходимо указать директорию'}
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPicking}
              onClick={handlePickFolder}
            >
              {diskPath ? 'Изменить' : 'Выбрать'}
            </Button>
          </div>
        )}

        {/* Vault Name Input */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Название хранилища
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="например, work или notes"
            autoFocus
            className="w-full bg-[#18181b] border border-white/[0.08] rounded-md px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-white/20 focus:outline-none transition-colors"
          />
        </div>
      </form>
    </BaseModal>
  );
};
