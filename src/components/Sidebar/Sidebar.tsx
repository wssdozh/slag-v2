// Left rail: vault switcher, folder tree, inbox, sync state and settings shortcuts.
import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FolderTree } from './FolderTree';
import { syncEngine } from '../../lib/sync/syncEngine';
import { getVaultDisplayName } from '../../lib/vault/vaultDisplay';
import { VaultSwitcherMenu } from '../Vault/VaultSwitcherMenu';
import type { SyncStatus } from '../../lib/sync/types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import {
  Inbox,
  FolderPlus,
  Settings,
  Database,
  ChevronDown,
  Terminal,
  RefreshCw,
  ArrowDownToLine,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    vault,
    vaults,
    currentFolder,
    setCurrentFolder,
    items,
    setIsSettingsOpen,
    openSettingsModal,
    setIsLogViewerOpen,
    openCreateFolderModal,
    appUpdate,
  } = useApp();

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => syncEngine.getStatus());
  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false);
  const bottomBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return syncEngine.subscribe(setSyncStatus);
  }, []);

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

  const inboxItemsCount = items.filter(i => i.folder === DEFAULT_INBOX_FOLDER).length;

  return (
    <aside
      className="w-full h-full flex flex-col bg-panel select-none text-fg-secondary overflow-hidden"
    >
      {/* Main Folder Navigation */}
      <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-3">
        {/* Pinned Inbox */}
        <div>
          <button
            onClick={() => setCurrentFolder(DEFAULT_INBOX_FOLDER)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
              currentFolder === DEFAULT_INBOX_FOLDER
                ? 'bg-white/[0.08] text-white font-medium'
                : 'text-zinc-300 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-zinc-300" />
              <span>{DEFAULT_INBOX_FOLDER}</span>
            </div>
            {inboxItemsCount > 0 && (
              <span
                key={inboxItemsCount}
                data-testid="inbox-count"
                className="px-1.5 py-0.2 rounded-full text-2xs font-mono bg-white/10 text-zinc-200 motion-count"
              >
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

      {/* A newer build is one click away; the line is quiet until the release is worth it. */}
      {appUpdate.isNoticeVisible && appUpdate.offer && (
        <button
          type="button"
          onClick={() => openSettingsModal('updates')}
          data-testid="sidebar-update-notice"
          title={`Обновление ${appUpdate.offer.version} · открыть раздел обновлений`}
          className="mx-2 mb-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-fg-muted hover:text-fg-primary hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <ArrowDownToLine className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">обновление {appUpdate.offer.version}</span>
        </button>
      )}

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
              <span className="truncate text-xs font-medium">{getVaultDisplayName(vault, vaults)}</span>
            </div>
            <ChevronDown
              className={`w-3 h-3 text-zinc-500 shrink-0 ml-1 transition-transform duration-150 ${
                isVaultDropdownOpen ? 'rotate-180 text-zinc-300' : ''
              }`}
            />
          </button>
        </div>

        {/* Vault Switcher Dropdown */}
        <VaultSwitcherMenu
          isOpen={isVaultDropdownOpen}
          onClose={() => setIsVaultDropdownOpen(false)}
          variant="dropdown"
          position="bottom"
        />

        {/* Sync Status button */}
        <button
          onClick={() => openSettingsModal('sync')}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer relative group"
          title={
            syncStatus.authRequired && !syncStatus.isAuthenticated
              ? 'Синхронизация: войдите в SLAG ID'
              : syncStatus.state === 'connected'
              ? `Синхронизация активна (${syncStatus.pingMs ?? 1} ms) · Клик: открыть настройки`
              : syncStatus.state === 'syncing'
              ? 'Синхронизация дельт...'
              : 'Синхронизация: офлайн · Клик: открыть настройки'
          }
          data-testid="sidebar-sync-btn"
        >
          <RefreshCw
            className={`w-4 h-4 transition-transform ${
              syncStatus.state === 'syncing'
                ? 'animate-spin text-amber-400'
                : syncStatus.state === 'connected'
                ? 'text-zinc-400 group-hover:text-white'
                : 'text-zinc-600'
            }`}
          />
          <span
            className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
              syncStatus.state === 'connected'
                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                : syncStatus.state === 'syncing'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-zinc-600'
            }`}
          />
        </button>

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
