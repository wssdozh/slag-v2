import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

export interface SheetPanelApi {
  /** Callback ref for the scrollable body: it owns the pull-to-fold handoff and the height cap. */
  setBody: (node: HTMLDivElement | null) => void;
  /** Callback ref for the chrome bar, which stays glued to the screen edge in every detent. */
  setBar: (node: HTMLDivElement | null) => void;
}

/** A pointer sample, kept only for the release velocity. */
interface PointerSample {
  y: number;
  time: number;
}

interface DragSession {
  start: number;
  y: number;
  moved: boolean;
  samples: PointerSample[];
}

/** How far ahead the release velocity is projected, in seconds of travel. */
const RELEASE_PROJECTION_SECONDS = 0.18;
/**
 * The fling may not carry the surface past the next detent on its own. Without this cap a
 * 320px pull from "whole" dismissed the sheet instead of folding it back whenever the last
 * pointer samples happened to be dense — the same gesture, two outcomes, decided by frames.
 */
const RELEASE_TRAVEL_CAP = 0.25;
/** A coalesced pair of pointer events can report a 32px jump in 1ms. */
const RELEASE_VELOCITY_CAP = 4000;
const RELEASE_WINDOW_MS = 100;
/** The spring is analytic and lands well inside this; the timer is a safety net. */
const SPRING_DEADLINE_MS = 1200;
/** A finger that rested this long before lifting is not a fling. */
const RELEASE_REST_MS = 100;

const clamp = (value: number, limit: number): number => Math.max(-limit, Math.min(limit, value));

/**
 * Release speed over a trailing window instead of the last sample pair: one noisy pair
 * decides whether the finger was a fling, and under load the events coalesce.
 */
function releaseVelocity(session: DragSession): number {
  const samples = session.samples;
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const elapsed = Math.max(8, last.time - samples[0].time);
  return clamp(((last.y - samples[0].y) / elapsed) * 1000, RELEASE_VELOCITY_CAP);
}

export interface SheetPanelProps {
  /** Off on desktop: the same markup becomes a plain panel and the spring never runs. */
  enabled: boolean;
  expanded: boolean;
  exiting: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDismiss: () => void;
  onExited: () => void;
  /** Share of the viewport still covered at rest: 0.22 for the picker, 0.44 for the editor. */
  rest?: number;
  testId?: string;
  scrimClassName?: string;
  panelClassName?: string;
  contentClassName?: string;
  children: (api: SheetPanelApi) => React.ReactNode;
}

/**
 * The app's one two-detent bottom sheet: a spring that moves a full-height surface between
 * "half" and "whole screen", a handle that drags it, a scrim that follows it and a scroll
 * handoff that folds it from the top of the body.
 *
 * The surface only ever *moves*. Sizes change exactly once per detent — the body's max-height —
 * because resizing the content every pointer frame is what turns a spring into a slideshow of
 * layouts. The bar is counter-translated by the spring instead, so it stays on the screen edge
 * while the panel travels.
 *
 * The motion is painted from `requestAnimationFrame`, so it is not a CSS animation and
 * `getAnimations()` never reports it. `data-sheet-rest` is how the surface says it has arrived:
 * present while the spring sits on a detent, absent while it travels. Tests wait on that instead
 * of guessing a duration.
 */
export const SheetPanel: React.FC<SheetPanelProps> = ({
  enabled,
  expanded,
  exiting,
  onExpandedChange,
  onDismiss,
  onExited,
  rest = 0.44,
  testId,
  scrimClassName,
  panelClassName,
  contentClassName,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const bodyNodeRef = useRef<HTMLDivElement | null>(null);
  const barNodeRef = useRef<HTMLDivElement | null>(null);
  const [bodyNode, setBody] = useState<HTMLDivElement | null>(null);
  const [barNode, setBar] = useState<HTMLDivElement | null>(null);
  const physics = useRef({
    y: 0,
    velocity: 0,
    target: 0,
    frame: 0,
    timer: 0,
    time: 0,
    height: 0,
    initialized: false,
  });
  const drag = useRef<DragSession | null>(null);
  const options = useRef({ expanded, exiting, rest, onExpandedChange, onDismiss, onExited });
  useLayoutEffect(() => {
    options.current = { expanded, exiting, rest, onExpandedChange, onDismiss, onExited };
  });

  // The spring paints outside React, so it reads the bar through a ref that follows the node.
  useLayoutEffect(() => {
    bodyNodeRef.current = bodyNode;
    barNodeRef.current = barNode;
  }, [bodyNode, barNode]);

  /** The spring is the only thing that knows when the surface has arrived. */
  const setRest = useCallback((rest: boolean) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (rest) panel.dataset.sheetRest = 'true';
    else delete panel.dataset.sheetRest;
  }, []);

  const paint = useCallback(() => {
    const state = physics.current;
    const height = state.height;
    if (panelRef.current) panelRef.current.style.transform = `translate3d(0, ${state.y}px, 0)`;
    if (barNodeRef.current) {
      // Chrome travels opposite to the panel, so it sits on the screen edge in both detents.
      barNodeRef.current.style.transform = `translate3d(0, ${-Math.min(state.y, height * options.current.rest)}px, 0)`;
    }
    if (scrimRef.current) {
      const exposed = Math.max(1, height * (1 - options.current.rest));
      scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, (height - state.y) / exposed)));
    }
  }, []);

  /** One measurement per detent: the body fills what the chrome leaves, and never the bar. */
  const applyBodyCap = useCallback(() => {
    const panel = panelRef.current;
    const body = bodyNodeRef.current;
    if (!panel || !body) return;
    const panelBox = panel.getBoundingClientRect();
    const visible = panelBox.height * (options.current.expanded ? 1 : 1 - options.current.rest);
    const top = body.getBoundingClientRect().top - panelBox.top;
    const bar = barNodeRef.current?.offsetHeight ?? 0;
    body.style.maxHeight = `${Math.max(96, visible - top - bar)}px`;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    applyBodyCap();
  }, [applyBodyCap, enabled, expanded, bodyNode]);

  const settle = useCallback((target: number, velocity?: number) => {
    const state = physics.current;
    cancelAnimationFrame(state.frame);
    window.clearTimeout(state.timer);
    state.target = target;
    if (velocity !== undefined) state.velocity = velocity;
    state.time = 0;
    setRest(false);
    const finish = () => {
      cancelAnimationFrame(state.frame);
      window.clearTimeout(state.timer);
      state.y = state.target;
      state.velocity = 0;
      paint();
      setRest(true);
      if (options.current.exiting) options.current.onExited();
    };
    if (prefersReducedMotion()) { finish(); return; }
    // A paused frame loop — hidden tab, a throttled WebView — would otherwise leave the
    // surface between detents forever and never report the exit. Every spring is bounded.
    state.timer = window.setTimeout(finish, SPRING_DEADLINE_MS);
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
  }, [paint, setRest]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const update = () => {
      const height = panelRef.current?.parentElement?.clientHeight ?? window.innerHeight;
      const state = physics.current;
      state.height = height;
      if (!state.initialized) {
        state.initialized = true;
        state.y = prefersReducedMotion() ? height * options.current.rest : height;
        paint();
      }
      settle(exiting ? height + 16 : expanded ? 0 : height * options.current.rest);
    };
    update();
    const state = physics.current;
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      cancelAnimationFrame(state.frame);
      window.clearTimeout(state.timer);
    };
  }, [enabled, expanded, exiting, paint, settle]);

  const sheetHeight = useCallback(
    () => panelRef.current?.parentElement?.clientHeight ?? window.innerHeight,
    [],
  );

  /**
   * Where the sheet lands when the finger lifts. A folded sheet grows to half before it reads as
   * dismiss; a whole one folds back before it may leave, so a single pull never skips a stage.
   */
  const commitDrag = useCallback((velocity: number) => {
    const height = sheetHeight();
    const half = height * options.current.rest;
    const state = physics.current;
    const wasExpanded = options.current.expanded;
    // The release velocity decides the detent, never the whole gesture: capped, so a fling
    // cannot skip a detent and two identical pulls cannot land in different places.
    const projected = state.y + clamp(velocity * RELEASE_PROJECTION_SECONDS, height * RELEASE_TRAVEL_CAP);
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
    window.clearTimeout(physics.current.timer);
    setRest(false);
    drag.current = {
      start: clientY,
      y: physics.current.y,
      moved: false,
      samples: [{ y: clientY, time: timeStamp }],
    };
  }, [setRest]);

  const moveDrag = useCallback((clientY: number, timeStamp: number) => {
    const session = drag.current;
    if (!session) return false;
    const delta = clientY - session.start;
    if (!session.moved && Math.abs(delta) < 6) return false;
    session.moved = true;
    const samples = session.samples;
    samples.push({ y: clientY, time: timeStamp });
    while (samples.length > 2 && timeStamp - samples[0].time > RELEASE_WINDOW_MS) samples.shift();
    physics.current.velocity = releaseVelocity(session);
    const y = session.y + delta;
    physics.current.y = y < 0 ? y * 0.15 : y;
    paint();
    return true;
  }, [paint]);

  const endDrag = useCallback((timeStamp: number) => {
    const session = drag.current;
    drag.current = null;
    if (!session) return;
    if (!session.moved) {
      settle(options.current.expanded ? 0 : sheetHeight() * options.current.rest, 0);
      return;
    }
    const last = session.samples[session.samples.length - 1];
    // A finger that came to rest before lifting is not a fling.
    const velocity = timeStamp - last.time > RELEASE_REST_MS ? 0 : releaseVelocity(session);
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
    settle(options.current.expanded ? 0 : sheetHeight() * options.current.rest, 0);
  }, [settle, sheetHeight]);

  /**
   * Scroll handoff on the body itself: the gesture only becomes a sheet drag once the list is
   * already at its top edge, otherwise it stays a plain scroll. Native listeners are required —
   * `touchmove` must be cancelable to stop the browser from scrolling the container out from
   * under the sheet. Bound per node, because a tab switch swaps the scroller.
   */
  useEffect(() => {
    if (!enabled || !bodyNode) return;
    const element = bodyNode;

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
  }, [enabled, bodyNode, beginDrag, moveDrag, endDrag]);

  if (!enabled) {
    return (
      <div data-testid={testId} className={[panelClassName, contentClassName].filter(Boolean).join(' ')}>
        {children({ setBody, setBar })}
      </div>
    );
  }

  return (
    <>
      <div ref={scrimRef} onClick={onDismiss} className={`absolute inset-0 ${scrimClassName ?? ''}`} />

      <div
        ref={panelRef}
        data-testid={testId}
        data-motion-state={exiting ? 'exiting' : undefined}
        data-expanded={expanded || undefined}
        className={`sheet-spring absolute inset-0 flex flex-col overflow-hidden ${panelClassName ?? ''}`}
      >
        <div className={`flex min-h-0 flex-1 flex-col ${contentClassName ?? ''}`}>
          {/* The handle owns the gesture. Folded it has a pill, unfolded it stays a thin strip
              at the edge: pulling down must work from either detent. */}
          <div
            data-sheet-handle
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerCancel}
            style={{ touchAction: 'none' }}
            className={`flex shrink-0 cursor-grab items-center justify-center ${expanded ? 'h-3' : 'h-6'}`}
          >
            {!expanded && <div className="h-1 w-8 shrink-0 rounded-full bg-white/20" />}
          </div>

          {children({ setBody, setBar })}
        </div>
      </div>
    </>
  );
};



