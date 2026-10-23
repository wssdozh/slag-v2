import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { FeedList } from '../Feed/FeedList';
import { Composer } from '../Feed/Composer';
import { KanbanBoard } from '../Views/KanbanBoard';
import { MobileCalendarView } from './MobileCalendarView';
import {
  Folder,
  FolderPlus,
  FolderCheck,
  ChevronRight,
  Info,
  Search,
  Inbox,
  Plus,
  X,
  StickyNote,
  CheckSquare,
  FileText,
  Layers,
  Kanban,
  Calendar,
  Filter
} from 'lucide-react';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';
import { MobileScreenHeader } from './MobileScreenHeader';

export const MobileFoldersView: React.FC = () => {
  const {
    folders,
    items,
    mobileActiveFolder,
    setMobileActiveFolder,
    setMobileFolderInfoOpen,
    setIsSearchOpen,
    openCreateFolderModal,
    activeTypeFilter,
    setActiveTypeFilter,
    inboxMode,
    setInboxMode,
    activeTagFilter,
    setActiveTagFilter,
    feedViewMode,
    setFeedViewMode,
    aiItemFilter,
    clearAiFilter
  } = useApp();

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
      <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none">
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
          <div className="rounded-2xl bg-[#141417]/80 border border-white/[0.06] overflow-hidden">
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

            <div className="rounded-2xl bg-[#141417]/80 border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
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
  const isInbox = mobileActiveFolder === 'Входящие';

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] text-[#f4f4f5] overflow-hidden select-none relative">
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
          <>
            <span className="text-sm font-bold text-white truncate max-w-[160px]">
              {activeMeta?.name || mobileActiveFolder}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[160px]">
              {isInbox ? 'Лента входящих' : mobileActiveFolder}
            </span>
          </>
        }
        rightSlot={
          <button
            type="button"
            onClick={() => setMobileFolderInfoOpen(true)}
            className="w-10 h-10 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            title="Инфо папки и медиа"
            aria-label="Информация о папке"
          >
            <Info className="w-5 h-5" />
          </button>
        }
      />

      {/* Subfolders Quick Ribbon (If folder has subfolders) */}
      {directSubfolders.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-[#0c0c0e]/60 overflow-x-auto scrollbar-none shrink-0 z-10">
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

      {/* 1-Row Horizontally Scrollable Filters Strip - Matching Desktop FeedHeader */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04] bg-[#0c0c0e]/40 overflow-x-auto scrollbar-none shrink-0 z-10 text-xs">
        {/* Inbox Sub-mode Filter (only in feed mode) */}
        {isInbox && feedViewMode === 'feed' && (
          <div aria-label="Фильтр входящих" className="flex items-center h-ctrl-sm bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shrink-0">
            <button
              onClick={() => setInboxMode('all')}
              className={`h-full px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                inboxMode === 'all'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Все заметки хранилища сквозным списком"
            >
              Все
            </button>
            <button
              onClick={() => setInboxMode('sorted')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center justify-center transition-all cursor-pointer ${
                inboxMode === 'sorted'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только распределенные по папкам (Разобранные)"
            >
              <FolderCheck className="w-3.5 h-3.5 text-zinc-300" />
            </button>
            <button
              onClick={() => setInboxMode('unsorted')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center justify-center transition-all cursor-pointer ${
                inboxMode === 'unsorted'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только неразобранные заметки во Входящих"
            >
              <Inbox className="w-3.5 h-3.5 text-zinc-300" />
            </button>
          </div>
        )}

        {/* Type filters (feed mode only) */}
        {feedViewMode === 'feed' && (
          <div aria-label="Фильтр по типу" className="flex items-center h-ctrl-sm bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shrink-0">
            <button
              onClick={() => setActiveTypeFilter('all')}
              className={`h-full px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                activeTypeFilter === 'all'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Все типы записей"
            >
              Все
            </button>
            <button
              onClick={() => setActiveTypeFilter('note')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center transition-all cursor-pointer ${
                activeTypeFilter === 'note'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только заметки"
            >
              <StickyNote className="w-3.5 h-3.5 text-zinc-300" />
            </button>
            <button
              onClick={() => setActiveTypeFilter('task')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center transition-all cursor-pointer ${
                activeTypeFilter === 'task'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только таски"
            >
              <CheckSquare className="w-3.5 h-3.5 text-zinc-300" />
            </button>
            <button
              onClick={() => setActiveTypeFilter('article')}
              className={`h-full px-1.5 rounded-md text-xs flex items-center transition-all cursor-pointer ${
                activeTypeFilter === 'article'
                  ? 'bg-white/10 text-white font-medium shadow-sm border border-white/[0.08]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
              }`}
              title="Только статьи"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-300" />
            </button>
          </div>
        )}

        {/* AI Filter Chip when Assistant filtered the feed */}
        {aiItemFilter && (
          <div className="flex items-center gap-1.5 px-2 h-ctrl-sm rounded-md bg-white/[0.08] border border-white/[0.12] text-zinc-200 text-xs font-mono shrink-0">
            <Filter className="w-3 h-3 text-zinc-400" />
            <span className="truncate max-w-[100px]">{aiItemFilter.queryLabel}</span>
            <button
              onClick={clearAiFilter}
              className="p-0.5 hover:text-white transition-colors cursor-pointer"
              title="Сбросить фильтр ИИ"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Active Tag filter chip */}
        {activeTagFilter && (
          <div className="flex items-center gap-1.5 px-2 h-ctrl-sm rounded-md bg-white/10 text-white text-xs font-mono shrink-0 whitespace-nowrap">
            <span>#{activeTagFilter}</span>
            <button onClick={() => setActiveTagFilter(null)} className="p-0.5 text-zinc-400 hover:text-rose-400 cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Unified View Mode Switcher: Icon-only Linear-grade segmented control matching Desktop */}
        <nav aria-label="Режимы представления" className="flex items-center h-ctrl-sm bg-[#141417] p-0.5 rounded-lg border border-white/[0.08] shadow-inner shrink-0 ml-auto">
          <button
            onClick={() => setFeedViewMode('feed')}
            className={`h-full px-2 rounded-md flex items-center justify-center transition-all cursor-pointer ${
              feedViewMode === 'feed'
                ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
            }`}
            title="Режим стрим-ленты (Лента)"
            aria-label="Режим стрим-ленты"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setFeedViewMode('kanban')}
            className={`h-full px-2 rounded-md flex items-center justify-center transition-all cursor-pointer ${
              feedViewMode === 'kanban'
                ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
            }`}
            title="Канбан-доска задач"
            aria-label="Канбан-доска"
          >
            <Kanban className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setFeedViewMode('calendar')}
            className={`h-full px-2 rounded-md flex items-center justify-center transition-all cursor-pointer ${
              feedViewMode === 'calendar'
                ? 'bg-white/10 text-white shadow-sm border border-white/[0.08]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
            }`}
            title="Календарное расписание (Календарь)"
            aria-label="Календарь"
          >
            <Calendar className="w-3.5 h-3.5" />
          </button>
        </nav>
      </div>

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
                <Composer />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
