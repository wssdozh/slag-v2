// The phone shell: which tab is on screen, and the edge swipe that goes back.
import { useRef, type TouchEvent } from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { AudioPanel } from '../Audio/AudioPanel';
import { MobileAssistantView } from './MobileAssistantView';
import { MobileCalendarView } from './MobileCalendarView';
import { MobileFloatingDock } from './MobileFloatingDock';
import { MobileFolderInfoView } from './MobileFolderInfoView';
import { MobileFoldersView } from './MobileFoldersView';
import { MobileSettingsView } from './MobileSettingsView';
import { MobileTasksView } from './MobileTasksView';

const EDGE_SWIPE_WIDTH = 28;
const SWIPE_DISTANCE = 64;

export function MobileShell() {
  const { activeMobileTab, mobileFolderInfoOpen, dismissTopLayer, currentFolder, isMobileFolderPickerOpen, feedViewMode } = useApp();
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const folderTab = activeMobileTab === 'folders';
  const inInbox = folderTab && currentFolder === DEFAULT_INBOX_FOLDER;
  const isDockVisible = activeMobileTab !== 'assistant' && (!folderTab || inInbox) && !isMobileFolderPickerOpen && !mobileFolderInfoOpen;

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    swipeStart.current = null;
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (touch.clientX > EDGE_SWIPE_WIDTH) return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-swipe-ignore], .overflow-x-auto, input, textarea, [contenteditable="true"]')) return;
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx <= SWIPE_DISTANCE || dx <= Math.abs(dy) * 1.5) return;
    // Tasks and calendar handle their own horizontal gestures.
    if (activeMobileTab === 'tasks' || activeMobileTab === 'calendar') return;
    dismissTopLayer();
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-canvas text-fg-primary [--mobile-tab-dock-height:3rem] [--mobile-tab-dock-reserve:calc(var(--mobile-tab-dock-height)+var(--sab)+1px)]">
      <main inert={mobileFolderInfoOpen} className={`mobile-screen-view relative flex min-h-0 flex-1 flex-col overflow-hidden ${inInbox ? 'mb-[var(--mobile-tab-dock-reserve)] [--folder-composer-safe-bottom:0px]' : ''}`}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { swipeStart.current = null; }}>
        {folderTab && <MobileFoldersView />}
        {activeMobileTab === 'tasks' && <MobileTasksView />}
        {activeMobileTab === 'assistant' && <MobileAssistantView />}
        {activeMobileTab === 'settings' && <MobileSettingsView />}
        {activeMobileTab === 'calendar' && <MobileCalendarView />}
        {activeMobileTab === 'audio' && (
          <div className="flex flex-1 flex-col overflow-hidden bg-canvas pt-[max(var(--sat),0px)] text-fg-primary select-none">
            <AudioPanel />
          </div>
        )}
      </main>
      <MobileFloatingDock isVisible={isDockVisible} hideCapture={inInbox && feedViewMode === 'feed'} />
      {mobileFolderInfoOpen && <MobileFolderInfoView />}
    </div>
  );
}
