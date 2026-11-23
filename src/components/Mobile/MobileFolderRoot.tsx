// The phone folder root screen: vault switcher header, sync button, pinned inbox card,
// and a Telegram-grouped list of top-level folders.  Uses current `useApp` /
// `navigateToFolder`.  No modal dialogs or extra local state beyond the vault menu toggle.
import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Icon } from '../UI/icons/Icon';
import { folderIconName } from '../UI/icons/icons';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { folderColorCss } from '../../lib/vault/folderColor';
import { MobileScreenHeader } from './MobileScreenHeader';
import { VaultSwitcherMenu } from '../Vault/VaultSwitcherMenu';
import { SyncStatusButton } from '../Sidebar/SyncStatusButton';

function unsortedLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'неразобранная';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'неразобранные';
  return 'неразобранных';
}

export const MobileFolderRoot: React.FC = () => {
  const {
    vault,
    folders,
    items,
    navigateToFolder,
    setIsSearchOpen,
    openCreateFolderModal,
    openSettingsModal,
  } = useApp();

  const [isVaultMenuOpen, setIsVaultMenuOpen] = useState(false);

  const unsortedCount = items.filter(i => i.folder === DEFAULT_INBOX_FOLDER).length;

  // Top-level paths (no '/'), excluding the inbox itself.
  const directFolders = folders.filter(
    f => !f.path.includes('/') && f.path !== DEFAULT_INBOX_FOLDER,
  );

  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none">
      {/* ── Header ─────────────────────────────────────────────── */}
      <MobileScreenHeader
        className="border-none"
        title={
          <button
            type="button"
            onClick={() => setIsVaultMenuOpen(prev => !prev)}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer text-left"
            title="Переключить хранилище"
            data-testid="mobile-vault-switcher-btn"
          >
            <span>Заметки</span>
            <span className="text-fg-muted font-normal text-xs font-mono truncate max-w-[120px]">
              / {vault.name || 'main'}
            </span>
            <Icon name="nav.down" size="sm" tone="muted" className={`transition-transform duration-150 ${isVaultMenuOpen ? 'rotate-180 text-fg-tertiary' : ''}`} />
          </button>
        }
        leadingAction={<SyncStatusButton mobile onSettings={() => openSettingsModal('sync')} />}
        rightSlot={
          <>
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="w-10 h-10 rounded-full hover:bg-tint-6 text-fg-secondary hover:text-white flex items-center justify-center motion-press cursor-pointer"
              title="Поиск"
              aria-label="Поиск"
            >
              <Icon name="action.search" size="lg" tone="inherit" />
            </button>
            <button
              type="button"
              onClick={() => openCreateFolderModal()}
              className="w-10 h-10 rounded-full hover:bg-tint-6 text-fg-secondary hover:text-white flex items-center justify-center motion-press cursor-pointer"
              title="Новая папка"
              aria-label="Новая папка"
            >
              <Icon name="action.folderAdd" size="lg" tone="inherit" />
            </button>
          </>
        }
      />

      {/* ── Scrollable list ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-24">
        {/* Pinned Inbox Card */}
        <div className="rounded-2xl bg-surface/80 overflow-hidden">
          <button
            onClick={() => navigateToFolder(DEFAULT_INBOX_FOLDER)}
            className="w-full flex items-center justify-between p-3.5 hover:bg-tint-4 active:bg-tint-10 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-6 h-6 flex items-center justify-center text-fg-soft shrink-0">
                <Icon name="entity.inbox" size="lg" tone="inherit" />
              </div>
              <div className="text-sm font-semibold text-white truncate">{DEFAULT_INBOX_FOLDER}</div>
            </div>
            {unsortedCount > 0 && (
              <span className="text-xs font-mono text-fg-muted shrink-0">
                {unsortedCount} {unsortedLabel(unsortedCount)}
              </span>
            )}
          </button>
        </div>

        {/* User Folders Group */}
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="px-1 text-2xs font-mono text-fg-muted uppercase tracking-wider">
            Папки
          </div>

          <div className="rounded-2xl bg-surface/80 overflow-hidden">
            {directFolders.map(folder => {
              const iconName = folderIconName(folder.icon);
              return (
                <button
                  key={folder.path}
                  onClick={() => navigateToFolder(folder.path)}
                  className="w-full flex items-center justify-between p-3 hover:bg-tint-4 active:bg-tint-10 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      data-folder-color={folder.color}
                      style={{ color: folderColorCss(folder.color) }}
                      className="w-6 h-6 flex items-center justify-center text-fg-secondary shrink-0"
                    >
                      <Icon name={iconName} size="lg" tone="inherit" />
                    </div>
                    <div className="text-sm font-medium text-fg-soft truncate">{folder.name}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <VaultSwitcherMenu
        isOpen={isVaultMenuOpen}
        onClose={() => setIsVaultMenuOpen(false)}
        variant="sheet"
      />
    </div>
  );
};
