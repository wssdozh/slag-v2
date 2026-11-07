import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { ToastMessage } from '../../context/AppContext';
import { usePresence } from '../../hooks/usePresence';
import { UI_DELAYS, UI_GESTURES } from '../../config';
import { CheckCircle2, AlertCircle, Info, Undo2, ArchiveRestore } from 'lucide-react';

/* How far the card keeps travelling after a flick. Beyond the viewport edge, so
   the inline translate and the CSS exit never disagree. */
const DISMISS_OFFSET_PX = 160;

interface DragSession {
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  active: boolean;
}

const ToastCard: React.FC<{ toast: ToastMessage }> = ({ toast }) => {
  const { removeToast } = useApp();
  const [isOpen, setIsOpen] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<DragSession | null>(null);
  const { ref, isPresent, phase, onTransitionEnd } = usePresence(isOpen);

  const dismiss = useCallback(() => setIsOpen(false), []);

  // The timer lives here, so hovering or grabbing the card can hold it.
  useEffect(() => {
    if (!isOpen || isPaused) return;
    const delay = toast.action ? UI_DELAYS.TOAST_ACTION_DURATION_MS : UI_DELAYS.TOAST_DEFAULT_DURATION_MS;
    const timer = window.setTimeout(dismiss, delay);
    return () => window.clearTimeout(timer);
  }, [dismiss, isOpen, isPaused, toast.action]);

  useEffect(() => {
    if (phase !== 'closed') return;
    removeToast(toast.id);
  }, [phase, removeToast, toast.id]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A press that lands on a control belongs to the control: capturing it would
    // retarget the click and the action inside the toast would never fire.
    if ((event.target as HTMLElement | null)?.closest('button, a, [role="button"], input, textarea')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      active: false,
    };
    setIsPaused(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = event.clientY - drag.startY;
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    if (!drag.active) {
      if (Math.abs(dy) < UI_GESTURES.TOAST_DRAG_START_PX) return;
      drag.active = true;
      setIsDragging(true);
    }
    // Downwards is a dead end: resist instead of pretending the card can leave.
    setDragY(dy < 0 ? dy : dy * UI_GESTURES.TOAST_RUBBER_BAND);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    setIsDragging(false);
    if (!drag.active) {
      setIsPaused(false);
      return;
    }
    const dy = event.clientY - drag.startY;
    // A jitter is not a flick: the card has to travel before speed counts.
    const flicked =
      Math.abs(dy) >= UI_GESTURES.TOAST_FLICK_MIN_PX &&
      drag.velocity < -UI_GESTURES.DISMISS_VELOCITY_PX_MS;
    if (dy <= -UI_GESTURES.TOAST_DISMISS_PX || flicked) {
      setDragY(-DISMISS_OFFSET_PX);
      dismiss();
      return;
    }
    setDragY(0);
    setIsPaused(false);
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setIsDragging(false);
    setDragY(0);
    setIsPaused(false);
  };

  if (!isPresent) return null;

  const dragStyle: React.CSSProperties | undefined = isDragging
    ? { translate: `0 ${dragY}px`, transition: 'none' }
    : dragY
      ? { translate: `0 ${dragY}px` }
      : undefined;

  return (
    <div
      ref={ref}
      data-testid="toast"
      data-motion-state={phase}
      onTransitionEnd={onTransitionEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={event => {
        if (event.pointerType === 'mouse') setIsPaused(true);
      }}
      onPointerLeave={event => {
        if (event.pointerType === 'mouse' && !dragRef.current) setIsPaused(false);
      }}
      style={dragStyle}
      className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-surface-elevated/95 backdrop-blur-md border border-white/[0.08] text-sm text-fg-primary shadow-2xl motion-toast max-w-full touch-none"
    >
      {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
      {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-danger shrink-0" />}
      {toast.type === 'info' && <Info className="w-4 h-4 text-fg-muted shrink-0" />}
      <span className="font-medium tracking-tight text-xs min-w-0 break-words">{toast.text}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            dismiss();
          }}
          type="button"
          aria-label={toast.action.label}
          title={toast.action.label}
          className="ml-1 flex shrink-0 items-center justify-center w-8 h-8 max-sm:w-11 max-sm:h-11 rounded-md text-fg-secondary hover:text-fg-primary focus-visible:text-fg-primary cursor-pointer"
        >
          {toast.action.kind === 'undo' ? <Undo2 className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[120] flex flex-col gap-2 items-center pointer-events-none w-[calc(100%-2rem)] max-w-md"
      style={{ top: 'max(calc(var(--sat) + 0.75rem), 1.25rem)' }}
    >
      {toasts.map(toast => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
};
