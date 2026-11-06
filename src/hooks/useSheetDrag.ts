import { useCallback, useEffect, useRef, useState } from 'react';
import { UI_GESTURES } from '../config';

type Mode = 'idle' | 'drag' | 'settle';

interface SheetDragOptions {
  isOpen: boolean;
  onDismiss: () => void;
}

interface DragSession {
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  height: number;
  active: boolean;
}

interface SheetDragState {
  isOpen: boolean;
  offset: number;
  progress: number;
  mode: Mode;
}

const SETTLE_MS = 240;

/** Upwards is beyond the sheet's resting place, so it resists instead of leaving. */
function resist(delta: number, height: number): number {
  if (delta >= 0) return delta;
  const constant = 0.55;
  return (delta * height * constant) / (height + constant * Math.abs(delta));
}

/**
 * Drag-to-dismiss for a bottom sheet. Only the handle takes the gesture, so the
 * sheet's own scroller keeps behaving like a scroller.
 */
export function useSheetDrag({ isOpen, onDismiss }: SheetDragOptions) {
  const panelRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<SheetDragState>({
    isOpen,
    offset: 0,
    progress: 0,
    mode: 'idle',
  });

  // Closed from anywhere (tap outside, Cancel, Escape): drop the gesture.
  if (state.isOpen !== isOpen) {
    setState({ isOpen, offset: 0, progress: 0, mode: 'idle' });
  }

  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isOpen) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    // A press on the folder link belongs to the link; the rest of the header is ours.
    if ((event.target as HTMLElement | null)?.closest('button, a, [role="button"], input, textarea')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    sessionRef.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      height: panelRef.current?.offsetHeight ?? 0,
      active: false,
    };
  }, [isOpen]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    if (!session) return;
    const raw = event.clientY - session.startY;
    const elapsed = Math.max(1, event.timeStamp - session.lastTime);
    session.velocity = (event.clientY - session.lastY) / elapsed;
    session.lastY = event.clientY;
    session.lastTime = event.timeStamp;
    if (!session.active) {
      if (Math.abs(raw) < UI_GESTURES.SHEET_DRAG_START_PX) return;
      session.active = true;
    }
    const offset = resist(raw, session.height);
    setState({
      isOpen,
      offset,
      progress: session.height > 0 ? Math.min(1, Math.max(0, offset / session.height)) : 0,
      mode: 'drag',
    });
  }, [isOpen]);

  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session?.active) return;
    const delta = event.clientY - session.startY;
    const threshold = Math.min(
      UI_GESTURES.SHEET_DISMISS_MAX_PX,
      session.height * UI_GESTURES.SHEET_DISMISS_RATIO,
    );
    if (delta > threshold || session.velocity > UI_GESTURES.DISMISS_VELOCITY_PX_MS) {
      // The sheet's own exit transition picks the panel up from the finger.
      onDismiss();
      return;
    }
    setState({ isOpen, offset: 0, progress: 0, mode: 'settle' });
    settleTimerRef.current = window.setTimeout(() => {
      setState(current => (current.mode === 'settle' ? { ...current, mode: 'idle' } : current));
    }, SETTLE_MS + 20);
  }, [isOpen, onDismiss]);

  const onPointerCancel = useCallback(() => {
    sessionRef.current = null;
    setState({ isOpen, offset: 0, progress: 0, mode: 'settle' });
  }, [isOpen]);

  const panelStyle: React.CSSProperties | undefined = state.mode === 'drag' && state.offset !== 0
    ? { translate: `0 ${state.offset}px`, transition: 'none' }
    : state.mode === 'settle'
      ? { transitionDuration: `${SETTLE_MS}ms`, transitionTimingFunction: 'var(--ease-settle)' }
      : undefined;

  // The scrim dims with the sheet, but never below half of its own strength.
  const scrimStyle: React.CSSProperties | undefined = state.mode === 'drag'
    ? { backgroundColor: `rgba(0, 0, 0, ${0.7 - 0.35 * state.progress})` }
    : undefined;

  return { panelRef, onPointerDown, onPointerMove, onPointerEnd, onPointerCancel, panelStyle, scrimStyle };
}
