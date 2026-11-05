import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { FeedList } from '../Feed/FeedList';
import { Composer } from '../Feed/Composer';
import { KanbanBoard } from '../Views/KanbanBoard';
import { MobileCalendarView } from './MobileCalendarView';
import { ActiveFilterBadges } from '../Feed/ActiveFilterBadges';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  Info,
  Search,
  Inbox,
  Plus,
  BookOpen,
  ArrowUpDown,
  MoreVertical,
} from 'lucide-react';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { MobileScreenHeader } from './MobileScreenHeader';

export const MobileFoldersView: React.FC = () => {
  const {
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
    activeTypeFilter,
    sortBy,
    sortOrder,
    hideCompletedTasks,
    isPinnedOnlyFilter,
    inboxMode,
  } = useApp();

  const isInbox = mobileActiveFolder === 'Входящие';

  const isCustomized =
    feedViewMode !== 'feed' ||
    activeTypeFilter !== 'all' ||
    sortBy !== 'createdAt' ||
    sortOrder !== 'asc' ||
    hideCompletedTasks ||
    isPinnedOnlyFilter ||
    (isInbox && inboxMode !== 'all');

  const folderMaterialsCount = useMemo(() => {
    return items.filter(item => {
      const inFolder =
        currentFolder === 'Входящие'
          ? true
          : item.folder === currentFolder || item.folder.startsWith(currentFolder + '/');
      return inFolder && !item.isArchived && (item.type === 'note' || item.type === 'article');
    }).length;
  }, [items, currentFolder]);

  const inboxUnsortedCount = useMemo(() => {
    return isInbox ? items.filter(i => i.folder === 'Входящие').length : 0;
  }, [items, isInbox]);

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
    const unsortedCount = items.filter(i => i.folder === 'Входящие').length;

    return (
      <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none">
        {/* Top Header */}
        <MobileScreenHeader
          title="Заметки"
          icon="S"
          rightSlot={
            <>
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="w-10 h-10 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                title="Поиск"
                aria-label="Поиск"
              >
                <Search className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => openCreateFolderModal()}
                className="w-10 h-10 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                title="Новая папка"
                aria-label="Новая папка"
              >
                <FolderPlus className="w-5 h-5" />
              </button>
            </>
          }
        />

        {/* Scrollable Root Folders List (Telegram Grouped Style) */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-24">
          {/* Pinned "Входящие" Card */}
          <div className="rounded-2xl bg-surface/80 border border-white/[0.06] overflow-hidden">
            <button
              onClick={() => setMobileActiveFolder('Входящие')}
              className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-6 h-6 flex items-center justify-center text-zinc-200 shrink-0">
                  <Inbox className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold text-white truncate">Входящие</div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {unsortedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-zinc-200 text-xs font-mono font-medium">
                    {unsortedCount}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </div>
            </button>
          </div>

          {/* User Folders Group */}
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              Папки
            </div>

            <div className="rounded-2xl bg-surface/80 border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
              {directSubfolders
                .filter(f => f.path !== 'Входящие')
                .map(folder => {
                  const Icon = FOLDER_ICONS[folder.icon || 'Folder'] || Folder;
                  const folderItemsCount = items.filter(i => i.folder === folder.path || i.folder.startsWith(folder.path + '/')).length;
                  const subCount = folders.filter(f => f.path.startsWith(folder.path + '/')).length;

                  return (
                    <button
                      key={folder.path}
                      onClick={() => setMobileActiveFolder(folder.path)}
                      className="w-full flex items-center justify-between p-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-6 h-6 flex items-center justify-center text-zinc-400 shrink-0">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="text-sm font-medium text-zinc-200 truncate">{folder.name}</div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-zinc-500">
                          {subCount > 0 ? `${subCount} п. • ` : ''}{folderItemsCount}
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-600" />
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Inside a Folder: Header + Optional Subfolders Horizontal Bar + Feed + Composer
  return (
    <div className="flex-1 flex flex-col bg-canvas text-fg-primary overflow-hidden select-none relative">
      {/* Top Header */}
      <MobileScreenHeader
        onBack={handleBack}
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
            className="flex flex-col items-center justify-center min-w-0 max-w-[200px] hover:opacity-80 active:scale-95 transition-all cursor-pointer select-none"
            title={`Информация и медиа папки «${activeMeta?.name || mobileActiveFolder}»`}
          >
            <span className="text-sm font-bold text-white truncate max-w-full">
              {activeMeta?.name || mobileActiveFolder}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 truncate max-w-full">
              {isInbox ? 'Лента входящих' : mobileActiveFolder}
            </span>
          </button>
        }
        rightSlot={
          <div className="flex items-center gap-0.5">
            {/* Kanban Materials Dock Toggle */}
            {feedViewMode === 'kanban' && (
              <button
                type="button"
                onClick={() => setIsKanbanMaterialsOpen(prev => !prev)}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 ${
                  isKanbanMaterialsOpen
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
                }`}
                title={
                  isKanbanMaterialsOpen
                    ? `Скрыть материалы (${folderMaterialsCount})`
                    : `Показать материалы (${folderMaterialsCount})`
                }
                aria-label="Материалы папки"
              >
                <BookOpen className="w-4 h-4 shrink-0" />
              </button>
            )}

            {/* AI Triage button in Inbox */}
            {isInbox && inboxUnsortedCount > 0 && (
              <button
                type="button"
                onClick={() => setIsTriageModalOpen(true)}
                title={`ИИ-Сортировка (${inboxUnsortedCount} неразобранных)`}
                aria-label="Запустить ИИ-Сортировку"
                className="h-8 px-2 rounded-lg flex items-center gap-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer active:scale-95"
              >
                <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                <span className="font-mono text-[11px]">{inboxUnsortedCount}</span>
                <span className="sr-only">Запустить ИИ-Сортировку</span>
              </button>
            )}

            {/* View & Filter Options (3-dots button) */}
            <button
              type="button"
              onClick={openFolderViewModal}
              className="relative w-9 h-9 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Вид и фильтры папки"
              aria-label="Вид и фильтры папки"
            >
              <MoreVertical className="w-5 h-5" />
              {isCustomized && (
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-white ring-2 ring-panel" />
              )}
            </button>

            {/* Folder Info & Media Profile */}
            <button
              type="button"
              onClick={() => setMobileFolderInfoOpen(true)}
              className="w-9 h-9 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Инфо папки и медиа"
              aria-label="Информация о папке"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
        }
      />

      {/* Active Filter Badges Strip (Visible only when filters/tags/ai are active) */}
      <ActiveFilterBadges className="px-3 py-1 border-b border-white/[0.04] bg-panel/40 shrink-0 z-10" />

      {/* Subfolders Quick Ribbon (If folder has subfolders) */}
      {directSubfolders.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-panel/60 overflow-x-auto scrollbar-none shrink-0 z-10">
          {directSubfolders.map(sub => {
            const subItemsCount = items.filter(i => i.folder === sub.path).length;
            return (
              <button
                key={sub.path}
                onClick={() => setMobileActiveFolder(sub.path)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-zinc-300 shrink-0 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              >
                <Folder className="w-3.5 h-3.5 text-zinc-400" />
                <span>{sub.name}</span>
                <span className="text-[10px] font-mono text-zinc-500">({subItemsCount})</span>
              </button>
            );
          })}
          <button
            onClick={() => openCreateFolderModal(mobileActiveFolder)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-dashed border-white/[0.1] text-xs text-zinc-400 shrink-0 cursor-pointer whitespace-nowrap"
            title="Создать подпапку"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Подпапка</span>
          </button>
        </div>
      )}

      {/* Main Content Area: Reacting to feedViewMode */}
      <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        {feedViewMode === 'kanban' ? (
          <KanbanBoard />
        ) : feedViewMode === 'calendar' ? (
          <MobileCalendarView />
        ) : (
          <>
            <FeedList />
            {/* Telegram-style Composer Island at the bottom of the feed */}
            <div
              className="absolute inset-x-0 bottom-0 pointer-events-none z-30 pb-2 px-2 flex justify-center"
              style={{
                transform: `translateY(calc(-1 * var(--keyboard-inset-bottom, 0px)))`,
                transition: 'transform 100ms ease-out',
              }}
            >
              <div className="pointer-events-auto w-full max-w-lg">
                <Composer key={currentFolder} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
