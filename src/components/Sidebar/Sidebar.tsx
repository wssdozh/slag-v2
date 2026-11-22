// Left rail: vault switcher, folder tree, inbox, sync state and settings shortcuts.
import React, { useCallback, useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FolderTree } from './FolderTree';
import { getVaultDisplayName } from '../../lib/vault/vaultDisplay';
import { VaultSwitcherMenu } from '../Vault/VaultSwitcherMenu';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { Icon } from '../UI/icons/Icon';
import { SyncStatusButton } from './SyncStatusButton';
import { TASK_QUICK_FILTER_LABELS } from '../../lib/tasks/taskQuickFilter';
import { useWorkspaceTaskFilterContext } from '../Workspace/workspaceTaskFilterContext';

const taskLinks = [
  { id: 'today', icon: 'time.date', color: 'text-warning' },
  { id: 'upcoming', icon: 'time.agenda', color: 'text-accent' },
  { id: 'undated', icon: 'time.time', color: 'text-fg-secondary' },
  { id: 'completed', icon: 'entity.taskList', color: 'text-success' },
] as const;

export const Sidebar: React.FC = () => {
  const {
    vault,
    vaults,
    currentFolder,
    setCurrentFolder,
    setIsSettingsOpen,
    openSettingsModal,
    setIsLogViewerOpen,
    openCreateFolderModal,
    appUpdate,
  } = useApp();

  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false);
  const bottomBarRef = useRef<HTMLDivElement>(null);
  const getVaultAnchor = useCallback(() => bottomBarRef.current, []);
  const { panelId, filter, toggleFilter } = useWorkspaceTaskFilterContext();
  const isInboxActive = currentFolder === DEFAULT_INBOX_FOLDER;

  return (
    <aside
      className="w-full h-full flex flex-col bg-panel select-none text-fg-secondary overflow-hidden"
    >
      {/* Main Folder Navigation */}
      <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-3">
        {/* Pinned Inbox */}
        <nav aria-label="Входящие">
          <button type="button" aria-current={isInboxActive ? 'page' : undefined}
            onClick={() => setCurrentFolder(DEFAULT_INBOX_FOLDER)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:bg-tint-10 ${isInboxActive ? 'bg-tint-8 font-medium text-fg-primary' : 'text-fg-secondary hover:bg-tint-4 hover:text-fg-primary'}`}>
            <Icon name="entity.inbox" size="md" tone="inherit" className="shrink-0 text-accent" />
            <span>{DEFAULT_INBOX_FOLDER}</span>
          </button>
        </nav>
        <div role="group" aria-label="Быстрые фильтры задач" data-testid="task-quick-filters">
          {taskLinks.map(({ id, icon, color }) => {
            const active = filter?.id === id;
            return (
              <button key={id} type="button" onClick={() => toggleFilter?.(id)} disabled={!panelId} aria-pressed={active}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:bg-tint-10 disabled:opacity-50 ${active ? 'bg-tint-8 font-medium text-fg-primary' : 'text-fg-secondary hover:bg-tint-4 hover:text-fg-primary'}`}>
                <Icon name={icon} size="md" tone="inherit" className={`shrink-0 ${color}`} />
                <span className="min-w-0 flex-1 truncate text-start">{TASK_QUICK_FILTER_LABELS[id]}</span>
              </button>
            );
          })}
        </div>

        {/* Folders Section Header */}
        <div className="flex-1 flex flex-col min-h-0">
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
          getAnchor={getVaultAnchor}
        />

        <SyncStatusButton onSettings={() => openSettingsModal('sync')} />

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
