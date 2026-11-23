// The phone shell: which tab is on screen, and the edge swipe that goes back.
import { useRef, type TouchEvent } from 'react';
import { AppContext, useApp } from '../../context/AppContext';
import { useFeedBackSwipe } from '../../hooks/gestures/useFeedBackSwipe';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { AudioPanel } from '../Audio/AudioPanel';
import { MobileAssistantView } from './MobileAssistantView';
import { MobileCalendarView } from './MobileCalendarView';
import { MobileFloatingDock } from './MobileFloatingDock';
import { MobileFolderInfoView } from './MobileFolderInfoView';
import { MobileFolderRoot } from './MobileFolderRoot';
import { MobileFoldersView } from './MobileFoldersView';
import { MobileSettingsView } from './MobileSettingsView';
import { MobileTasksView } from './MobileTasksView';

const EDGE_SWIPE_WIDTH = 28;
const SWIPE_DISTANCE = 64;

export function MobileShell() {
  const app = useApp();
  const { activeMobileTab, mobileFolderInfoOpen, dismissTopLayer, isMobileFolderOpen, currentFolder,
    isMobileFolderPickerOpen, feedViewMode, goBackFromMobileFolder } = app;
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const folderTab = activeMobileTab === 'folders';
  const folderFeed = folderTab && isMobileFolderOpen && feedViewMode === 'feed';
  const canDragBack = folderFeed && !mobileFolderInfoOpen && !isMobileFolderPickerOpen &&
    !app.mobileActionSheetItem && !app.isSearchOpen && !app.isFullscreenEditorOpen && !app.contextMenu && !app.attachSheet;
  const { screenRef, preview } = useFeedBackSwipe(canDragBack, goBackFromMobileFolder);
  const parent = currentFolder.slice(0, Math.max(0, currentFolder.lastIndexOf('/')));
  const parentView = app.folderSettings[parent];
  const isDockVisible = activeMobileTab !== 'assistant' && !(folderTab && isMobileFolderOpen) && !mobileFolderInfoOpen;

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    swipeStart.current = null;
    if (folderFeed || event.touches.length !== 1) return;
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
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-canvas text-fg-primary [--mobile-tab-dock-height:3rem]">
      {preview && (
        <div inert aria-hidden="true" data-testid="folder-back-preview" className="pointer-events-none absolute inset-0 isolate flex flex-col overflow-hidden">
          {parent ? (
            <AppContext.Provider value={{ ...app, currentFolder: parent, feedViewMode: parentView?.viewMode ?? 'feed',
              inboxMode: parentView?.inboxMode ?? (parent === DEFAULT_INBOX_FOLDER ? 'all' : app.inboxMode),
              activeTypeFilter: parentView?.typeFilter ?? 'all', sortBy: parentView?.sortBy ?? 'createdAt', sortOrder: parentView?.sortOrder ?? 'asc',
              activeTagFilter: null, aiItemFilter: null, isPinnedOnlyFilter: false, hideCompletedTasks: false, highlightedItemId: null }}>
              <MobileFoldersView preview />
            </AppContext.Provider>
          ) : <><MobileFolderRoot /><MobileFloatingDock /></>}
        </div>
      )}
      <main ref={screenRef} inert={mobileFolderInfoOpen} data-feed-back-swipe={canDragBack || undefined}
        className="mobile-screen-view relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas data-[feed-back-swipe=true]:[&_:is([data-testid=feed-list-container],[data-testid=pinned-banner])]:[touch-action:pan-y_pinch-zoom]"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { swipeStart.current = null; }}>
        {folderTab && (isMobileFolderOpen ? <MobileFoldersView /> : <MobileFolderRoot />)}
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
      <MobileFloatingDock isVisible={isDockVisible} />
      {mobileFolderInfoOpen && <MobileFolderInfoView />}
    </div>
  );
}
