import { useState, useRef, useCallback, useEffect } from 'react';

export interface DragItemPayload {
  type: string;
  id: string;
  title?: string;
  [key: string]: any;
}

export interface UsePointerDndOptions<TPayload extends DragItemPayload = DragItemPayload> {
  threshold?: number;
  onDrop?: (
    payload: TPayload,
    targetZone: HTMLElement | null,
    targetData: Record<string, string>,
    dropPos: { x: number; y: number }
  ) => void;
  onDragStart?: (payload: TPayload) => void;
  onDragEnd?: () => void;
  onHoverZoneChange?: (targetZone: HTMLElement | null, targetData: Record<string, string> | null) => void;
}

export interface PointerDndState<TPayload extends DragItemPayload = DragItemPayload> {
  isDragging: boolean;
  draggingPayload: TPayload | null;
  dragPos: { x: number; y: number } | null;
  activeZoneData: Record<string, string> | null;
}

// ponytail: single pointer dnd hook replacing html5 dnd. ceiling: 1 active drag gesture. upgrade: multi-touch if concurrent gestures needed
export function usePointerDnd<TPayload extends DragItemPayload = DragItemPayload>(
  options: UsePointerDndOptions<TPayload>
) {
  const [state, setState] = useState<PointerDndState<TPayload>>({
    isDragging: false,
    draggingPayload: null,
    dragPos: null,
    activeZoneData: null,
  });

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const dragSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    payload: TPayload;
    isDragging: boolean;
    activeZone: HTMLElement | null;
    activeZoneData: Record<string, string> | null;
  } | null>(null);

  const cleanupListenersRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
      cleanupListenersRef.current = null;
    }
    dragSessionRef.current = null;
    document.body.removeAttribute('data-dnd-active');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    setState({
      isDragging: false,
      draggingPayload: null,
      dragPos: null,
      activeZoneData: null,
    });
    optionsRef.current.onHoverZoneChange?.(null, null);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, payload: TPayload) => {
      // Only handle primary button (left mouse button)
      if (e.button !== 0) return;

      // Ignore interactive controls inside draggable items
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, [contenteditable="true"], [data-no-dnd], [data-resize-handle]')) {
        return;
      }

      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;

      dragSessionRef.current = {
        pointerId,
        startX,
        startY,
        payload,
        isDragging: false,
        activeZone: null,
        activeZoneData: null,
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || moveEvent.pointerId !== session.pointerId) return;

        const dx = moveEvent.clientX - session.startX;
        const dy = moveEvent.clientY - session.startY;
        const threshold = optionsRef.current.threshold ?? 5;

        if (!session.isDragging) {
          if (Math.hypot(dx, dy) >= threshold) {
            session.isDragging = true;
            document.body.setAttribute('data-dnd-active', 'true');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';

            optionsRef.current.onDragStart?.(session.payload);
            setState({
              isDragging: true,
              draggingPayload: session.payload,
              dragPos: { x: moveEvent.clientX, y: moveEvent.clientY },
              activeZoneData: null,
            });
          }
        }

        if (session.isDragging) {
          moveEvent.preventDefault();

          // Find drop target zone under pointer
          const elUnder = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null;
          const dropZone = elUnder?.closest<HTMLElement>('[data-drop-zone]') || null;

          let zoneData: Record<string, string> | null = null;
          if (dropZone) {
            zoneData = {};
            for (const [k, v] of Object.entries(dropZone.dataset)) {
              if (v !== undefined) zoneData[k] = v;
            }
          }

          session.activeZone = dropZone;
          session.activeZoneData = zoneData;

          setState({
            isDragging: true,
            draggingPayload: session.payload,
            dragPos: { x: moveEvent.clientX, y: moveEvent.clientY },
            activeZoneData: zoneData,
          });

          optionsRef.current.onHoverZoneChange?.(dropZone, zoneData);
        }
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || upEvent.pointerId !== session.pointerId) return;

        const didDrag = session.isDragging;
        const payload = session.payload;
        const activeZone = session.activeZone;
        const activeZoneData = session.activeZoneData;

        cleanup();

        if (didDrag) {
          // Suppress any follow-up click event caused by pointer release
          const captureClick = (clickEvent: MouseEvent) => {
            clickEvent.stopPropagation();
            clickEvent.preventDefault();
            window.removeEventListener('click', captureClick, true);
          };
          window.addEventListener('click', captureClick, true);
          setTimeout(() => window.removeEventListener('click', captureClick, true), 100);

          optionsRef.current.onDrop?.(payload, activeZone, activeZoneData || {}, {
            x: upEvent.clientX,
            y: upEvent.clientY,
          });
          optionsRef.current.onDragEnd?.();
        }
      };

      const handlePointerCancel = (cancelEvent: PointerEvent) => {
        const session = dragSessionRef.current;
        if (!session || cancelEvent.pointerId !== session.pointerId) return;
        cleanup();
        optionsRef.current.onDragEnd?.();
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Escape' && dragSessionRef.current?.isDragging) {
          cleanup();
          optionsRef.current.onDragEnd?.();
        }
      };

      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
      window.addEventListener('keydown', handleKeyDown);

      cleanupListenersRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
        window.removeEventListener('keydown', handleKeyDown);
      };
    },
    [cleanup]
  );

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isDragging: state.isDragging,
    draggingPayload: state.draggingPayload,
    dragPos: state.dragPos,
    activeZoneData: state.activeZoneData,
    handlePointerDown,
  };
}
