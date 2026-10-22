import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Folder,
  Inbox,
  Sparkles,
  PanelRight,
  CheckSquare,
  FileText,
  StickyNote,
  X,
  Kanban,
  Calendar,
  Layers,
  Filter
} from 'lucide-react';

interface FeedHeaderProps {
  onToggleLayout?: () => void;
  layoutMode?: 'dockview' | 'classic';
}

export const FeedHeader: React.FC<FeedHeaderProps> = ({ onToggleLayout, layoutMode = 'classic' }) => {
  const {
    currentFolder,
    inboxMode,
    setInboxMode,
    feedViewMode,
    setFeedViewMode,
    folders,
    filteredItems,
    activeTypeFilter,
    setActiveTypeFilter,
    activeTagFilter,
    setActiveTagFilter,
    aiItemFilter,
    clearAiFilter,
    isRightPanelOpen,
    setIsRightPanelOpen
  } = useApp();

  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';

  return (
    <header className="h-12 px-4 border-b border-white/[0.06] bg-[#0c0c0e] flex items-center justify-between gap-3 select-none shrink-0">
      {/* Folder Breadcrumb & Title */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        {isInbox ? (
          <Inbox className="w-4 h-4 text-zinc-300 shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-zinc-400 shrink-0" />
        )}
        <h2 className="text-xs font-semibold text-zinc-100 tracking-tight shrink-0">
          {folderMeta?.name || currentFolder}
        </h2>
        <span className="text-[11px] font-mono text-zinc-500 shrink-0">
          ({filteredItems.length})
        </span>

        {/* Inbox Sub-mode Filter (SPEC §8.2) - only in feed mode */}
        {isInbox && feedViewMode === 'feed' && (
          <div className="flex items-center bg-white/[0.03] p-0.5 rounded-md border border-white/[0.04] ml-1.5 shrink-0">
            <button
              onClick={() => setInboxMode('unsorted')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                inboxMode === 'unsorted'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Только неразобранные заметки во Входящих"
            >
              Неразобранные
            </button>
            <button
              onClick={() => setInboxMode('all')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                inboxMode === 'all'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Все заметки хранилища сквозным списком"
            >
              Все
            </button>
            <button
              onClick={() => setInboxMode('sorted')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                inboxMode === 'sorted'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Только распределенные по папкам"
            >
              Разобранные
            </button>
          </div>
        )}

        {/* AI Filter Chip when Assistant filtered the feed */}
        {aiItemFilter && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-mono shrink-0">
            <Filter className="w-2.5 h-2.5 text-blue-400" />
            <span className="truncate max-w-[140px]">ИИ: "{aiItemFilter.queryLabel}" ({aiItemFilter.itemIds.length})</span>
            <button
              onClick={clearAiFilter}
              className="p-0.5 hover:text-white transition-colors"
              title="Сбросить фильтр ИИ"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}

        {/* Tag filter chip if active (feed mode only) */}
        {activeTagFilter && feedViewMode === 'feed' && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px] font-mono shrink-0">
            <span>#{activeTagFilter}</span>
            <button
              onClick={() => setActiveTagFilter(null)}
              className="p-0.5 hover:text-rose-400 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>

      {/* Center / Right Controls */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {/* Unified View Mode Switcher: [ 📜 Лента | 📋 Канбан | 📅 Календарь | ✨ Ассистент ] */}
        <div className="flex items-center bg-white/[0.03] p-0.5 rounded-md border border-white/[0.04] shrink-0">
          <button
            onClick={() => setFeedViewMode('feed')}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
              feedViewMode === 'feed'
                ? 'bg-white/10 text-white font-medium shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Стрим-лента записей"
          >
            <Layers className="w-3 h-3" />
            <span className="hidden sm:inline">Лента</span>
          </button>
          <button
            onClick={() => setFeedViewMode('kanban')}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
              feedViewMode === 'kanban'
                ? 'bg-white/10 text-white font-medium shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Канбан-доска задач"
          >
            <Kanban className="w-3 h-3" />
            <span className="hidden 2xl:inline">Канбан</span>
          </button>
          <button
            onClick={() => setFeedViewMode('calendar')}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
              feedViewMode === 'calendar'
                ? 'bg-white/10 text-white font-medium shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Календарь дедлайнов"
          >
            <Calendar className="w-3 h-3" />
            <span className="hidden 2xl:inline">Календарь</span>
          </button>
          <button
            onClick={() => setFeedViewMode('assistant')}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] transition-colors ${
              feedViewMode === 'assistant'
                ? 'bg-white/10 text-white font-medium shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Полноэкранный Ассистент"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span className="hidden 2xl:inline">Ассистент</span>
          </button>
        </div>

        {/* Type filters (feed mode only) */}
        {feedViewMode === 'feed' && (
          <div className="flex items-center bg-white/[0.03] p-0.5 rounded-md border border-white/[0.04] shrink-0">
            <button
              onClick={() => setActiveTypeFilter('all')}
              className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                activeTypeFilter === 'all'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Все типы записей"
            >
              Все
            </button>
            <button
              onClick={() => setActiveTypeFilter('note')}
              className={`p-1 rounded text-[11px] flex items-center transition-colors ${
                activeTypeFilter === 'note'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Только заметки"
            >
              <StickyNote className="w-3 h-3 text-zinc-400" />
            </button>
            <button
              onClick={() => setActiveTypeFilter('task')}
              className={`p-1 rounded text-[11px] flex items-center transition-colors ${
                activeTypeFilter === 'task'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Только таски"
            >
              <CheckSquare className="w-3 h-3 text-amber-400" />
            </button>
            <button
              onClick={() => setActiveTypeFilter('article')}
              className={`p-1 rounded text-[11px] flex items-center transition-colors ${
                activeTypeFilter === 'article'
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Только статьи"
            >
              <FileText className="w-3 h-3 text-blue-400" />
            </button>
          </div>
        )}

        {/* Toggle Right Panel (opens assistant or info) */}
        <button
          onClick={() => {
            if (!isRightPanelOpen) {
              setIsRightPanelOpen(true);
            } else {
              setIsRightPanelOpen(false);
            }
          }}
          className={`p-1.5 rounded transition-colors shrink-0 ${
            isRightPanelOpen
              ? 'text-white bg-white/10'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
          }`}
          title="Инфо-панель и Ассистент (⌘J / Ctrl+J)"
        >
          <PanelRight className="w-4 h-4" />
        </button>

        {/* Toggle Layout Engine between Dockview Composite Grid and Classic Fixed 3-Column */}
        {onToggleLayout && (
          <button
            onClick={onToggleLayout}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors shrink-0 flex items-center gap-1 ${
              layoutMode === 'dockview'
                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Переключить режим компоновки: Композитная IDE-сетка (Dockview) / Фиксированный (⌘.)"
          >
            <span>{layoutMode === 'dockview' ? '🪟 Сетка' : '📑 Фикс'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
