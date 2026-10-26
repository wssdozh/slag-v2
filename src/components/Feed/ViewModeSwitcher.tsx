import React from 'react';
import { useApp } from '../../context/AppContext';
import { Layers, Kanban, Calendar } from 'lucide-react';
import type { FeedViewMode } from '../../types';
import { ResponsiveSegmented, type SegmentedOption } from '../UI/ResponsiveSegmented';

export interface ViewModeSwitcherProps {
  className?: string;
  viewMode?: FeedViewMode;
  onViewModeChange?: (mode: FeedViewMode) => void;
  compact?: boolean;
}

export const ViewModeSwitcher: React.FC<ViewModeSwitcherProps> = ({
  className = '',
  viewMode: controlledViewMode,
  onViewModeChange,
  compact = false,
}) => {
  const { feedViewMode: contextViewMode, setFeedViewMode } = useApp();
  const activeViewMode = controlledViewMode ?? contextViewMode;
  const handleViewModeChange = onViewModeChange ?? setFeedViewMode;

  const viewOptions: SegmentedOption<FeedViewMode>[] = [
    {
      value: 'feed',
      label: 'Лента',
      icon: <Layers className="w-3.5 h-3.5 shrink-0" />,
      title: 'Лента записей',
      ariaLabel: 'Режим ленты',
    },
    {
      value: 'kanban',
      label: 'Канбан',
      icon: <Kanban className="w-3.5 h-3.5 shrink-0" />,
      title: 'Канбан-доска задач',
      ariaLabel: 'Канбан-доска',
    },
    {
      value: 'calendar',
      label: 'Календарь',
      icon: <Calendar className="w-3.5 h-3.5 shrink-0" />,
      title: 'Календарь дедлайнов',
      ariaLabel: 'Календарь',
    },
  ];

  return (
    <nav
      aria-label="Режимы представления"
      className={`flex items-center shrink-0 ${className}`}
    >
      <ResponsiveSegmented<FeedViewMode>
        value={activeViewMode}
        onChange={handleViewModeChange}
        options={viewOptions}
        compact={compact}
        ariaLabel="Режимы представления"
      />
    </nav>
  );
};
