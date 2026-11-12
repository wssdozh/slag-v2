// Dragging a note between workspace panels: the preview rect, the drop target under the pointer,
// and the dockview group it lands in.
import { useState, useRef, useEffect, useCallback } from 'react';
import type { DockviewApi, IDockviewPanel, DockviewGroupPanel } from 'dockview-react';
import {
  closeWindow,
  sendCrossWindowTab,
  listenCrossWindowTab,
  type CrossWindowTabMessage,
} from '../../lib/platform/windowControls';
import {
  wsLog,
  getPanelMinWidth,
  getPanelMaxWidth,
  getPanelComponent,
  syncAllGroupConstraints,
  detachPanel,
} from './dockPanelUtils';

export interface DropPreviewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DropTargetResult {
  group: DockviewGroupPanel | undefined;
  direction: 'left' | 'right' | 'above' | 'below' | undefined;
  preview: DropPreviewRect;
}

export interface UseCrossWindowDndOptions {
  apiRef: React.RefObject<DockviewApi | null>;
  effectiveInitialPanel?: { id: string; title: string };
}

export function useCrossWindowDnd({
  apiRef,
  effectiveInitialPanel,
}: UseCrossWindowDndOptions) {
  const dockSeqRef = useRef(0);
  const activeCrossTabRef = useRef<{ panelId: string; title: string; sourceLabel: string } | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreviewRect | null>(null);
  const dropPreviewRef = useRef(dropPreview);

  useEffect(() => {
    dropPreviewRef.current = dropPreview;
  }, [dropPreview]);

  const previewRafRef = useRef<number | null>(null);

  const updateDropPreview = useCallback(
    (preview: DropPreviewRect | null) => {
      if (previewRafRef.current !== null) {
        cancelAnimationFrame(previewRafRef.current);
      }
      previewRafRef.current = requestAnimationFrame(() => {
        previewRafRef.current = null;
        setDropPreview(preview);
      });
    },
    []
  );

  const clearDropPreview = useCallback(() => {
    if (previewRafRef.current !== null) {
      cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = null;
    }
    setDropPreview(null);
  }, []);

  const computeDropTarget = useCallback(
    (clientX: number, clientY: number): DropTargetResult | null => {
      const api = apiRef.current;
      if (!api) return null;

      const clampedX = Math.max(0, Math.min(clientX, window.innerWidth - 1));
      const clampedY = Math.max(0, Math.min(clientY, window.innerHeight - 1));

      const dropEl = document.elementFromPoint(clampedX, clampedY);
      let targetGroupEl = dropEl?.closest<HTMLElement>('.dv-groupview');
      if (!targetGroupEl) {
        const allGroups = document.querySelectorAll<HTMLElement>('.dv-groupview');
        for (const el of allGroups) {
          const r = el.getBoundingClientRect();
          if (
            clampedX >= r.left - 4 &&
            clampedX <= r.right + 4 &&
            clampedY >= r.top - 4 &&
            clampedY <= r.bottom + 4
          ) {
            targetGroupEl = el;
            break;
          }
        }
      }

      if (!targetGroupEl) return null;

      const matchedGroup =
        api.groups.find((g) => (g as { element?: HTMLElement }).element === targetGroupEl) ||
        api.activeGroup ||
        api.groups[0];
      const rect = targetGroupEl.getBoundingClientRect();

      const headerEl = targetGroupEl.querySelector<HTMLElement>(
        '.dv-tabs-and-actions-container, .dv-header'
      );
      const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 34;

      const isOverTabBar =
        Boolean(
          dropEl?.closest(
            '.dv-tabs-and-actions-container, .dv-tab, .dv-tabs-container, .dv-void-container, .dv-right-actions-container'
          )
        ) ||
        (clampedY >= rect.top && clampedY <= rect.top + headerHeight + 6);

      if (isOverTabBar) {
        return {
          group: matchedGroup,
          direction: undefined,
          preview: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(Math.max(32, headerHeight)),
          },
        };
      }

      const contentTop = rect.top + headerHeight;
      const contentHeight = Math.max(1, rect.height - headerHeight);
      const relContentX = (clampedX - rect.left) / Math.max(1, rect.width);
      const relContentY = (clampedY - contentTop) / contentHeight;

      let direction: 'left' | 'right' | 'above' | 'below' | undefined;
      let previewLeft = rect.left;
      let previewTop = contentTop;
      let previewWidth = rect.width;
      let previewHeight = contentHeight;

      if (relContentX < 0.20) {
        direction = 'left';
        previewWidth = rect.width / 2;
      } else if (relContentX > 0.80) {
        direction = 'right';
        previewLeft = rect.left + rect.width / 2;
        previewWidth = rect.width / 2;
      } else if (relContentY < 0.20) {
        direction = 'above';
        previewHeight = contentHeight / 2;
      } else if (relContentY > 0.80) {
        direction = 'below';
        previewTop = contentTop + contentHeight / 2;
        previewHeight = contentHeight / 2;
      }

      return {
        group: matchedGroup,
        direction,
        preview: {
          left: Math.round(previewLeft),
          top: Math.round(previewTop),
          width: Math.round(previewWidth),
          height: Math.round(previewHeight),
        },
      };
    },
    [apiRef]
  );

  const dockCrossWindowTab = useCallback(
    (
      panelId: string,
      title: string,
      targetGroup: DockviewGroupPanel | undefined,
      direction: 'left' | 'right' | 'above' | 'below' | undefined
    ) => {
      const api = apiRef.current;
      if (!api) return;

      const existingPanel = api.panels.find((p) => getPanelComponent(p) === panelId);
      if (existingPanel) {
        if (targetGroup && existingPanel.group !== targetGroup) {
          existingPanel.api.moveTo(
            direction
              ? { group: targetGroup, position: direction === 'above' ? 'top' : direction === 'below' ? 'bottom' : direction }
              : { group: targetGroup }
          );
        }
        existingPanel.api.setActive();
        wsLog.info(`Cross-window tab already open in workspace; moved/focused [${panelId}] "${title}"`);
      } else {
        dockSeqRef.current += 1;
        const uniqueId = `panel_${panelId}_dock${dockSeqRef.current}`;
        wsLog.info(`Cross-window tab accepted and docked into workspace: [${panelId}] "${title}"`, {
          direction,
          uniqueId,
        });

        const minW = getPanelMinWidth(panelId);
        const maxW = getPanelMaxWidth(panelId);

        try {
          api.addPanel({
            id: uniqueId,
            component: panelId,
            title,
            minimumWidth: minW,
            maximumWidth: maxW,
            position: targetGroup
              ? (direction ? { referenceGroup: targetGroup, direction } : { referenceGroup: targetGroup })
              : undefined,
          });
        } catch {
          api.addPanel({
            id: uniqueId,
            component: panelId,
            title,
            minimumWidth: minW,
            maximumWidth: maxW,
          });
        }
        syncAllGroupConstraints(api);
      }
    },
    [apiRef]
  );

  // Primary window: live HTML5 dragover & drop preview strictly for CROSS-WINDOW tab dragging
  useEffect(() => {
    if (effectiveInitialPanel) return;

    const isCrossDragEvent = (e: DragEvent) => {
      return Boolean(
        activeCrossTabRef.current ||
          e.dataTransfer?.types.includes('application/x-slag-cross-tab')
      );
    };

    const handleWindowDragEnter = (e: DragEvent) => {
      if (!isCrossDragEvent(e)) return;
      e.preventDefault();
    };

    const handleWindowDragOver = (e: DragEvent) => {
      if (!isCrossDragEvent(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      const target = computeDropTarget(e.clientX, e.clientY);
      updateDropPreview(target ? target.preview : null);
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      if (!isCrossDragEvent(e)) return;
      if (
        !e.relatedTarget ||
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        clearDropPreview();
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      if (!isCrossDragEvent(e)) return;
      e.preventDefault();
      clearDropPreview();

      let panelId = activeCrossTabRef.current?.panelId;
      let title = activeCrossTabRef.current?.title || 'SLAG';
      let sourceLabel = activeCrossTabRef.current?.sourceLabel || '';

      if (!panelId && e.dataTransfer) {
        try {
          const raw = e.dataTransfer.getData('application/x-slag-cross-tab');
          if (raw) {
            const parsed = JSON.parse(raw);
            panelId = parsed.panelId;
            title = parsed.title;
            sourceLabel = parsed.sourceLabel || '';
          }
        } catch {}
      }

      if (panelId) {
        const target = computeDropTarget(e.clientX, e.clientY);
        dockCrossWindowTab(panelId, title, target?.group, target?.direction);

        void sendCrossWindowTab({
          type: 'TAB_DRAG_ACCEPTED',
          sourceLabel: 'main',
          targetLabel: sourceLabel,
          panelId,
          title,
        });

        activeCrossTabRef.current = null;
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [
    effectiveInitialPanel,
    computeDropTarget,
    dockCrossWindowTab,
    updateDropPreview,
    clearDropPreview,
  ]);

  // Cross-window tab docking listener: handles dragging tabs across OS windows
  useEffect(() => {
    const urlParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const myLabel = urlParams?.get('label') || 'main';
    const isPrimary = !effectiveInitialPanel;

    const unlisten = listenCrossWindowTab((msg: CrossWindowTabMessage) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.sourceLabel === myLabel) return;

      if (isPrimary && msg.type === 'TAB_DRAG_START') {
        activeCrossTabRef.current = {
          panelId: msg.panelId,
          title: msg.title,
          sourceLabel: msg.sourceLabel || '',
        };
      }

      if (isPrimary && msg.type === 'TAB_DRAG_END') {
        setTimeout(() => {
          clearDropPreview();
        }, 150);
      }

      if (isPrimary && msg.type === 'TAB_DRAG_MOVE') {
        if (msg.screenX === undefined || msg.screenY === undefined) {
          clearDropPreview();
          return;
        }

        activeCrossTabRef.current = {
          panelId: msg.panelId,
          title: msg.title,
          sourceLabel: msg.sourceLabel || '',
        };

        const clientX = msg.screenX - window.screenX;
        const clientY = msg.screenY - window.screenY;
        const isInside =
          clientX >= -10 &&
          clientX <= window.innerWidth + 10 &&
          clientY >= -10 &&
          clientY <= window.innerHeight + 10;

        if (!isInside) {
          clearDropPreview();
          return;
        }

        const target = computeDropTarget(clientX, clientY);
        updateDropPreview(target ? target.preview : null);
      }

      if (isPrimary && msg.type === 'TAB_DRAG_RELEASE') {
        const lastPreview = dropPreviewRef.current;
        clearDropPreview();
        activeCrossTabRef.current = null;

        const isInside =
          msg.forceDock ||
          Boolean(lastPreview) ||
          (msg.screenX !== undefined &&
            msg.screenY !== undefined &&
            msg.screenX >= window.screenX - 40 &&
            msg.screenX <= window.screenX + window.outerWidth + 40 &&
            msg.screenY >= window.screenY - 40 &&
            msg.screenY <= window.screenY + window.outerHeight + 40);

        if (isInside && apiRef.current) {
          let targetGroup = apiRef.current.activeGroup || apiRef.current.groups[0];
          if (!targetGroup) return;
          let direction: 'left' | 'right' | 'above' | 'below' | undefined;

          if (!msg.forceDock && msg.screenX !== undefined && msg.screenY !== undefined) {
            const clientX = msg.screenX - window.screenX;
            const clientY = msg.screenY - window.screenY;
            const target = computeDropTarget(clientX, clientY);
            if (target) {
              targetGroup = target.group || targetGroup;
              direction = target.direction;
            }
          }

          dockCrossWindowTab(msg.panelId, msg.title, targetGroup, direction);

          void sendCrossWindowTab({
            type: 'TAB_DRAG_ACCEPTED',
            sourceLabel: myLabel,
            targetLabel: msg.sourceLabel,
            panelId: msg.panelId,
            title: msg.title,
          });
        } else {
          wsLog.debug(`Cross-window tab drag release ignored outside bounds: [${msg.panelId}]`, {
            screenPos: { x: msg.screenX, y: msg.screenY },
          });
        }
      }

      if (
        !isPrimary &&
        msg.type === 'TAB_DRAG_ACCEPTED' &&
        (msg.targetLabel === myLabel || msg.panelId === effectiveInitialPanel?.id)
      ) {
        wsLog.info(`Detached panel accepted by primary window; closing secondary window [${myLabel}]`);
        void closeWindow();
      }
    });

    return () => {
      unlisten();
    };
  }, [
    effectiveInitialPanel,
    computeDropTarget,
    dockCrossWindowTab,
    updateDropPreview,
    clearDropPreview,
    apiRef,
  ]);

  const handleWillDragPanel = useCallback(
    (dragEvent: Parameters<Parameters<DockviewApi['onWillDragPanel']>[0]>[0]) => {
      const panel = dragEvent.panel as IDockviewPanel | undefined;
      if (!panel) return;

      const groupElement = (panel.group as { element?: HTMLElement } | undefined)?.element;
      const rect = groupElement?.getBoundingClientRect();
      const initialWidth = rect ? Math.round(rect.width) : panel.api.width;
      const initialHeight = rect ? Math.round(rect.height) : panel.api.height;

      const rawComponentId = getPanelComponent(panel);
      const title = panel.title || 'SLAG';
      const winLabel =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('label') || 'main'
          : 'main';
      const isSecondary = Boolean(effectiveInitialPanel);

      if (isSecondary) {
        void sendCrossWindowTab({
          type: 'TAB_DRAG_START',
          sourceLabel: winLabel,
          panelId: rawComponentId,
          title,
        });

        const nativeEvt = dragEvent.nativeEvent as DragEvent | undefined;
        if (nativeEvt && nativeEvt.dataTransfer) {
          try {
            nativeEvt.dataTransfer.setData(
              'application/x-slag-cross-tab',
              JSON.stringify({
                panelId: rawComponentId,
                title,
                sourceLabel: winLabel,
              })
            );
            nativeEvt.dataTransfer.effectAllowed = 'all';
          } catch {}
        }
      }

      wsLog.debug(`Tab drag gesture started: [${rawComponentId}] "${title}"`, {
        isSecondary,
        winLabel,
      });

      let dragEnded = false;
      let lastScreenX = 0;
      let lastScreenY = 0;
      let lastClientX = 0;
      let lastClientY = 0;
      let lastMoveTime = 0;

      const handlePointerMove = (e: MouseEvent | DragEvent) => {
        if (dragEnded) return;
        if (e.screenX || e.screenY) {
          lastScreenX = e.screenX;
          lastScreenY = e.screenY;
        }
        if (e.clientX || e.clientY) {
          lastClientX = e.clientX;
          lastClientY = e.clientY;
        }
        if (isSecondary && (e.screenX || e.screenY)) {
          const now = Date.now();
          if (now - lastMoveTime < 25) return;
          lastMoveTime = now;
          void sendCrossWindowTab({
            type: 'TAB_DRAG_MOVE',
            sourceLabel: winLabel,
            panelId: rawComponentId,
            title,
            screenX: e.screenX,
            screenY: e.screenY,
          });
        }
      };

      const cleanupDrag = () => {
        window.removeEventListener('drag', handlePointerMove as EventListener);
        window.removeEventListener('dragover', handlePointerMove as EventListener);
        window.removeEventListener('dragend', handleDragEnd as EventListener);
      };

      const handleDragEnd = (e: DragEvent | MouseEvent) => {
        if (dragEnded) return;
        dragEnded = true;
        cleanupDrag();

        const releaseScreenX = e.screenX || lastScreenX;
        const releaseScreenY = e.screenY || lastScreenY;
        const releaseClientX = e.clientX || lastClientX;
        const releaseClientY = e.clientY || lastClientY;

        if (isSecondary) {
          wsLog.debug(`Broadcasting cross-window TAB_DRAG_RELEASE for [${rawComponentId}] "${title}"`, {
            screenPos: { x: releaseScreenX, y: releaseScreenY },
            sourceLabel: winLabel,
          });
          void sendCrossWindowTab({
            type: 'TAB_DRAG_RELEASE',
            sourceLabel: winLabel,
            panelId: rawComponentId,
            title,
            screenX: releaseScreenX,
            screenY: releaseScreenY,
          });

          void sendCrossWindowTab({
            type: 'TAB_DRAG_END',
            sourceLabel: winLabel,
            panelId: rawComponentId,
            title,
          });
        } else {
          const isOutsideClient =
            releaseClientX < 0 ||
            releaseClientX > window.innerWidth ||
            releaseClientY < 0 ||
            releaseClientY > window.innerHeight;
          const isOutsideScreen =
            releaseScreenX > 0 &&
            releaseScreenY > 0 &&
            (releaseScreenX < window.screenX - 10 ||
              releaseScreenX > window.screenX + window.innerWidth + 10 ||
              releaseScreenY < window.screenY - 10 ||
              releaseScreenY > window.screenY + window.innerHeight + 10);

          if (isOutsideClient || isOutsideScreen) {
            wsLog.info(`Tab dropped outside window bounds -> triggering tear-off for [${rawComponentId}] "${title}"`, {
              coords: { screenX: releaseScreenX, screenY: releaseScreenY, clientX: releaseClientX, clientY: releaseClientY },
            });
            const api = apiRef.current;
            if (api) {
              void detachPanel(api, panel, {
                left: Math.round((releaseScreenX || window.screenX + releaseClientX) - Math.min(160, initialWidth / 2)),
                top: Math.round((releaseScreenY || window.screenY + releaseClientY) - 25),
                width: initialWidth,
                height: initialHeight,
              });
            }
          }
        }
      };

      window.addEventListener('drag', handlePointerMove as EventListener);
      window.addEventListener('dragover', handlePointerMove as EventListener);
      window.addEventListener('dragend', handleDragEnd as EventListener, { once: true });
    },
    [apiRef, effectiveInitialPanel]
  );

  return {
    dropPreview,
    updateDropPreview,
    clearDropPreview,
    computeDropTarget,
    dockCrossWindowTab,
    handleWillDragPanel,
    previewRafRef,
    activeCrossTabRef,
  };
}
