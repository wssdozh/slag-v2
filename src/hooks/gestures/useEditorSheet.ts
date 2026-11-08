import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

interface Options {
  enabled: boolean;
  expanded: boolean;
  exiting: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDismiss: () => void;
  onExited: () => void;
}

/** One interruptible spring owns the surface; pointer frames never render React. */
export function useEditorSheet({ enabled, expanded, exiting, onExpandedChange, onDismiss, onExited }: Options) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /** Scrollable editor body: pulling it down at scrollTop 0 collapses the sheet. */
  const bodyRef = useRef<HTMLDivElement>(null);
  const physics = useRef({ y: 0, velocity: 0, target: 0, frame: 0, time: 0, height: 0, initialized: false });
  const drag = useRef<{ start: number; y: number; last: number; time: number; moved: boolean } | null>(null);
  const options = useRef({ expanded, exiting, onExpandedChange, onDismiss, onExited });
  useLayoutEffect(() => { options.current = { expanded, exiting, onExpandedChange, onDismiss, onExited }; });

  const paint = useCallback(() => {
    const state = physics.current;
    const height = state.height;
    if (panelRef.current) panelRef.current.style.transform = `translate3d(0, ${state.y}px, 0)`;
    // Chrome is attached to the same surface, but stays at the visible bottom.
    if (barRef.current) barRef.current.style.transform = `translate3d(0, ${-Math.min(state.y, height * 0.44)}px, 0)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, (height - state.y) / (height * 0.56))));
  }, []);

  const settle = useCallback((target: number, velocity?: number) => {
    const state = physics.current;
    cancelAnimationFrame(state.frame);
    state.target = target;
    if (velocity !== undefined) state.velocity = velocity;
    state.time = 0;
    const finish = () => {
      state.y = state.target;
      state.velocity = 0;
      paint();
      if (options.current.exiting) options.current.onExited();
    };
    if (prefersReducedMotion()) { finish(); return; }
    const tick = (time: number) => {
      const dt = state.time ? Math.min((time - state.time) / 1000, 0.032) : 1 / 60;
      state.time = time;
      // Analytic damped spring: stable across 60/90/120Hz and dropped frames.
      const omega = 22;
      const damping = 0.86;
      const frequency = omega * Math.sqrt(1 - damping * damping);
      const distance = state.y - state.target;
      const b = (state.velocity + damping * omega * distance) / frequency;
      const decay = Math.exp(-damping * omega * dt);
      const cos = Math.cos(frequency * dt);
      const sin = Math.sin(frequency * dt);
      state.y = state.target + decay * (distance * cos + b * sin);
      state.velocity = decay * ((-damping * omega * distance + b * frequency) * cos + (-damping * omega * b - distance * frequency) * sin);
      paint();
      if (Math.abs(state.y - state.target) < 0.35 && Math.abs(state.velocity) < 5) finish();
      else state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
  }, [paint]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const update = () => {
      const height = panelRef.current?.parentElement?.clientHeight ?? window.innerHeight;
      const state = physics.current;
      state.height = height;
      if (!state.initialized) {
        state.initialized = true;
        state.y = prefersReducedMotion() ? height * 0.44 : height;
        paint();
      }
      settle(exiting ? height + 16 : expanded ? 0 : height * 0.44);
    };
    update();
    const state = physics.current;
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('resize', update); cancelAnimationFrame(state.frame); };
  }, [enabled, expanded, exiting, paint, settle]);

  const sheetHeight = useCallback(
    () => panelRef.current?.parentElement?.clientHeight ?? window.innerHeight,
    []
  );

  /**
   * Where the sheet lands when the finger lifts. Fully expanded sheets go to the
   * half detent before dismissing, so a single pull never skips a stage — but a
   * pull that carries most of the screen collapses straight through.
   */
  const commitDrag = useCallback((velocity: number) => {
    const height = sheetHeight();
    const half = height * 0.44;
    const state = physics.current;
    const wasExpanded = options.current.expanded;
    const projected = state.y + velocity * 0.18;
    if (wasExpanded) {
      if (projected > height * 0.82) {
        options.current.onDismiss();
        return;
      }
      const nextExpanded = projected < half * 0.35;
      options.current.onExpandedChange(nextExpanded);
      settle(nextExpanded ? 0 : half, velocity);
      return;
    }
    if (projected > half + height * 0.18) {
      options.current.onDismiss();
      return;
    }
    const nextExpanded = projected < half * 0.75;
    options.current.onExpandedChange(nextExpanded);
    settle(nextExpanded ? 0 : half, velocity);
  }, [settle, sheetHeight]);

  const beginDrag = useCallback((clientY: number, timeStamp: number) => {
    cancelAnimationFrame(physics.current.frame);
    drag.current = { start: clientY, y: physics.current.y, last: clientY, time: timeStamp, moved: false };
  }, []);

  const moveDrag = useCallback((clientY: number, timeStamp: number) => {
    const session = drag.current;
    if (!session) return false;
    const delta = clientY - session.start;
    if (!session.moved && Math.abs(delta) < 6) return false;
    session.moved = true;
    physics.current.velocity = (clientY - session.last) / Math.max(1, timeStamp - session.time) * 1000;
    session.last = clientY;
    session.time = timeStamp;
    const y = session.y + delta;
    physics.current.y = y < 0 ? y * 0.15 : y;
    paint();
    return true;
  }, [paint]);

  const endDrag = useCallback((timeStamp: number) => {
    const session = drag.current;
    drag.current = null;
    if (!session) return;
    const velocity = timeStamp - session.time > 100 ? 0 : physics.current.velocity;
    if (!session.moved) {
      settle(options.current.expanded ? 0 : sheetHeight() * 0.44, 0);
      return;
    }
    commitDrag(velocity);
  }, [commitDrag, settle, sheetHeight]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (options.current.exiting || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginDrag(event.clientY, event.timeStamp);
  }, [beginDrag]);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    moveDrag(event.clientY, event.timeStamp);
  }, [moveDrag]);
  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    endDrag(event.timeStamp);
  }, [endDrag]);
  const onPointerCancel = useCallback(() => {
    drag.current = null;
    settle(options.current.expanded ? 0 : sheetHeight() * 0.44, 0);
  }, [settle, sheetHeight]);

  /**
   * Scroll handoff on the body itself: the gesture only becomes a sheet drag once
   * the list is already at its top edge, otherwise it stays a plain scroll. Native
   * listeners are required — `touchmove` must be cancelable to stop the browser
   * from scrolling the container out from under the sheet.
   */
  useEffect(() => {
    if (!enabled) return;
    const element = bodyRef.current;
    if (!element) return;

    let startY = 0;
    let startX = 0;
    let engaged = false;
    let axisLocked: 'y' | 'x' | null = null;

    const onTouchStart = (event: TouchEvent) => {
      if (options.current.exiting || event.touches.length !== 1) return;
      const touch = event.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      engaged = false;
      axisLocked = null;
      cancelAnimationFrame(physics.current.frame);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (options.current.exiting || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;

      if (!axisLocked) {
        if (Math.abs(dx) > Math.abs(dy) + 4) axisLocked = 'x';
        else if (Math.abs(dy) > 6) axisLocked = 'y';
        else return;
        if (axisLocked === 'x') return;
        // Downward pull only takes over when the list is already at its top.
        if (dy > 0 && element.scrollTop > 0) { axisLocked = 'x'; return; }
      }
      if (axisLocked === 'x') return;

      if (!engaged) {
        if (dy <= 0) return;
        engaged = true;
        beginDrag(touch.clientY - dy, event.timeStamp);
      }
      if (event.cancelable) event.preventDefault();
      moveDrag(touch.clientY, event.timeStamp);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (axisLocked === 'x') return;
      if (!engaged) { drag.current = null; return; }
      engaged = false;
      axisLocked = null;
      endDrag(event.timeStamp);
    };

    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, beginDrag, moveDrag, endDrag]);

  return { panelRef, scrimRef, barRef, bodyRef, onPointerDown, onPointerMove, onPointerEnd, onPointerCancel };
}
