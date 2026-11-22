// The phone folder screen: header, feed/Kanban/calendar switch, and the pinned composer.
import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { FeedList } from '../Feed/FeedList';
import { Composer } from '../Feed/Composer';
import { KanbanBoard } from '../Views/KanbanBoard';
import { MobileCalendarView } from './MobileCalendarView';
import { ActiveFilterBadges } from '../Feed/ActiveFilterBadges';
import { Icon } from '../UI/icons/Icon';
import { folderIconName } from '../UI/icons/icons';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { materialsInFolder } from '../../lib/vault/folderItems';
import { MobileScreenHeader } from './MobileScreenHeader';
import { VaultSwitcherMenu } from '../Vault/VaultSwitcherMenu';
import { useComposerInset } from '../../hooks/layout/useComposerInset';
import { SyncStatusButton } from '../Sidebar/SyncStatusButton';

function unsortedLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'неразобранная';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'неразобранные';
  return 'неразобранных';
}

export const MobileFoldersView: React.FC = () => {
  const {
    vault,
    folders,
    items,
    currentFolder,
    mobileActiveFolder,
    setMobileActiveFolder,
    setMobileFolderInfoOpen,
    setIsSearchOpen,
    openCreateFolderModal,
    openFolderViewModal,
    feedViewMode,
    isKanbanMaterialsOpen,
    setIsKanbanMaterialsOpen,
    setIsTriageModalOpen,
    openSettingsModal,
  } = useApp();

  const [isVaultMenuOpen, setIsVaultMenuOpen] = useState(false);
  // Лента уезжает под островок композера: панель публикует его высоту, список её читает.
  const [attachComposerDock, composerInset] = useComposerInset();

  // A quick tap can end before `:active` ever paints a frame, so the acknowledgement
  // outlives the finger: the row stays lit for 200ms after it was touched.
  const flashTimerRef = useRef<number | null>(null);
  const flashTap = (event: React.PointerEvent<HTMLElement>) => {
    const row = event.currentTarget;
    row.dataset.tapped = 'true';
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      delete row.dataset.tapped;
      flashTimerRef.current = null;
    }, 200);
  };

  const isInbox = mobileActiveFolder === DEFAULT_INBOX_FOLDER;

  const folderMaterialsCount = useMemo(
    () => materialsInFolder(items, currentFolder).length,
    [items, currentFolder],
  );

  const canTriageInbox = isInbox && items.some(i => i.folder === DEFAULT_INBOX_FOLDER);

  // Root folders vs Direct subfolders of mobileActiveFolder
  const directSubfolders = useMemo(() => {
    if (!mobileActiveFolder) {
      // Root level: paths without '/'
      return folders.filter(f => !f.path.includes('/'));
    }
    return folders.filter(f => {
      if (!f.path.startsWith(mobileActiveFolder + '/')) return false;
      const remainder = f.path.slice(mobileActiveFolder.length + 1);
      return !remainder.includes('/');
    });
  }, [folders, mobileActiveFolder]);

  // Current folder metadata if inside a folder
  const activeMeta = folders.find(f => f.path === mobileActiveFolder);

  const handleBack = () => {
    if (!mobileActiveFolder) return;
    if (mobileActiveFolder.includes('/')) {
      const parent = mobileActiveFolder.substring(0, mobileActiveFolder.lastIndexOf('/'));
      setMobileActiveFolder(parent);
    } else {
      setMobileActiveFolder(null);
    }
  };

  // 1. Root Folders List (When no folder is currently opened)
  if (!mobileActiveFolder) {
    const unsortedCount = items.filter(i => i.folder === DEFAULT_INBOX_FOLDER).length;

    return (
      <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none">
        {/* Top Header */}
        <MobileScreenHeader
          title={
            <button
              type="button"
              onClick={() => setIsVaultMenuOpen((prev: boolean) => !prev)}
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

        {/* Scrollable Root Folders List (Telegram Grouped Style) */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-24">
          {/* Pinned Inbox Card */}
          <div className="rounded-2xl bg-surface/80 border border-tint-6 overflow-hidden">
            <button
              onClick={() => setMobileActiveFolder(DEFAULT_INBOX_FOLDER)}
              onPointerDown={flashTap}
              className="w-full flex items-center justify-between p-3.5 hover:bg-tint-4 active:bg-tint-10 active:duration-0 data-[tapped=true]:bg-tint-10 data-[tapped=true]:duration-0 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-6 h-6 flex items-center justify-center text-fg-soft shrink-0">
                  <Icon name="entity.inbox" size="lg" tone="inherit" />
                </div>
                <div className="text-sm font-semibold text-white truncate">{DEFAULT_INBOX_FOLDER}</div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {unsortedCount > 0 && (
                  <span className="text-xs font-mono text-fg-muted">
                    {unsortedCount} {unsortedLabel(unsortedCount)}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* User Folders Group */}
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="px-1 text-2xs font-mono text-fg-muted uppercase tracking-wider">
              Папки
            </div>

            <div className="rounded-2xl bg-surface/80 border border-tint-6 overflow-hidden divide-y divide-tint-4">
              {directSubfolders
                .filter(f => f.path !== DEFAULT_INBOX_FOLDER)
                .map(folder => {
                  const iconName = folderIconName(folder.icon);

                  return (
                    <button
                      key={folder.path}
                      onClick={() => setMobileActiveFolder(folder.path)}
                      onPointerDown={flashTap}
                      className="w-full flex items-center justify-between p-3 hover:bg-tint-4 active:bg-tint-10 active:duration-0 data-[tapped=true]:bg-tint-10 data-[tapped=true]:duration-0 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div data-folder-color={folder.color} className="folder-icon-color w-6 h-6 flex items-center justify-center text-fg-secondary shrink-0">
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
  }

  // 2. Inside a Folder: Header + Optional Subfolders Horizontal Bar + Feed + Composer
  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none relative">
      {/* Top Header */}
      <MobileScreenHeader
        onBack={handleBack}
        iconOnlyBack
        backLabel={
          mobileActiveFolder.includes('/')
            ? mobileActiveFolder.split('/')[mobileActiveFolder.split('/').length - 2]
            : 'Папки'
        }
        backTitle="Назад к списку папок"
        className="z-20"
        centerSlot={
          <button
            type="button"
            onClick={() => setMobileFolderInfoOpen(true)}
            className="flex flex-col items-center justify-center min-w-0 max-w-[200px] hover:opacity-80 motion-press cursor-pointer select-none"
            title={`Информация и медиа папки «${activeMeta?.name || mobileActiveFolder}»`}
            aria-label="Информация о папке"
          >
            <span className="text-sm font-bold text-white truncate max-w-full">
              {activeMeta?.name || mobileActiveFolder}
            </span>
            {!isInbox && (
              <span className="text-3xs font-mono text-fg-muted truncate max-w-full">
                {mobileActiveFolder}
              </span>
            )}
          </button>
        }
        rightSlot={
          <div className="flex items-center gap-0.5">
            {/* Kanban Materials Dock Toggle */}
            {feedViewMode === 'kanban' && (
              <button
                type="button"
                onClick={() => setIsKanbanMaterialsOpen(prev => !prev)}
                className={`w-9 h-9 rounded-full flex items-center justify-center motion-press cursor-pointer ${
                  isKanbanMaterialsOpen
                    ? 'bg-tint-10 text-white'
                    : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-6'
                }`}
                title={
                  isKanbanMaterialsOpen
                    ? `Скрыть материалы (${folderMaterialsCount})`
                    : `Показать материалы (${folderMaterialsCount})`
                }
                aria-label="Материалы папки"
              >
                <Icon name="entity.materials" size="md" tone="inherit" className="shrink-0" />
              </button>
            )}

            {/* AI Triage button in Inbox */}
            {canTriageInbox && (
              <button
                type="button"
                onClick={() => setIsTriageModalOpen(true)}
                title="ИИ-Сортировка"
                aria-label="Запустить ИИ-Сортировку"
                className="flex items-center justify-center size-12 rounded-lg text-fg-secondary hover:text-fg-soft hover:bg-tint-6 motion-press cursor-pointer"
              >
                <Icon name="action.sort" size="sm" tone="inherit" />
              </button>
            )}

            {/* View & Filter Options (3-dots button) */}
            <button
              type="button"
              onClick={openFolderViewModal}
              className="relative w-9 h-9 rounded-full hover:bg-tint-6 text-fg-secondary hover:text-white flex items-center justify-center motion-press cursor-pointer"
              title="Вид и фильтры папки"
              aria-label="Вид и фильтры папки"
            >
              <Icon name="action.more" size="lg" tone="inherit" />
            </button>
          </div>
        }
      />

      {/* Active Filter Badges Strip (Visible only when filters/tags/ai are active) */}
      <ActiveFilterBadges className="px-3 py-1 border-b border-tint-4 bg-panel/40 shrink-0 z-10" />

      {/* Subfolders Quick Ribbon (If folder has subfolders) */}
      {directSubfolders.length > 0 && (
        <div className="z-10 flex shrink-0 items-center gap-2 overflow-x-auto border-b border-tint-6 bg-panel px-3 scrollbar-none">
          {directSubfolders.map(sub => {
            const subItemsCount = items.filter(i => i.folder === sub.path).length;
            return (
              <button
                key={sub.path}
                onClick={() => setMobileActiveFolder(sub.path)}
                className="flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs font-medium text-fg-secondary active:bg-tint-8 focus-visible:bg-tint-8 cursor-pointer"
              >
                <Icon name="entity.folder" size="sm" />
                <span>{sub.name}</span>
                <span key={subItemsCount} className="text-3xs font-mono text-fg-muted motion-count">({subItemsCount})</span>
              </button>
            );
          })}
          <button
            onClick={() => openCreateFolderModal(mobileActiveFolder)}
            className="flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs text-fg-secondary active:bg-tint-8 focus-visible:bg-tint-8 cursor-pointer"
            title="Создать подпапку"
          >
            <Icon name="action.add" size="sm" tone="inherit" />
            <span>Подпапка</span>
          </button>
        </div>
      )}

      {/* Main Content Area: Reacting to feedViewMode */}
      <div
        className="flex-1 min-h-0 relative flex flex-col overflow-hidden"
        style={{ '--composer-inset': composerInset ? `${composerInset}px` : undefined } as React.CSSProperties}
      >
        {feedViewMode === 'kanban' ? (
          <KanbanBoard />
        ) : feedViewMode === 'calendar' ? (
          <MobileCalendarView embedded />
        ) : (
          <>
            <FeedList />
            {/* Островок: лента уезжает под него, поэтому край карточки — это его скругление,
                а не прямоугольная кромка скролла. Градиент сверху съедает резкую границу. */}
            <div
              ref={attachComposerDock}
              data-testid="composer-dock"
              className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center pointer-events-none"
              style={{
                paddingBottom: 'calc(var(--sab) + 8px)',
                paddingLeft: 'calc(var(--sal) + 12px)',
                paddingRight: 'calc(var(--sar) + 12px)',
              }}
            >
              <div className="h-6 w-full bg-gradient-to-t from-canvas to-transparent" aria-hidden="true" />
              <div className="pointer-events-auto w-full">
                <Composer key={currentFolder} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
