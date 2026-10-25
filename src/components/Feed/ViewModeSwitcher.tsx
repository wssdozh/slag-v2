import React from 'react';
import { useApp } from '../../context/AppContext';
import { Layers, Kanban, Calendar } from 'lucide-react';

export interface ViewModeSwitcherProps {
  className?: string;
}

export const ViewModeSwitcher: React.FC<ViewModeSwitcherProps> = ({ className = '' }) => {
  const { feedViewMode, setFeedViewMode } = useApp();

  return (
    <nav
      aria-label="Режимы представления"
      className={`flex items-center h-ctrl-sm gap-0.5 shrink-0 ${className}`}
    >
      <button
        type="button"
        onClick={() => setFeedViewMode('feed')}
        className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          feedViewMode === 'feed'
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
        onClick={() => setFeedViewMode('kanban')}
        className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          feedViewMode === 'kanban'
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
        onClick={() => setFeedViewMode('calendar')}
        className={`h-full px-2 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          feedViewMode === 'calendar'
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
