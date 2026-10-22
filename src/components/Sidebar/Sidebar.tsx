import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FolderTree } from './FolderTree';
import {
  Search,
  Inbox,
  FolderPlus,
  Settings,
  Database,
  ChevronDown,
  Check,
  PlusCircle,
  FolderSync
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    vault,
    vaults,
    currentFolder,
    setCurrentFolder,
    items,
    setIsSearchOpen,
    setIsSettingsOpen,
    openCreateFolderModal,
    switchVault,
    createVault,
    addToast
  } = useApp();

  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');
  const [isCreatingVault, setIsCreatingVault] = useState(false);

  const inboxItemsCount = items.filter(i => i.folder === 'Входящие').length;

  const handleOpenLocalDirectory = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        createVault(dirHandle.name || 'Локальный Vault');
        addToast(`Папка «${dirHandle.name}» подключена как Vault`, 'success');
        setIsVaultDropdownOpen(false);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          addToast('Не удалось открыть папку', 'error');
        }
      }
    } else {
      addToast('File System Access API не поддерживается вашим браузером. Используется локальное хранилище.', 'info');
    }
  };

  const handleCreateNewVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVaultName.trim()) return;
    createVault(newVaultName.trim());
    setNewVaultName('');
    setIsCreatingVault(false);
    setIsVaultDropdownOpen(false);
  };

  return (
    <aside
      className="w-full h-full flex flex-col bg-[#0c0c0e] select-none text-[#a1a1aa] overflow-hidden"
    >
      {/* Top Header / App Title */}
      <div className="h-12 px-3.5 flex items-center justify-between border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-white/[0.08] flex items-center justify-center font-mono font-bold text-xs text-zinc-100">
            S
          </div>
          <span className="font-semibold tracking-tight text-xs text-zinc-200">SLAG</span>
          <span className="text-[10px] text-zinc-500 font-mono">v2.0</span>
        </div>

        {/* Global Quick Search Button */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
          title="Поиск (Ctrl+K / Cmd+K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-[10px] font-mono text-zinc-500">⌘K</span>
        </button>
      </div>

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
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/10 text-zinc-200">
                {inboxItemsCount}
              </span>
            )}
          </button>
        </div>

        {/* Folders Section Header */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-medium text-zinc-500 tracking-wider uppercase">
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
      <div className="p-2 border-t border-white/[0.06] flex items-center justify-between gap-1 relative bg-[#0c0c0e]">
        {/* Vault Switcher Trigger */}
        <div className="relative flex-1 min-w-0">
          <button
            onClick={() => setIsVaultDropdownOpen(!isVaultDropdownOpen)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors truncate"
          >
            <div className="flex items-center gap-2 truncate">
              <Database className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span className="truncate text-xs">{vault.name}</span>
            </div>
            <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0 ml-1" />
          </button>

          {/* Vault Switcher Dropdown */}
          {isVaultDropdownOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-60 rounded-lg bg-[#18181b] border border-white/[0.08] shadow-2xl p-1.5 z-40 flex flex-col gap-1 text-xs animate-in fade-in duration-100">
              <div className="px-2 py-1 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                Хранилища (Vaults)
              </div>

              {vaults.map(v => (
                <button
                  key={v.id}
                  onClick={() => {
                    switchVault(v.id);
                    setIsVaultDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${
                    v.id === vault.id
                      ? 'bg-white/[0.08] text-white font-medium'
                      : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <span className="truncate">{v.name}</span>
                  {v.id === vault.id && <Check className="w-3.5 h-3.5 text-zinc-200 shrink-0" />}
                </button>
              ))}

              <div className="my-1 border-t border-white/[0.06]" />

              {/* Open local folder option */}
              <button
                onClick={handleOpenLocalDirectory}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors"
              >
                <FolderSync className="w-3.5 h-3.5 text-zinc-400" />
                <span>Открыть папку на диске...</span>
              </button>

              {/* Create new vault inline */}
              {isCreatingVault ? (
                <form onSubmit={handleCreateNewVault} className="flex gap-1 p-1">
                  <input
                    type="text"
                    value={newVaultName}
                    onChange={(e) => setNewVaultName(e.target.value)}
                    placeholder="Название нового Vault..."
                    autoFocus
                    className="flex-1 bg-black/40 border border-white/[0.08] rounded px-2 py-1 text-xs text-white placeholder-zinc-500"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-medium"
                  >
                    OK
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setIsCreatingVault(true)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Создать новое хранилище</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Settings button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors shrink-0"
          title="Настройки (ИИ, экспорт, тема)"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
