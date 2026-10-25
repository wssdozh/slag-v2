import React from 'react';
import { useApp } from '../../context/AppContext';
import { Layers, Kanban, Calendar } from 'lucide-react';
import type { FeedViewMode } from '../../types';

export interface ViewModeSwitcherProps {
  className?: string;
  viewMode?: FeedViewMode;
  onViewModeChange?: (mode: FeedViewMode) => void;
}

export const ViewModeSwitcher: React.FC<ViewModeSwitcherProps> = ({
  className = '',
  viewMode: controlledViewMode,
  onViewModeChange,
}) => {
  const { feedViewMode: contextViewMode, setFeedViewMode } = useApp();
  const activeViewMode = controlledViewMode ?? contextViewMode;
  const handleViewModeChange = onViewModeChange ?? setFeedViewMode;

  return (
    <nav
      aria-label="Режимы представления"
      className={`flex items-center h-ctrl-sm gap-0.5 shrink-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => handleViewModeChange('feed')}
        className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          activeViewMode === 'feed'
            ? 'bg-white/10 text-white'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
        }`}
        title="Лента записей"
        aria-label="Режим ленты"
      >
        <Layers className="w-3.5 h-3.5 shrink-0" />
      </button>
      <button
        type="button"
        onClick={() => handleViewModeChange('kanban')}
        className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          activeViewMode === 'kanban'
            ? 'bg-white/10 text-white'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
        }`}
        title="Канбан-доска задач"
        aria-label="Канбан-доска"
      >
        <Kanban className="w-3.5 h-3.5 shrink-0" />
      </button>
      <button
        type="button"
        onClick={() => handleViewModeChange('calendar')}
        className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          activeViewMode === 'calendar'
            ? 'bg-white/10 text-white'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
        }`}
        title="Календарь дедлайнов"
        aria-label="Календарь"
      >
        <Calendar className="w-3.5 h-3.5 shrink-0" />
      </button>
    </nav>
  );
};
