// Keeps a surface in the DOM through its exit transition, so CSS can finish it.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { TransitionEvent } from 'react';

type Phase = 'entering' | 'open' | 'exiting' | 'closed';

interface PresenceOptions {
  /**
   * Skip the `entering` phase for a surface that animates its own entrance with
   * the Web Animations API. `entering` exists to hand CSS a first frame at
   * opacity 0 and then flip it on the next frame — which costs a full re-render
   * in the middle of that same animation, and stalls the first frames of a heavy
   * tree (the editor). A surface that drives its own entrance has no use for it.
   */
  skipEntering?: boolean;
  /** A gesture spring reports completion instead of a CSS deadline. */
  manualExit?: boolean;
}

/** Keeps the existing DOM during exit. CSS owns the duration and destination. */
export function usePresence(open: boolean, { skipEntering = false, manualExit = false }: PresenceOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const initialPhase: Phase = open ? (skipEntering ? 'open' : 'entering') : 'closed';
  const [state, setState] = useState<{ open: boolean; phase: Phase }>({
    open,
    phase: initialPhase,
  });

  if (state.open !== open) {
    setState({
      open,
      phase: open ? (state.phase === 'closed' && !skipEntering ? 'entering' : 'open') : 'exiting',
    });
  }

  const finishExit = useCallback(() => {
    setState(current => current.phase === 'exiting'
      ? { open: false, phase: 'closed' }
      : current);
  }, []);

  /** End of the longest transition the exit started; never cut it short. */
  const exitDeadlineRef = useRef(0);

  useLayoutEffect(() => {
    const element = ref.current;
    // Every consumer renders the element while present, so a missing ref means the
    // surface is already gone and there is nothing left to time.
    if (!element) return;
    if (state.phase === 'entering') {
      // Commit the initial presentation before changing the transition target.
      void element.offsetWidth;
      const frame = requestAnimationFrame(() => {
        setState(current => current.phase === 'entering'
          ? { open: true, phase: 'open' }
          : current);
      });
      return () => cancelAnimationFrame(frame);
    }
    if (state.phase !== 'exiting' || manualExit) return;

    const style = getComputedStyle(element);
    const milliseconds = (value: string) => value.trim().endsWith('ms')
      ? parseFloat(value) : parseFloat(value) * 1000;
    const durations = style.transitionDuration.split(',').map(milliseconds);
    const delays = style.transitionDelay.split(',').map(milliseconds);
    const windowMs = Math.max(0, ...durations.map((duration, index) =>
      duration + delays[index % delays.length]));
    // Events may not fire (no property changed, cancelled transition, hidden tab).
    // The fallback follows the actual CSS, including reduced-motion overrides.
    exitDeadlineRef.current = performance.now() + windowMs;
    const timer = window.setTimeout(finishExit, windowMs);
    return () => window.clearTimeout(timer);
  }, [state.phase, finishExit, manualExit]);

  const onTransitionEnd = useCallback((event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return;
    if (getComputedStyle(event.currentTarget).opacity !== '0') return;
    // A surface can run a slower exit beside its fade (height, translate). The fade
    // ending first is not the end of the exit, so bind the finish to the window.
    if (performance.now() < exitDeadlineRef.current) return;
    finishExit();
  }, [finishExit]);

  return {
    ref,
    isPresent: open || state.phase !== 'closed',
    phase: state.phase,
    onTransitionEnd,
    finishExit,
  };
}
