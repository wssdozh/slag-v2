import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { MobileTabId, SlagItem, WorkspaceState } from '../../types';
import { STORAGE_KEYS, UI_BREAKPOINTS } from '../../config';

export const DEFAULT_MOBILE_DOCK_TABS: MobileTabId[] = ['folders', 'tasks', 'assistant', 'settings'];
import { useIsMobile } from '../../hooks/layout/useIsMobile';
import { isDesktopApp, isMobilePlatform } from '../../lib/platform/windowControls';
import { swapScreen, type ScreenSwap } from '../../lib/motion';

const MOBILE_DOCK_TABS_KEY = STORAGE_KEYS.MOBILE_DOCK_TABS;

/**
 * Which mobile surface is showing, and how we got there.
 *
 * Tabs are peers (cross-fade or directional slide), entering a folder is a push,
 * leaving is a pop. The depth and the active tab live in refs so the setters stay
 * stable for the dock and for Escape. Nothing here knows about notes: the one
 * thing it cannot own is the folder the app is on, so the caller passes it in.
 */
export function useMobileNav(
  initialWorkspace: WorkspaceState,
  onSelectFolder: (folder: string) => void,
) {
  // Desktop and standalone popouts never default to the phone layout.
  const isMobileScreen = useIsMobile(UI_BREAKPOINTS.MOBILE);
  const [forceMobileMode, setForceMobileMode] = useState<boolean | null>(null);
  const isDesktop = isDesktopApp();
  const isStandalone =
    typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('panel'));
  const isMobile = !isStandalone && (forceMobileMode !== null ? forceMobileMode : (isMobilePlatform() || (!isDesktop && isMobileScreen)));

  const toggleMobileMode = useCallback(() => {
    setForceMobileMode((prev) => {
      if (prev === null) return !isMobileScreen;
      return !prev;
    });
  }, [isMobileScreen]);

  const [activeMobileTab, setActiveMobileTabState] = useState<MobileTabId>(() => initialWorkspace.activeMobileTab || 'folders');
  const [mobileActiveFolder, setMobileActiveFolderState] = useState<string | null>(null);
  const [mobileFolderInfoOpen, setMobileFolderInfoOpenState] = useState<boolean>(false);
  const [mobileActionSheetItem, setMobileActionSheetItem] = useState<SlagItem | null>(null);
  const [mobileDockTabs, setMobileDockTabsState] = useState<MobileTabId[]>(() => {
    try {
      const saved = localStorage.getItem(MOBILE_DOCK_TABS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return DEFAULT_MOBILE_DOCK_TABS;
  });

  const setMobileDockTabs = useCallback((tabs: MobileTabId[]) => {
    setMobileDockTabsState(tabs);
    try {
      localStorage.setItem(MOBILE_DOCK_TABS_KEY, JSON.stringify(tabs));
    } catch {
      // Ignore
    }
  }, []);

  const mobileFolderRef = useRef<string | null>(null);
  const activeTabRef = useRef<MobileTabId>(initialWorkspace.activeMobileTab || 'folders');
  useEffect(() => {
    activeTabRef.current = activeMobileTab;
  }, [activeMobileTab]);

  const folderDepth = (path: string | null) => (path ? path.split('/').length : 0);

  const setActiveMobileTab = useCallback((next: React.SetStateAction<MobileTabId>) => {
    const prev = activeTabRef.current;
    const resolvedNext = typeof next === 'function' ? next(prev) : next;
    const prevIdx = mobileDockTabs.indexOf(prev);
    const nextIdx = mobileDockTabs.indexOf(resolvedNext);
    const kind: ScreenSwap =
      prevIdx !== -1 && nextIdx !== -1 && prevIdx !== nextIdx
        ? nextIdx > prevIdx ? 'tab-next' : 'tab-prev'
        : 'tab';

    swapScreen(kind, () => setActiveMobileTabState(resolvedNext));
  }, [mobileDockTabs]);

  const setMobileActiveFolder = useCallback((folder: string | null) => {
    const previous = mobileFolderRef.current;
    mobileFolderRef.current = folder;
    // Depth decides the direction: deeper is a push, shallower a pop, and a sibling
    // folder is a lateral move, not a step back.
    const previousDepth = previous === null ? 0 : folderDepth(previous);
    const nextDepth = folder === null ? 0 : folderDepth(folder);
    const kind: ScreenSwap =
      folder === null || nextDepth < previousDepth
        ? 'pop'
        : previous === null || nextDepth > previousDepth
          ? 'push'
          : 'tab';
    swapScreen(kind, () => {
      setMobileActiveFolderState(folder);
      if (folder) onSelectFolder(folder);
    });
  }, [onSelectFolder]);

  /** A renamed folder leaves the phone on a path that no longer exists: follow the move. */
  const remapMobileFolder = useCallback((remap: (path: string | null) => string | null) => {
    setMobileActiveFolderState((previous) => remap(previous));
    mobileFolderRef.current = remap(mobileFolderRef.current);
  }, []);

  const setMobileFolderInfoOpen = useCallback((open: boolean) => {
    swapScreen(open ? 'push' : 'pop', () => setMobileFolderInfoOpenState(open));
  }, []);

  return {
    isMobile,
    forceMobileMode,
    toggleMobileMode,
    activeMobileTab,
    setActiveMobileTab,
    mobileActiveFolder,
    setMobileActiveFolder,
    mobileFolderInfoOpen,
    setMobileFolderInfoOpen,
    remapMobileFolder,
    mobileActionSheetItem,
    setMobileActionSheetItem,
    mobileDockTabs,
    setMobileDockTabs,
  };
}
