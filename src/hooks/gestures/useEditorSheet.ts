import { useCallback, useLayoutEffect, useRef } from 'react';
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

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (options.current.exiting || (event.pointerType === 'mouse' && event.button !== 0)) return;
    cancelAnimationFrame(physics.current.frame);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: event.clientY, y: physics.current.y, last: event.clientY, time: event.timeStamp, moved: false };
  }, []);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const session = drag.current;
    if (!session) return;
    const delta = event.clientY - session.start;
    if (!session.moved && Math.abs(delta) < 6) return;
    session.moved = true;
    physics.current.velocity = (event.clientY - session.last) / Math.max(1, event.timeStamp - session.time) * 1000;
    session.last = event.clientY;
    session.time = event.timeStamp;
    const y = session.y + delta;
    physics.current.y = y < 0 ? y * 0.15 : y;
    paint();
  }, [paint]);
  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const session = drag.current;
    drag.current = null;
    if (!session) return;
    const height = panelRef.current?.parentElement?.clientHeight ?? window.innerHeight;
    const half = height * 0.44;
    const state = physics.current;
    const velocity = event.timeStamp - session.time > 100 ? 0 : state.velocity;
    const projected = state.y + velocity * 0.18;
    const wasExpanded = options.current.expanded;
    if (!wasExpanded && projected > half + height * 0.18) {
      options.current.onDismiss();
      return;
    }
    const nextExpanded = projected < (wasExpanded ? half * 0.35 : half * 0.75);
    options.current.onExpandedChange(nextExpanded);
    settle(nextExpanded ? 0 : half, velocity);
  }, [settle]);
  const onPointerCancel = useCallback(() => {
    drag.current = null;
    const height = panelRef.current?.parentElement?.clientHeight ?? window.innerHeight;
    settle(options.current.expanded ? 0 : height * 0.44, 0);
  }, [settle]);
  return { panelRef, scrimRef, barRef, onPointerDown, onPointerMove, onPointerEnd, onPointerCancel };
}
