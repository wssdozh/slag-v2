import { useCallback } from 'react';
import type {
  DockviewApi,
  DockviewReadyEvent,
  GetTabContextMenuItemsParams,
} from 'dockview-react';
import { DEFAULT_INBOX_FOLDER } from '../../config';
import { sendCrossWindowTab } from '../../lib/windowControls';
import {
  WORKSPACE_LAYOUT_KEY,
  wsLog,
  getPanelMinWidth,
  getPanelMaxWidth,
  getPanelComponent,
  syncAllGroupConstraints,
  scaleLayoutToWidth,
  detachPanel,
} from './dockPanelUtils';
import { GroupHeaderActions } from './GroupHeaderActions';

export interface UseDockPanelsOptions {
  apiRef: React.RefObject<DockviewApi | null>;
  currentFolder: string | null;
  effectiveInitialPanel?: { id: string; title: string };
  onWillDragPanel?: (event: Parameters<Parameters<DockviewApi['onWillDragPanel']>[0]>[0]) => void;
  onPanelRemovedEmpty?: () => void;
}

export function useDockPanels({
  apiRef,
  currentFolder,
  effectiveInitialPanel,
  onWillDragPanel,
  onPanelRemovedEmpty,
}: UseDockPanelsOptions) {
  const applyDefaultLayout = useCallback(
    (api: DockviewApi) => {
      api.clear();

      const centerPanel = api.addPanel({
        id: 'panel_feed',
        component: 'feed',
        title: currentFolder || DEFAULT_INBOX_FOLDER,
        minimumWidth: getPanelMinWidth('feed'),
        maximumWidth: getPanelMaxWidth('feed'),
      });

      api.addPanel({
        id: 'panel_sidebar',
        component: 'sidebar',
        title: 'Навигация',
        position: { direction: 'left', referencePanel: centerPanel },
        initialWidth: 260,
        minimumWidth: getPanelMinWidth('sidebar'),
        maximumWidth: getPanelMaxWidth('sidebar'),
      });

      const assistantPanel = api.addPanel({
        id: 'panel_assistant',
        component: 'assistant',
        title: 'Ассистент',
        position: { direction: 'right', referencePanel: centerPanel },
        initialWidth: 320,
        minimumWidth: getPanelMinWidth('assistant'),
        maximumWidth: getPanelMaxWidth('assistant'),
      });

      api.addPanel({
        id: 'panel_info',
        component: 'folder-info',
        title: 'Инфо',
        position: { referencePanel: assistantPanel },
        minimumWidth: getPanelMinWidth('folder-info'),
        maximumWidth: getPanelMaxWidth('folder-info'),
      });

      syncAllGroupConstraints(api);
    },
    [currentFolder]
  );

  const saveLayout = useCallback(() => {
    if (effectiveInitialPanel || !apiRef.current) return;
    try {
      const json = apiRef.current.toJSON();
      localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(json));
    } catch {
      // Ignore
    }
  }, [effectiveInitialPanel, apiRef]);

  const restoreOrSetInitialLayout = useCallback(
    (api: DockviewApi) => {
      if (effectiveInitialPanel) {
        api.clear();
        api.addPanel({
          id: `panel_${effectiveInitialPanel.id}`,
          component: effectiveInitialPanel.id,
          title: effectiveInitialPanel.title,
          minimumWidth: getPanelMinWidth(effectiveInitialPanel.id),
          maximumWidth: getPanelMaxWidth(effectiveInitialPanel.id),
        });
        syncAllGroupConstraints(api);
      } else {
        let restored = false;
        try {
          const savedLayout = localStorage.getItem(WORKSPACE_LAYOUT_KEY);
          if (savedLayout) {
            const parsed = JSON.parse(savedLayout);
            if (parsed && typeof parsed === 'object' && parsed.panels && typeof parsed.panels === 'object') {
              for (const key of Object.keys(parsed.panels)) {
                const p = parsed.panels[key];
                const comp = p.contentComponent || key.replace(/^panel_/, '').replace(/_\d+$/, '');
                p.minimumWidth = Math.max(p.minimumWidth || 0, getPanelMinWidth(comp));
                const max = getPanelMaxWidth(comp);
                if (max !== undefined) {
                  p.maximumWidth = p.maximumWidth ? Math.min(p.maximumWidth, max) : max;
                }
              }
            }
            // The saved pixel sizes belong to the window they were saved in; rescale them or the
            // grid stops short of the right edge.
            scaleLayoutToWidth(parsed?.grid?.root, api.width);
            api.fromJSON(parsed);
            syncAllGroupConstraints(api);
            restored = true;
            wsLog.debug('Restored saved workspace layout configuration');
          }
        } catch {
          restored = false;
        }

        if (!restored) {
          wsLog.debug('Applying default 3-panel workspace layout');
          applyDefaultLayout(api);
        }
      }
    },
    [effectiveInitialPanel, applyDefaultLayout]
  );

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      wsLog.info(
        `Dockview workspace shell mounted: ${effectiveInitialPanel ? `detached window [${effectiveInitialPanel.id}]` : 'primary window'}`
      );

      // Dockview fires a layout change on every frame of a window resize, and saving serializes the
      // whole grid into localStorage; coalesce a burst into one write.
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const saveSoon = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveLayout, 250);
      };
      event.api.onDidLayoutChange(() => {
        saveSoon();
      });

      event.api.onDidActivePanelChange(() => {
        const active = event.api.activePanel;
        if (active) {
          wsLog.debug(`Active workspace tab switched: [${active.id}] "${active.title || ''}"`);
        }
        syncAllGroupConstraints(event.api);
        saveLayout();
      });

      event.api.onDidAddPanel(() => {
        syncAllGroupConstraints(event.api);
      });

      event.api.onDidRemovePanel(() => {
        wsLog.info('Panel removed from workspace layout', { remainingPanels: event.api.totalPanels });
        if (effectiveInitialPanel && event.api.totalPanels === 0) {
          wsLog.info('Detached window has no remaining panels -> auto-closing window');
          onPanelRemovedEmpty?.();
          return;
        }
        syncAllGroupConstraints(event.api);
        requestAnimationFrame(() => {
          if (event.api.groups.length === 2) {
            const centerGroup = event.api.groups.find(g =>
              g.panels.some(p => p.id === 'panel_feed' || p.id.startsWith('panel_feed_'))
            );
            const sideGroup = event.api.groups.find(g => g !== centerGroup);
            if (centerGroup && sideGroup && sideGroup.api.width > 400) {
              try {
                sideGroup.api.setSize({ width: 320 });
              } catch {}
            }
          }
        });
        saveLayout();
      });

      restoreOrSetInitialLayout(event.api);

      if (onWillDragPanel) {
        event.api.onWillDragPanel(onWillDragPanel);
      }
    },
    [
      apiRef,
      effectiveInitialPanel,
      saveLayout,
      onPanelRemovedEmpty,
      restoreOrSetInitialLayout,
      onWillDragPanel,
    ]
  );

  const getTabContextMenuItems = useCallback(
    (params: GetTabContextMenuItemsParams) => {
      const { panel, api } = params;
      const isSecondary = Boolean(effectiveInitialPanel);
      const rawComponentId = getPanelComponent(panel);

      return [
        isSecondary
          ? {
              label: 'Вернуть в главное окно',
              action: () => {
                wsLog.info(`Tab context menu: returning [${rawComponentId}] "${panel.title}" to primary window`);
                const winLabel =
                  typeof window !== 'undefined'
                    ? new URLSearchParams(window.location.search).get('label') || ''
                    : '';
                void sendCrossWindowTab({
                  type: 'TAB_DRAG_RELEASE',
                  sourceLabel: winLabel,
                  panelId: rawComponentId,
                  title: panel.title || 'SLAG',
                  forceDock: true,
                });
              },
            }
          : {
              label: 'Вынести в отдельное окно',
              action: () => {
                wsLog.info(`Tab context menu: detaching [${rawComponentId}] "${panel.title}" to separate window`);
                void detachPanel(api, panel);
              },
            },
        {
          label: 'Сделать плавающим',
          action: () => {
            wsLog.info(`Tab context menu: making [${rawComponentId}] "${panel.title}" floating`);
            api.addFloatingGroup(panel, {
              x: Math.max(20, (window.innerWidth - 680) / 2),
              y: Math.max(20, (window.innerHeight - 520) / 2),
              width: 680,
              height: 520,
            });
          },
        },
        'separator' as const,
        'close' as const,
        'closeOthers' as const,
        'closeAll' as const,
      ];
    },
    [effectiveInitialPanel]
  );

  return {
    onReady,
    getTabContextMenuItems,
    saveLayout,
    applyDefaultLayout,
    GroupHeaderActions,
  };
}
