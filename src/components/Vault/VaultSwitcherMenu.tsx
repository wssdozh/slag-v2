import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { isDesktopApp } from '../../lib/windowControls';
import { getVaultDisplayName } from '../../lib/vaultDisplay';
import {
  Check,
  Trash2,
  PlusCircle,
  FolderSync,
  FolderOpen,
} from 'lucide-react';

export interface VaultSwitcherMenuProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: 'dropdown' | 'sheet';
  position?: 'top' | 'bottom';
  className?: string;
}

export const VaultSwitcherMenu: React.FC<VaultSwitcherMenuProps> = ({
  isOpen,
  onClose,
  variant = 'dropdown',
  position = 'top',
  className = '',
}) => {
  const {
    vault,
    vaults,
    switchVault,
    deleteVault,
    openVaultModal,
    pickVaultDirectory,
    createVault,
    revealVaultInExplorer,
    addToast,
  } = useApp();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSwitch = (id: string) => {
    switchVault(id);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteVault(id);
  };

  const handleCreate = () => {
    onClose();
    openVaultModal();
  };

  const handlePickFolder = async () => {
    try {
      const res = await pickVaultDirectory();
      if (res) {
        createVault(res.name, res.mode, res.path);
        onClose();
      }
    } catch {
      addToast('Не удалось открыть папку', 'error');
    }
  };

  const handleReveal = async () => {
    await revealVaultInExplorer();
    onClose();
  };

  const isSheet = variant === 'sheet';

  const menuContent = (
    <>
      <div className="px-2.5 py-1 text-2xs font-mono font-medium text-zinc-500 uppercase tracking-wider">
        Хранилища (Vaults)
      </div>

      <div className="max-h-52 overflow-y-auto space-y-0.5">
        {vaults.map((v) => {
          const isCurrent = v.id === vault.id;
          return (
            <div
              key={v.id}
              className={`group/v flex items-center justify-between px-2.5 ${
                isSheet ? 'py-2' : 'py-1.5'
              } rounded-lg text-left transition-colors ${
                isCurrent
                  ? 'bg-white/[0.08] text-white font-medium'
                  : 'text-zinc-300 hover:bg-white/[0.04] active:bg-white/[0.08] hover:text-white'
              }`}
            >
              <button
                type="button"
                onClick={() => handleSwitch(v.id)}
                className="flex-1 min-w-0 text-left cursor-pointer flex flex-col"
              >
                <span className="truncate">{getVaultDisplayName(v, vaults)}</span>
                {v.path && (
                  <span className="text-2xs text-zinc-500 truncate font-mono">
                    {v.path}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {isCurrent && <Check className="w-3.5 h-3.5 text-zinc-200" />}
                {v.id !== 'default_vault' && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, v.id)}
                    title="Удалить хранилище"
                    className="p-1 rounded text-zinc-500 hover:text-rose-400 active:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="my-1 border-t border-white/[0.06]" />

      {/* Create new vault */}
      <button
        type="button"
        onClick={handleCreate}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.06] active:bg-white/[0.08] hover:text-white transition-colors cursor-pointer w-full text-left"
      >
        <PlusCircle className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="truncate">Создать новое хранилище...</span>
      </button>

      {/* Open local folder */}
      <button
        type="button"
        onClick={handlePickFolder}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.06] active:bg-white/[0.08] hover:text-white transition-colors cursor-pointer w-full text-left"
      >
        <FolderSync className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className="truncate">Подключить папку на диске...</span>
      </button>

      {/* Reveal notes in OS explorer (Desktop only) */}
      {isDesktopApp() && (
        <button
          type="button"
          onClick={handleReveal}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.06] active:bg-white/[0.08] hover:text-white transition-colors cursor-pointer w-full text-left"
        >
          <FolderOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span className="truncate">Показать заметки в Проводнике</span>
        </button>
      )}
    </>
  );

  if (isSheet) {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 animate-in fade-in duration-150 select-none"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`w-full sm:max-w-sm bg-surface-elevated border-t sm:border border-white/[0.08] rounded-t-2xl sm:rounded-2xl p-3 flex flex-col gap-1 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs shadow-2xl ${className}`}
          style={{ paddingBottom: 'max(var(--sab), 0.75rem)' }}
        >
          <div className="w-8 h-1 bg-white/20 rounded-full mx-auto shrink-0 mb-1.5 sm:hidden" />
          {menuContent}
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute z-50 rounded-xl bg-surface-elevated border border-white/[0.08] shadow-2xl p-1.5 flex flex-col gap-0.5 text-xs animate-in fade-in zoom-in-95 duration-100 ${
          position === 'bottom'
            ? 'bottom-full left-2 right-2 mb-1.5'
            : 'top-full left-0 mt-2 w-72 sm:w-80'
        } ${className}`}
      >
        {menuContent}
      </div>
    </>
  );
};
