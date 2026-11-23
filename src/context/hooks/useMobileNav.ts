// Mobile tabs, folder transitions and temporary navigation surfaces.
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { MobileTabId, SlagItem, WorkspaceState } from '../../types';
import { STORAGE_KEYS, UI_BREAKPOINTS } from '../../config';
import { useIsMobile } from '../../hooks/layout/useIsMobile';
import { isDesktopApp, isMobilePlatform } from '../../lib/platform/windowControls';
import { getPrefJson, setPref } from '../../lib/storage/prefs';
import { swapScreen, type ScreenSwap } from '../../lib/motion';

export const DEFAULT_MOBILE_DOCK_TABS: MobileTabId[] = ['folders', 'tasks', 'assistant', 'settings'];
const MOBILE_DOCK_TABS_KEY = STORAGE_KEYS.MOBILE_DOCK_TABS;

function isStandalonePanel(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('panel');
}

export function defaultsToMobileLayout(
  narrow = typeof window !== 'undefined' && window.innerWidth < UI_BREAKPOINTS.MOBILE,
): boolean {
  return !isStandalonePanel() && (isMobilePlatform() || (!isDesktopApp() && narrow));
}

function mobileFolderDepth(folder: string): number {
  return folder.split('/').length;
}

export function useMobileNav(
  initialWorkspace: WorkspaceState,
  currentFolder: string,
  onSelectFolder: (folder: string) => void,
  startInInbox: boolean,
) {
  const isMobileScreen = useIsMobile(UI_BREAKPOINTS.MOBILE);
  const [forceMobileMode, setForceMobileMode] = useState<boolean | null>(null);
  const isMobile = forceMobileMode === null ? defaultsToMobileLayout(isMobileScreen)
    : !isStandalonePanel() && forceMobileMode;

  const toggleMobileMode = useCallback(() => {
    setForceMobileMode((prev) => {
      if (prev === null) return !isMobileScreen;
      return !prev;
    });
  }, [isMobileScreen]);

  const [activeMobileTab, setActiveMobileTabState] = useState<MobileTabId>(
    () => startInInbox ? 'folders' : initialWorkspace.activeMobileTab || 'folders',
  );
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(startInInbox);
  const [isMobileFolderPickerOpen, setIsMobileFolderPickerOpen] = useState(false);
  const [mobileFolderInfoOpen, setMobileFolderInfoOpenState] = useState(false);
  const [mobileActionSheetItem, setMobileActionSheetItem] = useState<SlagItem | null>(null);
  const [mobileDockTabs, setMobileDockTabsState] = useState<MobileTabId[]>(() =>
    getPrefJson(MOBILE_DOCK_TABS_KEY, DEFAULT_MOBILE_DOCK_TABS, (value) =>
      Array.isArray(value) ? (value as MobileTabId[]) : undefined
    )
  );

  const setMobileDockTabs = useCallback((tabs: MobileTabId[]) => {
    setMobileDockTabsState(tabs);
    setPref(MOBILE_DOCK_TABS_KEY, JSON.stringify(tabs));
  }, []);

  const activeTabRef = useRef(activeMobileTab);
  useEffect(() => {
    activeTabRef.current = activeMobileTab;
  }, [activeMobileTab]);

  const setActiveMobileTab = useCallback((next: React.SetStateAction<MobileTabId>) => {
    const prev = activeTabRef.current;
    const resolvedNext = typeof next === 'function' ? next(prev) : next;
    const prevIdx = mobileDockTabs.indexOf(prev);
    const nextIdx = mobileDockTabs.indexOf(resolvedNext);
    const kind: ScreenSwap =
      prevIdx !== -1 && nextIdx !== -1 && prevIdx !== nextIdx
        ? nextIdx > prevIdx ? 'tab-next' : 'tab-prev'
        : 'tab';

    if (resolvedNext === prev) return;
    swapScreen(kind, () => {
      activeTabRef.current = resolvedNext;
      setActiveMobileTabState(resolvedNext);
      setIsMobileFolderPickerOpen(false);
    });
  }, [mobileDockTabs]);

  const navigateMobileFolder = useCallback((folder: string) => {
    if (folder === currentFolder && isMobileFolderOpen && activeTabRef.current === 'folders') {
      setIsMobileFolderPickerOpen(false);
      return;
    }
    const delta = mobileFolderDepth(folder) - (isMobileFolderOpen && activeTabRef.current === 'folders' ? mobileFolderDepth(currentFolder) : 0);
    const kind: ScreenSwap = delta > 0 ? 'push' : delta < 0 ? 'pop' : 'tab';
    swapScreen(kind, () => {
      activeTabRef.current = 'folders';
      setActiveMobileTabState('folders');
      setIsMobileFolderPickerOpen(false);
      setIsMobileFolderOpen(true);
      onSelectFolder(folder);
    });
  }, [currentFolder, isMobileFolderOpen, onSelectFolder]);

  const goBackFromMobileFolder = useCallback(() => {
    const parentEnd = currentFolder.lastIndexOf('/');
    if (parentEnd >= 0) {
      navigateMobileFolder(currentFolder.slice(0, parentEnd));
    } else {
      swapScreen('pop', () => setIsMobileFolderOpen(false));
    }
  }, [currentFolder, navigateMobileFolder]);

  const setMobileFolderInfoOpen = useCallback((open: boolean) => {
    swapScreen(open ? 'push' : 'pop', () => setMobileFolderInfoOpenState(open));
  }, []);

  return {
    isMobile,
    forceMobileMode,
    toggleMobileMode,
    activeMobileTab,
    setActiveMobileTab,
    navigateMobileFolder,
    goBackFromMobileFolder,
    isMobileFolderOpen,
    mobileFolderDepth: isMobileFolderOpen ? mobileFolderDepth(currentFolder) : 0,
    isMobileFolderPickerOpen,
    setIsMobileFolderPickerOpen,
    mobileFolderInfoOpen,
    setMobileFolderInfoOpen,
    mobileActionSheetItem,
    setMobileActionSheetItem,
    mobileDockTabs,
    setMobileDockTabs,
  };
}
