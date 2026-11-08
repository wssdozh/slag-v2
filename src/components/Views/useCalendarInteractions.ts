import { useState, useRef, useEffect, useCallback } from 'react';
import type { SlagItem } from '../../types';
import { formatDurationBadge } from './calendarHelpers';

export const DEFAULT_HOUR_HEIGHT = 52;
export const MIN_HOUR_HEIGHT = 44;
export const MAX_HOUR_HEIGHT = 160;

export interface TimelineResizingState {
  startY: number;
  initialHeight: number;
  anchorHour: number;
  offsetInViewport: number;
  currentHeight: number;
  slotStep: 15 | 30 | 60;
  isSnapped: boolean;
}

export interface ResizingTaskState {
  taskId: string;
  initialY: number;
  initialDuration: number;
  currentDuration: number;
}

interface UseCalendarInteractionsOptions {
  timeGridRef: React.RefObject<HTMLDivElement | null>;
  items: SlagItem[];
  updateItem: (item: SlagItem) => void;
  addToast: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export function useCalendarInteractions({
  timeGridRef,
  items,
  updateItem,
  addToast,
}: UseCalendarInteractionsOptions) {
  // Dynamic Hour Height for Week View Timeline (44px .. 160px, default 52px)
  const [hourHeight, setHourHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('slag_calendar_hour_height');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= MIN_HOUR_HEIGHT && parsed <= MAX_HOUR_HEIGHT) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return DEFAULT_HOUR_HEIGHT;
  });

  const hourHeightRef = useRef(hourHeight);
  useEffect(() => {
    hourHeightRef.current = hourHeight;
  }, [hourHeight]);

  // Timeline Hour Height Interactive Zoom State ("опоп чутка" snap & sub-divisions)
  const [timelineResizing, setTimelineResizing] = useState<TimelineResizingState | null>(null);
  const isTimelineResizingActiveRef = useRef(false);

  // Card bottom-edge resize state for time-blocking duration
  const [resizingTask, setResizingTask] = useState<ResizingTaskState | null>(null);

  // Guard to prevent card onClick from firing immediately after a resize drag
  const isJustResizedRef = useRef(false);

  // Handle zooming timeline ruler in Week View ("приблизить линию" как в After Effects: 60м → 30м → 15м)
  const handleTimelineRulerMouseDown = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    if (e.button !== 0) return;
    if (isTimelineResizingActiveRef.current) return;
    isTimelineResizingActiveRef.current = true;

    e.preventDefault();
    e.stopPropagation();

    const timeGrid = timeGridRef.current;
    if (!timeGrid) return;

    const rect = timeGrid.getBoundingClientRect();
    const startY = e.clientY;
    const offsetInViewport = startY - rect.top;
    const initialScrollTop = timeGrid.scrollTop;
    const initialGridY = initialScrollTop + offsetInViewport;
    const currentH = hourHeightRef.current;
    const anchorHour = initialGridY / currentH;
    const initialHeight = currentH;

    let hasMoved = false;
    const initialStep = currentH >= 112 ? 15 : currentH >= 68 ? 30 : 60;

    setTimelineResizing({
      startY,
      initialHeight,
      anchorHour,
      offsetInViewport,
      currentHeight: initialHeight,
      slotStep: initialStep,
      isSnapped: true,
    });

    const handleMove = (moveEvent: MouseEvent | PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      if (!hasMoved && Math.abs(deltaY) < 3) return;
      hasMoved = true;

      const rawHeight = Math.max(
        MIN_HOUR_HEIGHT,
        Math.min(MAX_HOUR_HEIGHT, Math.round(initialHeight + deltaY * 0.85))
      );

      // Magnetic snap milestones for clean division scales ("опоп чутка")
      let snappedHeight = rawHeight;
      let isSnapped = false;
      for (const snap of [52, 84, 136]) {
        if (Math.abs(rawHeight - snap) <= 4) {
          snappedHeight = snap;
          isSnapped = true;
          break;
        }
      }

      const nextStep = snappedHeight >= 112 ? 15 : snappedHeight >= 68 ? 30 : 60;

      setHourHeight(snappedHeight);
      setTimelineResizing(prev =>
        prev
          ? {
              ...prev,
              currentHeight: snappedHeight,
              slotStep: nextStep,
              isSnapped,
            }
          : null
      );

      // Keep clicked anchor hour pinned under cursor
      if (timeGridRef.current) {
        const newScrollTop = Math.max(
          0,
          anchorHour * snappedHeight - offsetInViewport - deltaY
        );
        timeGridRef.current.scrollTop = newScrollTop;
      }
    };

    const handleUp = () => {
      isTimelineResizingActiveRef.current = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);

      setTimelineResizing(current => {
        if (current && hasMoved) {
          try {
            localStorage.setItem('slag_calendar_hour_height', String(current.currentHeight));
          } catch {
            // ignore
          }
        }
        return null;
      });
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }, [timeGridRef]);

  const handleTimelineRulerWheel = useCallback((e: React.WheelEvent) => {
    // Zoom in/out via wheel over ruler (like After Effects timeline)
    if (e.deltaY !== 0) {
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY > 0 ? -10 : 10;
      setHourHeight(prev => {
        const next = Math.max(MIN_HOUR_HEIGHT, Math.min(MAX_HOUR_HEIGHT, prev + delta));
        try {
          localStorage.setItem('slag_calendar_hour_height', String(next));
        } catch {
          // ignore
        }
        return next;
      });
    }
  }, []);

  const handleTimelineDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHourHeight(DEFAULT_HOUR_HEIGHT);
    try {
      localStorage.setItem('slag_calendar_hour_height', String(DEFAULT_HOUR_HEIGHT));
    } catch {
      // ignore
    }
    addToast('Масштаб таймлайна сброшен: деления 1 час (52px)', 'info');
  }, [addToast]);

  // Handle dragging bottom edge to resize task duration (time-blocking with 15-min snapping)
  const handleResizeStart = useCallback((e: React.MouseEvent, taskId: string, initialDuration: number) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    setResizingTask({
      taskId,
      initialY: startY,
      initialDuration,
      currentDuration: initialDuration,
    });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const currentH = hourHeightRef.current;
      const deltaMinutes = Math.round(((deltaY / currentH) * 60) / 15) * 15;
      const nextDuration = Math.max(15, Math.min(1440, initialDuration + deltaMinutes));
      setResizingTask(prev => (prev ? { ...prev, currentDuration: nextDuration } : null));
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const deltaY = upEvent.clientY - startY;
      const currentH = hourHeightRef.current;
      const deltaMinutes = Math.round(((deltaY / currentH) * 60) / 15) * 15;
      const finalDuration = Math.max(15, Math.min(1440, initialDuration + deltaMinutes));

      setResizingTask(null);
      isJustResizedRef.current = true;
      setTimeout(() => {
        isJustResizedRef.current = false;
      }, 200);

      const realId = taskId.replace(/_virtual_.*$/, '');
      const target = items.find(i => i.id === realId);
      if (target) {
        updateItem({
          ...target,
          duration: finalDuration,
        });
        addToast(
          `Длительность: ${formatDurationBadge(finalDuration)}`,
          'success'
        );
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [items, updateItem, addToast]);

  return {
    hourHeight,
    hourHeightRef,
    setHourHeight,
    timelineResizing,
    isTimelineResizingActiveRef,
    resizingTask,
    isJustResizedRef,
    handleTimelineRulerMouseDown,
    handleTimelineRulerWheel,
    handleTimelineDoubleClick,
    handleResizeStart,
  };
}
