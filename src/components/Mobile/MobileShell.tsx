import React, { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { MobileFoldersView } from './MobileFoldersView';
import { MobileTasksView } from './MobileTasksView';
import { MobileAssistantView } from './MobileAssistantView';
import { MobileSettingsView } from './MobileSettingsView';
import { MobileCalendarView } from './MobileCalendarView';
import { MobileAudioView } from './MobileAudioView';
import { MobileFolderInfoView } from './MobileFolderInfoView';
import { MobileFloatingDock } from './MobileFloatingDock';

/** Ширина левой кромки, с которой начинается edge-swipe назад. */
const EDGE_SWIPE_WIDTH = 28;
/** Минимальный горизонтальный ход, чтобы считать жест свайпом назад. */
const SWIPE_DISTANCE = 64;

export const MobileShell: React.FC = () => {
  const {
    activeMobileTab,
    setActiveMobileTab,
    mobileActiveFolder,
    setMobileActiveFolder,
    mobileFolderInfoOpen
  } = useApp();

  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // Show floating dock when at the root level of tabs (not deep in a folder's feed, and not in assistant)
  const isInsideFolderFeed = activeMobileTab === 'folders' && mobileActiveFolder !== null;
  const isFloatingDockVisible = !isInsideFolderFeed && activeMobileTab !== 'assistant';

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    swipeStart.current = null;
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    if (touch.clientX > EDGE_SWIPE_WIDTH) return;

    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('[data-swipe-ignore], .overflow-x-auto, input, textarea, [contenteditable="true"]')
    ) {
      return;
    }

    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx <= SWIPE_DISTANCE || dx <= Math.abs(dy) * 1.5) return;

    if (activeMobileTab === 'folders') {
      // Корень папок — выше некуда, свайп ничего не делает.
      if (!mobileActiveFolder) return;
      if (mobileActiveFolder.includes('/')) {
        setMobileActiveFolder(mobileActiveFolder.substring(0, mobileActiveFolder.lastIndexOf('/')));
      } else {
        setMobileActiveFolder(null);
      }
      return;
    }

    // У tasks и calendar свои горизонтальные жесты — их не перехватываем.
    if (
      activeMobileTab === 'assistant' ||
      activeMobileTab === 'settings' ||
      activeMobileTab === 'audio'
    ) {
      setActiveMobileTab('folders');
    }
  };

  const handleTouchCancel = () => {
    swipeStart.current = null;
  };

  return (
    <div className="w-full h-full flex flex-col bg-canvas text-fg-primary overflow-hidden relative">
      {/* Active Tab Screen */}
      <main
        className="flex-1 min-h-0 flex flex-col overflow-hidden relative mobile-screen-view"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {activeMobileTab === 'folders' && <MobileFoldersView />}
        {activeMobileTab === 'tasks' && <MobileTasksView />}
        {activeMobileTab === 'assistant' && <MobileAssistantView />}
        {activeMobileTab === 'settings' && <MobileSettingsView />}
        {activeMobileTab === 'calendar' && <MobileCalendarView />}
        {activeMobileTab === 'audio' && <MobileAudioView />}
      </main>

      {/* Floating Linear Island Dock (Smooth presence transition on root views) */}
      <MobileFloatingDock isVisible={isFloatingDockVisible} />

      {/* Fullscreen Slide-over Folder Info & Media Profile */}
      {mobileFolderInfoOpen && <MobileFolderInfoView />}
    </div>
  );
};
