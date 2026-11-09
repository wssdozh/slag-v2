import { useCallback, useEffect, useRef, useState } from 'react';
import { UI_GESTURES } from '../../config';

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

const SETTLE_MS = 240;

/** Upwards is beyond the sheet's resting place, so it resists instead of leaving. */
function resist(delta: number, height: number): number {
  if (delta >= 0) return delta;
  const constant = 0.55;
  return (delta * height * constant) / (height + constant * Math.abs(delta));
}

/**
 * Drag-to-dismiss for a one-detent sheet — a content-sized panel with nothing to expand into.
 * Two-detent sheets (the editor, the attach picker) live in `SheetPanel`.
 *
 * Only the handle takes the gesture, so the sheet's own scroller keeps behaving like a scroller.
 *
 * The finger never goes through React: `translate` on the panel and `opacity` on
 * the scrim are written straight to the two nodes during the drag, so a move
 * costs one compositor update instead of a re-render of the whole sheet. Both
 * properties are composited, which is what keeps the drag at panel refresh rate
 * on a phone. Nothing here animates `background-color`: that repainted the full
 * viewport every pointermove.
 */
export function useSheetDrag({ isOpen, onDismiss }: SheetDragOptions) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<Mode>('idle');

  // Closed from anywhere (tap outside, Cancel, Escape): drop the gesture.
  const [openedFor, setOpenedFor] = useState(isOpen);
  if (openedFor !== isOpen) {
    setOpenedFor(isOpen);
    setMode('idle');
  }

  /** Hand both nodes back to their CSS cameras. */
  const releaseInline = useCallback(() => {
    const panel = panelRef.current;
    if (panel) {
      panel.style.translate = '';
      panel.style.transition = '';
    }
    const scrim = scrimRef.current;
    if (scrim) scrim.style.opacity = '';
  }, []);

  useEffect(() => {
    if (mode !== 'drag') releaseInline();
  }, [mode, releaseInline]);

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
      setMode('drag');
    }
    // A pull upwards is past the sheet's resting place, so it resists instead of leaving.
    const offset = resist(raw, session.height);
    const panel = panelRef.current;
    if (panel) {
      panel.style.transition = 'none';
      panel.style.translate = `0 ${offset}px`;
    }
    // The scrim dims with the sheet, but never below half of its own strength:
    // `bg-black/70` at full opacity, so opacity 1 - 0.5·progress lands on exactly
    // the 0.7 → 0.35 alpha ramp the colour animation used to draw.
    const scrim = scrimRef.current;
    if (scrim && session.height > 0) {
      const progress = Math.min(1, Math.max(0, offset / session.height));
      scrim.style.opacity = String(1 - 0.5 * progress);
    }
  }, []);

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
      // The sheet's own exit transition picks the panel up from the finger —
      // but only once the inline translate stops overriding that transition.
      releaseInline();
      onDismiss();
      return;
    }
    setMode('settle');
    settleTimerRef.current = window.setTimeout(() => {
      setMode(current => (current === 'settle' ? 'idle' : current));
    }, SETTLE_MS + 20);
  }, [onDismiss, releaseInline]);

  const onPointerCancel = useCallback(() => {
    sessionRef.current = null;
    setMode('settle');
  }, []);

  // Clearing the inline `translate` is what animates the sheet home: the settle
  // timing is already on the element, so the CSS transition takes the release.
  const panelStyle: React.CSSProperties | undefined = mode === 'settle'
    ? { transitionDuration: `${SETTLE_MS}ms`, transitionTimingFunction: 'var(--ease-settle)' }
    : undefined;

  return { panelRef, scrimRef, onPointerDown, onPointerMove, onPointerEnd, onPointerCancel, panelStyle };
}
