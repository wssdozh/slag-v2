// The phone's bottom navigation and its optional capture button.
import React, { useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
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
  hideCapture?: boolean;
}

export const MobileFloatingDock: React.FC<MobileFloatingDockProps> = ({ isVisible = true, hideCapture = false }) => {
  const { activeMobileTab, setActiveMobileTab, mobileDockTabs, openNewNote, currentFolder } = useApp();

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
  }, [updateIndicator, mobileDockTabs, isPresent, hideCapture]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  if (!isPresent) return null;

  return (
    <div
      ref={dockRef}
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      inert={!isVisible}
      className="motion-dock pointer-events-none absolute inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t border-subtle bg-canvas pb-[var(--sab)] pl-[calc(var(--sal)+0.5rem)] pr-[calc(var(--sar)+0.5rem)]"
    >
      <nav
        ref={navRef}
        aria-label="Мобильная навигация"
        className="pointer-events-auto relative flex h-[var(--mobile-tab-dock-height)] min-w-0 flex-1 items-stretch"
      >
        {/* A single moving marker, not a second capsule inside the bar. */}
        {indicatorStyle.ready && (
          <div
            data-testid="dock-active-pill"
            className="pointer-events-none absolute bottom-1.5 left-0 grid justify-items-center transition-[transform,width] duration-200 before:h-0.5 before:w-3 before:rounded-full before:bg-fg-secondary"
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

          return (
            <button
              key={tabId}
              type="button"
              data-tab-id={tabId}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setActiveMobileTab(tabId)}
              className={`motion-press grid min-w-0 flex-1 place-items-center rounded-lg focus-visible:bg-tint-8 active:bg-tint-6 ${
                isActive ? 'text-fg-primary' : 'text-fg-secondary hover:text-fg-primary'
              }`}
              title={tab.label}
              aria-label={tab.label}
            >
              <Icon name={tab.icon} size="lg" tone="inherit" className="transition-colors duration-150" />
            </button>
          );
        })}
      </nav>
      {!hideCapture && (
        <button type="button" onClick={() => openNewNote(currentFolder)} aria-label="Создать новую запись" title="Новая запись"
          className="motion-press pointer-events-auto grid size-12 shrink-0 place-items-center rounded-full bg-accent text-white shadow-2xl shadow-scrim-80 hover:bg-accent-strong focus-visible:bg-accent-strong">
          <Icon name="action.add" size="lg" tone="primary" />
        </button>
      )}
    </div>
  );
};
