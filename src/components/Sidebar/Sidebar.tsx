// Left rail: vault switcher, folder tree, inbox, sync state and settings shortcuts.
import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FolderTree } from './FolderTree';
import { syncEngine } from '../../lib/sync/syncEngine';
import { getVaultDisplayName } from '../../lib/vault/vaultDisplay';
import { VaultSwitcherMenu } from '../Vault/VaultSwitcherMenu';
import type { SyncStatus } from '../../lib/sync/types';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { Icon } from '../UI/icons/Icon';
import { syncGlyph } from './syncGlyph';
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
  const glyph = syncGlyph(syncStatus);

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
                ? 'bg-tint-8 text-white font-medium'
                : 'text-fg-tertiary hover:text-white hover:bg-tint-4'
            }`}
          >
            <div className="flex items-center gap-2">
              <Icon name="entity.inbox" size="md" tone="tertiary" />
              <span>{DEFAULT_INBOX_FOLDER}</span>
            </div>
            {inboxItemsCount > 0 && (
              <span
                key={inboxItemsCount}
                data-testid="inbox-count"
                className="px-1.5 py-0.2 rounded-full text-2xs font-mono bg-tint-10 text-fg-soft motion-count"
              >
                {inboxItemsCount}
              </span>
            )}
          </button>
        </div>

        {/* Folders Section Header */}
        <div className="pt-2 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-2.5 py-1 text-2xs font-mono font-medium text-fg-muted tracking-wider uppercase">
            <span>Папки</span>
            <button
              onClick={() => openCreateFolderModal()}
              className="p-1 rounded text-fg-muted hover:text-fg-soft hover:bg-tint-6 transition-colors"
              title="Создать папку"
            >
              <Icon name="action.folderAdd" size="sm" tone="inherit" />
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
          className="mx-2 mb-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-2xs text-fg-muted hover:text-fg-primary hover:bg-tint-4 transition-colors cursor-pointer"
        >
          <Icon name="system.update" size="sm" tone="inherit" className="shrink-0" />
          <span className="truncate">обновление {appUpdate.offer.version}</span>
        </button>
      )}

      {/* Bottom Vault Switcher & Settings */}
      <div
        ref={bottomBarRef}
        className="p-2 border-t border-tint-6 flex items-center justify-between gap-1 relative bg-panel"
      >
        {/* Vault Switcher Trigger */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setIsVaultDropdownOpen(!isVaultDropdownOpen)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-fg-tertiary hover:text-white hover:bg-tint-4 transition-colors truncate"
          >
            <div className="flex items-center gap-2 truncate">
              <Icon name="entity.vault" size="sm" className="shrink-0" />
              <span className="truncate text-xs font-medium">{getVaultDisplayName(vault, vaults)}</span>
            </div>
            <Icon name="nav.down" size="sm" tone="muted" className={`shrink-0 ml-1 transition-transform duration-150 ${isVaultDropdownOpen ? 'rotate-180 text-fg-tertiary' : ''}`} />
          </button>
        </div>

        {/* Vault Switcher Dropdown */}
        <VaultSwitcherMenu
          isOpen={isVaultDropdownOpen}
          onClose={() => setIsVaultDropdownOpen(false)}
          variant="dropdown"
          position="bottom"
        />

        {/* Sync Status button: the glyph itself carries the state, no status dot on top of it */}
        <button
          onClick={() => openSettingsModal('sync')}
          className="p-1.5 rounded hover:bg-tint-6 transition-colors shrink-0 cursor-pointer"
          title={glyph.title}
          aria-label={glyph.title}
          data-testid="sidebar-sync-btn"
          data-sync-state={syncStatus.state}
        >
          <Icon
            name={glyph.name}
            size="md"
            tone="inherit"
            className={`transition-colors ${glyph.className}`}
          />
        </button>

        {/* Logs HUD button */}
        <button
          onClick={() => setIsLogViewerOpen(true)}
          className="p-1.5 rounded text-fg-secondary hover:text-fg-soft hover:bg-tint-6 transition-colors shrink-0"
          title="Системные логи & HUD (Ctrl + `)"
          data-testid="sidebar-logs-btn"
        >
          <Icon name="system.logs" size="md" tone="inherit" />
        </button>

        {/* Settings button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-1.5 rounded text-fg-secondary hover:text-fg-soft hover:bg-tint-6 transition-colors shrink-0 cursor-pointer"
          title="Настройки (ИИ, экспорт, тема)"
          data-testid="sidebar-settings-btn"
        >
          <Icon name="system.settings" size="md" tone="inherit" />
        </button>
      </div>
    </aside>
  );
};
