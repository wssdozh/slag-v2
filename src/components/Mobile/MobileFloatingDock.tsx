// The floating tab dock at the bottom of the phone shell, with its capture button.
import React, { useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { usePresence } from '../../hooks/ui/usePresence';
import type { MobileTabId } from '../../types';
import { Icon } from '../UI/icons/Icon';
import type { IconName } from '../UI/icons/icons';

interface TabConfig {
  id: MobileTabId;
  label: string;
  icon: IconName;
}

const ALL_TABS: Record<MobileTabId, TabConfig> = {
  folders: { id: 'folders', label: 'Папки', icon: 'entity.folder' },
  tasks: { id: 'tasks', label: 'Таски', icon: 'entity.task' },
  assistant: { id: 'assistant', label: 'ИИ', icon: 'system.ai' },
  settings: { id: 'settings', label: 'Настройки', icon: 'system.settings' },
  calendar: { id: 'calendar', label: 'Календарь', icon: 'time.calendar' },
  audio: { id: 'audio', label: 'Плеер', icon: 'media.music' },
};

export interface MobileFloatingDockProps {
  isVisible?: boolean;
}

export const MobileFloatingDock: React.FC<MobileFloatingDockProps> = ({ isVisible = true }) => {
  const {
    activeMobileTab,
    setActiveMobileTab,
    mobileDockTabs,
    items,
    openNewNote,
    currentFolder
  } = useApp();

  const { ref: dockRef, phase, isPresent, onTransitionEnd } = usePresence(isVisible);
  const navRef = useRef<HTMLElement | null>(null);

  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const updateIndicator = useCallback(() => {
    if (!navRef.current) return;
    const activeBtn = navRef.current.querySelector<HTMLButtonElement>(`[data-tab-id="${activeMobileTab}"]`);
    // A tab can be removed from the dock while it is the active one; never leave
    // the pill hanging over a neighbour it no longer belongs to.
    const next = activeBtn
      ? { left: activeBtn.offsetLeft, width: activeBtn.offsetWidth, ready: true }
      : { left: 0, width: 0, ready: false };
    setIndicatorStyle(current => (current.left === next.left && current.width === next.width && current.ready === next.ready)
      ? current
      : next);
  }, [activeMobileTab]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator, mobileDockTabs]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  const unsortedCount = items.filter(i => i.folder === DEFAULT_INBOX_FOLDER).length;

  const handleFabClick = () => {
    openNewNote(currentFolder);
  };

  if (!isPresent) return null;

  return (
    <div
      ref={dockRef}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      className="fixed left-0 right-0 z-40 pointer-events-none flex items-center justify-center gap-2.5 px-4 motion-dock"
      style={{
        bottom: 'max(var(--sab), 0.75rem)',
      }}
    >
      {/* Main Linear-style Floating Capsule Dock */}
      <nav
        ref={navRef}
        aria-label="Мобильная навигация"
        className="relative pointer-events-auto h-12 bg-surface border border-tint-8 rounded-full px-1.5 py-1 flex items-center gap-1 shadow-2xl shadow-scrim-80"
      >
        {/* Animated sliding capsule indicator */}
        {indicatorStyle.ready && (
          <div
            data-testid="dock-active-pill"
            className="absolute top-1 bottom-1 left-0 rounded-full bg-tint-10 shadow-sm pointer-events-none transition-[transform,width] duration-200"
            style={{
              transform: `translateX(${indicatorStyle.left}px)`,
              width: `${indicatorStyle.width}px`,
              transitionTimingFunction: 'var(--ease-settle)',
            }}
          />
        )}

        {mobileDockTabs.map(tabId => {
          const tab = ALL_TABS[tabId];
          if (!tab) return null;
          const isActive = activeMobileTab === tabId;
          const hasDot = tabId === 'folders' && unsortedCount > 0;

          return (
            <button
              key={tabId}
              data-tab-id={tabId}
              onClick={() => setActiveMobileTab(tabId)}
              className={`relative z-10 h-10 min-w-11 px-3 rounded-full flex items-center justify-center motion-press cursor-pointer ${
                isActive
                  ? `${indicatorStyle.ready ? '' : 'bg-tint-10'} text-white font-medium`
                  : 'text-fg-secondary hover:text-fg-soft hover:bg-tint-4'
              }`}
              title={tab.label}
              aria-label={hasDot ? `${tab.label}, ${unsortedCount} неразобранных записей` : tab.label}
            >
              <div className="relative flex items-center justify-center">
                <Icon
                  name={tab.icon}
                  size="lg"
                  tone={isActive ? 'primary' : 'secondary'}
                  variant={isActive ? 'filled' : 'outline'}
                  className="transition-colors duration-150"
                />
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
        className="pointer-events-auto w-12 h-12 rounded-full bg-surface-elevated border border-tint-12 flex items-center justify-center text-white shadow-2xl shadow-scrim-80 hover:bg-tint-10 motion-press cursor-pointer shrink-0"
        title="Новая запись"
        aria-label="Создать новую запись"
      >
        <Icon name="action.add" size="lg" tone="primary" />
      </button>
    </div>
  );
};
