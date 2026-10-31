import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FolderTree } from './FolderTree';
import {
  Inbox,
  FolderPlus,
  Settings,
  Database,
  ChevronDown,
  Check,
  PlusCircle,
  FolderSync,
  FolderOpen,
  Terminal,
  Trash2,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    vault,
    vaults,
    currentFolder,
    setCurrentFolder,
    items,
    setIsSettingsOpen,
    setIsLogViewerOpen,
    openCreateFolderModal,
    switchVault,
    createVault,
    deleteVault,
    openVaultModal,
    pickVaultDirectory,
    revealVaultInExplorer,
    addToast
  } = useApp();

  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVaultDropdownOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (bottomBarRef.current && !bottomBarRef.current.contains(e.target as Node)) {
        setIsVaultDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsVaultDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVaultDropdownOpen]);

  const inboxItemsCount = items.filter(i => i.folder === 'Входящие').length;

  const handleOpenLocalDirectory = async () => {
    try {
      const res = await pickVaultDirectory();
      if (res) {
        createVault(res.name, res.mode, res.path);
        setIsVaultDropdownOpen(false);
      }
    } catch {
      addToast('Не удалось открыть папку', 'error');
    }
  };

  const handleRevealNotesInExplorer = async () => {
    await revealVaultInExplorer();
    setIsVaultDropdownOpen(false);
  };

  return (
    <aside
      className="w-full h-full flex flex-col bg-panel select-none text-fg-secondary overflow-hidden"
    >
      {/* Main Folder Navigation */}
      <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-3">
        {/* Pinned "Входящие" (Inbox) */}
        <div>
          <button
            onClick={() => setCurrentFolder('Входящие')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
              currentFolder === 'Входящие'
                ? 'bg-white/[0.08] text-white font-medium'
                : 'text-zinc-300 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-zinc-300" />
              <span>Входящие</span>
            </div>
            {inboxItemsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-2xs font-mono bg-white/10 text-zinc-200">
                {inboxItemsCount}
              </span>
            )}
          </button>
        </div>

        {/* Folders Section Header */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-2.5 py-1 text-2xs font-mono font-medium text-zinc-500 tracking-wider uppercase">
            <span>Папки</span>
            <button
              onClick={() => openCreateFolderModal()}
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
              title="Создать папку"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nested Folder Tree */}
          <FolderTree />
        </div>
      </div>

      {/* Bottom Vault Switcher & Settings */}
      <div
        ref={bottomBarRef}
        className="p-2 border-t border-white/[0.06] flex items-center justify-between gap-1 relative bg-panel"
      >
        {/* Vault Switcher Trigger */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setIsVaultDropdownOpen(!isVaultDropdownOpen)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors truncate"
          >
            <div className="flex items-center gap-2 truncate">
              <Database className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate text-xs font-medium">{vault.name}</span>
            </div>
            <ChevronDown
              className={`w-3 h-3 text-zinc-500 shrink-0 ml-1 transition-transform duration-150 ${
                isVaultDropdownOpen ? 'rotate-180 text-zinc-300' : ''
              }`}
            />
          </button>
        </div>

        {/* Vault Switcher Dropdown */}
        {isVaultDropdownOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1.5 rounded-xl bg-surface-elevated border border-white/[0.08] shadow-2xl p-1.5 z-40 flex flex-col gap-0.5 text-xs animate-in fade-in duration-100">
            <div className="px-2.5 py-1 text-2xs font-mono font-medium text-zinc-500 uppercase tracking-wider">
              Хранилища (Vaults)
            </div>

            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {vaults.map((v) => {
                const isCurrent = v.id === vault.id;
                return (
                  <div
                    key={v.id}
                    className={`group/v flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                      isCurrent
                        ? 'bg-white/[0.08] text-white font-medium'
                        : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    <button
                      onClick={() => {
                        switchVault(v.id);
                        setIsVaultDropdownOpen(false);
                      }}
                      className="flex-1 min-w-0 text-left cursor-pointer flex flex-col"
                    >
                      <span className="truncate">{v.name}</span>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteVault(v.id);
                          }}
                          title="Удалить хранилище"
                          className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-white/[0.08] transition-colors cursor-pointer"
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

            {/* Create new vault option */}
            <button
              onClick={() => {
                setIsVaultDropdownOpen(false);
                openVaultModal();
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer w-full text-left"
            >
              <PlusCircle className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">Создать новое хранилище...</span>
            </button>

            {/* Open local folder option */}
            <button
              onClick={handleOpenLocalDirectory}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer w-full text-left"
            >
              <FolderSync className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">Подключить папку на диске...</span>
            </button>

            {/* Reveal notes folder in OS explorer */}
            <button
              onClick={handleRevealNotesInExplorer}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer w-full text-left"
            >
              <FolderOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">Показать заметки в Проводнике</span>
            </button>
          </div>
        )}

        {/* Logs HUD button */}
        <button
          onClick={() => setIsLogViewerOpen(true)}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors shrink-0"
          title="Системные логи & HUD (Ctrl + `)"
          data-testid="sidebar-logs-btn"
        >
          <Terminal className="w-4 h-4" />
        </button>

        {/* Settings button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer"
          title="Настройки (ИИ, экспорт, тема)"
          data-testid="sidebar-settings-btn"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
