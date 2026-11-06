import React from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import type { MobileTabId } from '../../types';
import {
  Folder,
  CheckSquare,
  Sparkles,
  Settings,
  Calendar,
  Music,
  Plus
} from 'lucide-react';

interface TabConfig {
  id: MobileTabId;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const ALL_TABS: Record<MobileTabId, TabConfig> = {
  folders: { id: 'folders', label: 'Папки', icon: Folder },
  tasks: { id: 'tasks', label: 'Таски', icon: CheckSquare },
  assistant: { id: 'assistant', label: 'ИИ', icon: Sparkles },
  settings: { id: 'settings', label: 'Настройки', icon: Settings },
  calendar: { id: 'calendar', label: 'Календарь', icon: Calendar },
  audio: { id: 'audio', label: 'Плеер', icon: Music },
};

export const MobileFloatingDock: React.FC = () => {
  const {
    activeMobileTab,
    setActiveMobileTab,
    mobileDockTabs,
    items,
    openNewNote,
    currentFolder
  } = useApp();

  const unsortedCount = items.filter(i => i.folder === DEFAULT_INBOX_FOLDER).length;

  const handleFabClick = () => {
    openNewNote(currentFolder);
  };

  return (
    <div
      className="fixed left-0 right-0 z-40 pointer-events-none flex items-center justify-center gap-2.5 px-4"
      style={{
        bottom: 'max(var(--sab), 0.75rem)',
      }}
    >
      {/* Main Linear-style Floating Capsule Dock */}
      <nav
        aria-label="Мобильная навигация"
        className="pointer-events-auto h-12 bg-surface/92 backdrop-blur-xl border border-white/[0.08] rounded-full px-1.5 py-1 flex items-center gap-1 shadow-2xl shadow-black/80"
      >
        {mobileDockTabs.map(tabId => {
          const tab = ALL_TABS[tabId];
          if (!tab) return null;
          const Icon = tab.icon;
          const isActive = activeMobileTab === tabId;
          const hasDot = tabId === 'folders' && unsortedCount > 0;

          return (
            <button
              key={tabId}
              onClick={() => setActiveMobileTab(tabId)}
              className={`relative h-10 min-w-11 px-3 rounded-full flex items-center justify-center motion-press cursor-pointer ${
                isActive
                  ? 'bg-white/10 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
              title={tab.label}
              aria-label={hasDot ? `${tab.label}, ${unsortedCount} неразобранных записей` : tab.label}
            >
              <div className="relative flex items-center justify-center">
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                {hasDot && (
                  <span
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-surface"
                    title={`${unsortedCount} неразобранных записей`}
                  />
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Floating Action Button (FAB) matching Linear circular pill */}
      <button
        onClick={handleFabClick}
        className="pointer-events-auto w-12 h-12 rounded-full bg-surface-elevated/95 backdrop-blur-xl border border-white/[0.12] flex items-center justify-center text-white shadow-2xl shadow-black/80 hover:bg-white/10 motion-press cursor-pointer shrink-0"
        title="Новая запись"
        aria-label="Создать новую запись"
      >
        <Plus className="w-5 h-5 text-white" />
      </button>
    </div>
  );
};
