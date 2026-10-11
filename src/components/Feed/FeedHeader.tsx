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
  X
} from 'lucide-react';

export const FeedHeader: React.FC = () => {
  const {
    currentFolder,
    folders,
    filteredItems,
    items,
    activeTypeFilter,
    setActiveTypeFilter,
    activeTagFilter,
    setActiveTagFilter,
    isRightPanelOpen,
    setIsRightPanelOpen,
    setIsTriageModalOpen,
  } = useApp();

  const folderMeta = folders.find(f => f.path === currentFolder);
  const isInbox = currentFolder === 'Входящие';
  const inboxUnsortedCount = items.filter(i => i.folder === 'Входящие').length;

  return (
    <header className="h-12 px-4 border-b border-white/[0.06] bg-[#0c0c0e] flex items-center justify-between gap-3 select-none shrink-0">
      {/* Folder Breadcrumb & Title */}
      <div className="flex items-center gap-2 min-w-0">
        {isInbox ? (
          <Inbox className="w-4 h-4 text-zinc-300 shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-zinc-400 shrink-0" />
        )}
        <h2 className="text-xs font-semibold text-zinc-100 tracking-tight truncate">
          {folderMeta?.name || currentFolder}
        </h2>
        <span className="text-[11px] font-mono text-zinc-500">
          ({filteredItems.length})
        </span>

        {/* Tag filter chip if active */}
        {activeTagFilter && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 text-white text-[10px] font-mono">
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
      <div className="flex items-center gap-2">
        {/* Type filters */}
        <div className="flex items-center bg-white/[0.03] p-0.5 rounded-md border border-white/[0.04]">
          <button
            onClick={() => setActiveTypeFilter('all')}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              activeTypeFilter === 'all'
                ? 'bg-white/10 text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Все
          </button>
          <button
            onClick={() => setActiveTypeFilter('note')}
            className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
              activeTypeFilter === 'note'
                ? 'bg-white/10 text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <StickyNote className="w-3 h-3" />
            <span>Заметки</span>
          </button>
          <button
            onClick={() => setActiveTypeFilter('task')}
            className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
              activeTypeFilter === 'task'
                ? 'bg-white/10 text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CheckSquare className="w-3 h-3" />
            <span>Таски</span>
          </button>
          <button
            onClick={() => setActiveTypeFilter('article')}
            className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 transition-colors ${
              activeTypeFilter === 'article'
                ? 'bg-white/10 text-white font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Статьи</span>
          </button>
        </div>

        {/* AI Triage button for Inbox */}
        {isInbox && inboxUnsortedCount > 0 && (
          <button
            onClick={() => setIsTriageModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-medium transition-colors border border-white/[0.08]"
            title="Автоматически распределить заметки по смыслу в подходящие папки"
          >
            <Sparkles className="w-3.5 h-3.5 text-zinc-200" />
            <span>AI Triage</span>
            <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] font-mono flex items-center justify-center">
              {inboxUnsortedCount}
            </span>
          </button>
        )}

        {/* Toggle Right Folder Info Panel */}
        <button
          onClick={() => setIsRightPanelOpen(prev => !prev)}
          className={`p-1.5 rounded transition-colors ${
            isRightPanelOpen
              ? 'text-white bg-white/10'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
          }`}
          title="Информация о папке и медиа"
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
