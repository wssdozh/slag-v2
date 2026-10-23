import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { FeedList } from '../Feed/FeedList';
import { Composer } from '../Feed/Composer';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  ArrowLeft,
  Info,
  Search,
  Inbox,
  Plus
} from 'lucide-react';
import { FOLDER_ICONS } from '../Sidebar/folderIcons';

export const MobileFoldersView: React.FC = () => {
  const {
    folders,
    items,
    mobileActiveFolder,
    setMobileActiveFolder,
    setMobileFolderInfoOpen,
    setIsSearchOpen,
    openCreateFolderModal
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
        <header
          className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-4 flex items-center justify-between shrink-0"
          style={{ paddingTop: 'max(var(--sat), 0px)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center font-mono font-bold text-xs text-white">
              S
            </div>
            <h1 className="text-base font-bold text-white tracking-tight">Заметки</h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="w-10 h-10 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Поиск"
              aria-label="Поиск"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => openCreateFolderModal()}
              className="w-10 h-10 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              title="Новая папка"
              aria-label="Новая папка"
            >
              <FolderPlus className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Scrollable Root Folders List */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-24">
          {/* Pinned "Входящие" Card */}
          <button
            onClick={() => setMobileActiveFolder('Входящие')}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#141417]/90 hover:bg-[#18181c] border border-white/[0.06] active:scale-[0.98] transition-all text-left shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <Inbox className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">Входящие</div>
                <div className="text-xs text-zinc-500 font-mono">
                  Все новые заметки и мысли
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {unsortedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-mono font-medium">
                  {unsortedCount}
                </span>
              )}
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </div>
          </button>

          {/* User Folders Group */}
          <div className="flex flex-col gap-1.5 mt-2">
            <div className="px-1 text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              Папки
            </div>

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
                    className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#141417]/70 hover:bg-[#18181c] border border-white/[0.05] active:scale-[0.98] transition-all text-left shadow-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-300 shrink-0">
                        <Icon className="w-5 h-5 text-zinc-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-200 truncate">{folder.name}</div>
                        <div className="text-xs text-zinc-500 font-mono truncate">
                          {subCount > 0 ? `${subCount} подпап. • ` : ''}
                          {folderItemsCount} {folderItemsCount === 1 ? 'запись' : folderItemsCount < 5 ? 'записи' : 'записей'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </div>
                  </button>
                );
              })}
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
      <header
        className="h-14 border-b border-white/[0.06] bg-[#0c0c0e]/95 backdrop-blur-md px-3 flex items-center justify-between shrink-0 z-20"
        style={{ paddingTop: 'max(var(--sat), 0px)' }}
      >
        <button
          onClick={handleBack}
          className="h-10 px-2 rounded-lg text-zinc-400 hover:text-white flex items-center gap-1 text-sm active:scale-95 transition-all cursor-pointer"
          title="Назад к списку папок"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="max-w-[90px] truncate">
            {mobileActiveFolder.includes('/')
              ? mobileActiveFolder.split('/')[mobileActiveFolder.split('/').length - 2]
              : 'Папки'}
          </span>
        </button>

        {/* Center Title */}
        <div className="flex flex-col items-center min-w-0 px-2">
          <span className="text-sm font-bold text-white truncate max-w-[160px]">
            {activeMeta?.name || mobileActiveFolder}
          </span>
          <span className="text-[10px] font-mono text-zinc-500">
            {isInbox ? 'Лента входящих' : mobileActiveFolder}
          </span>
        </div>

        {/* Right Info Button */}
        <button
          onClick={() => setMobileFolderInfoOpen(true)}
          className="w-10 h-10 rounded-full hover:bg-white/[0.06] text-zinc-400 hover:text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer"
          title="Инфо папки и медиа"
          aria-label="Информация о папке"
        >
          <Info className="w-5 h-5" />
        </button>
      </header>

      {/* Subfolders Quick Ribbon (If folder has subfolders) */}
      {directSubfolders.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04] bg-[#0c0c0e]/60 overflow-x-auto scrollbar-none shrink-0 z-10">
          {directSubfolders.map(sub => {
            const subItemsCount = items.filter(i => i.folder === sub.path).length;
            return (
              <button
                key={sub.path}
                onClick={() => setMobileActiveFolder(sub.path)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-zinc-300 shrink-0 active:scale-95 transition-all cursor-pointer"
              >
                <Folder className="w-3.5 h-3.5 text-zinc-400" />
                <span>{sub.name}</span>
                <span className="text-[10px] font-mono text-zinc-500">({subItemsCount})</span>
              </button>
            );
          })}
          <button
            onClick={() => openCreateFolderModal(mobileActiveFolder)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-dashed border-white/[0.1] text-xs text-zinc-400 shrink-0 cursor-pointer"
            title="Создать подпапку"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Подпапка</span>
          </button>
        </div>
      )}

      {/* Feed List Container */}
      <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        <FeedList />

        {/* Telegram-style Composer Island at the bottom of the feed */}
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none z-20 pb-2 px-2 flex justify-center"
          style={{
            transform: `translateY(calc(-1 * var(--keyboard-inset-bottom, 0px)))`,
            transition: 'transform 100ms ease-out',
          }}
        >
          <div className="pointer-events-auto w-full max-w-lg">
            <Composer />
          </div>
        </div>
      </div>
    </div>
  );
};
