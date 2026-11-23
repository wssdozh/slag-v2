// Pull a list past either end to open search, with rubber-band damping.
import { useEffect, useRef, useState } from 'react';
import { UI_GESTURES } from '../../config';
import { prefersReducedMotion } from '../../lib/motion';

interface Options {
  onTrigger: () => void;
  /** The folder root has no "newest end": only a pull down from the top opens search. */
  topOnly?: boolean;
}

type Side = 'top' | 'bottom';

/**
 * Pull a list past either end to open search.
 *
 * At the newest end the finger goes up, at the oldest end it goes down; in both cases the list
 * cannot move any further, so the hint travels instead. Travel is damped like a rubber band, and
 * it is measured from the moment the list actually ran out — a drag that starts in the middle of
 * a scrollable list keeps its travel for the scroll and only the last part counts here.
 *
 * `offset` is the signed translation the surface should wear: positive while the top edge is
 * open, negative at the bottom. Releasing glides back to 0 instead of snapping, unless the user
 * asked for reduced motion.
 *
 * A horizontal drag never starts the gesture, a second finger cancels it, and a press that began
 * in a field is the keyboard, not a swipe. Re-grabbing the surface while it glides home cannot
 * open search: the new gesture has to earn the threshold with its own travel, so a tap during
 * the return neither opens anything nor drags the remaining pull onto the opposite edge.
 */
export function usePullToSearch({ onTrigger, topOnly = false }: Options) {
  const [pull, setPull] = useState(0);
  const [side, setSide] = useState<Side | null>(null);
  const pullRef = useRef(0);
  const sideRef = useRef<Side | null>(null);
  const touchRef = useRef<{ x: number; y: number; anchorY: number | null; startPull: number } | null>(null);
  // Damped travel this gesture earned on its own, excluding any pulled-back remainder.
  const ownTravelRef = useRef(0);
  const frameRef = useRef(0);
  const settleRef = useRef(0);

  const commit = (value: number, nextSide: Side | null) => {
    pullRef.current = value;
    sideRef.current = nextSide;
    setPull(value);
    setSide(nextSide);
  };

  // A burst of touchmoves repaints the surface once per frame, not once per event.
  const schedule = (value: number, nextSide: Side | null) => {
    pullRef.current = value;
    sideRef.current = nextSide;
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      setPull(pullRef.current);
      setSide(sideRef.current);
    });
  };

  const cancelFrame = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  };

  const cancelSettle = () => {
    if (settleRef.current) cancelAnimationFrame(settleRef.current);
    settleRef.current = 0;
  };

  // Released or cancelled: the surface glides home instead of snapping. Reduced motion skips
  // the glide — the preference is about travel, not about swallowing the state change.
  const settle = () => {
    cancelSettle();
    cancelFrame();
    touchRef.current = null;
    const from = pullRef.current;
    if (from === 0) {
      commit(0, null);
      return;
    }
    if (prefersReducedMotion()) {
      commit(0, null);
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / UI_GESTURES.SEARCH_PULL_SETTLE_MS);
      const eased = 1 - (1 - progress) ** 3;
      if (progress < 1) {
        commit(from * (1 - eased), sideRef.current);
        settleRef.current = requestAnimationFrame(step);
      } else {
        settleRef.current = 0;
        commit(0, null);
      }
    };
    settleRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (settleRef.current) cancelAnimationFrame(settleRef.current);
  }, []);

  const onTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (event.touches.length > 1) {
      // A second finger is not a pull; drop the gesture and let the surface go home.
      settle();
      return;
    }
    // A press that starts in a field is the keyboard, not a swipe.
    if (event.target instanceof Element
      && event.target.closest('input, textarea, [contenteditable="true"]')) {
      touchRef.current = null;
      return;
    }
    cancelSettle();
    cancelFrame();
    const touch = event.touches[0];
    if (!touch) return;
    ownTravelRef.current = 0;
    touchRef.current = { x: touch.clientX, y: touch.clientY, anchorY: null, startPull: 0 };
  };

  const onTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    const start = touchRef.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    if (event.touches.length > 1) {
      settle();
      return;
    }
    if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;

    const dy = start.y - touch.clientY;
    if (dy === 0) return;
    const nextSide: Side = dy > 0 ? 'bottom' : 'top';
    if (topOnly && nextSide === 'bottom') {
      if (pullRef.current !== 0) schedule(0, null);
      return;
    }

    const node = event.currentTarget;
    const atEnd = nextSide === 'bottom'
      ? node.scrollTop + node.clientHeight >= node.scrollHeight - 2
      : node.scrollTop <= 2;
    if (!atEnd) {
      // Still scrolling: the anchor follows the finger so only the overflow part counts.
      start.anchorY = touch.clientY;
      start.startPull = 0;
      if (pullRef.current !== 0) schedule(0, null);
      return;
    }

    if (start.anchorY === null) {
      // Re-grabbing a surface that is still gliding home continues the motion only in the same
      // direction; the remainder never jumps to the other edge, and it never counts as travel
      // this gesture earned.
      const carried = sideRef.current === nextSide
        ? pullRef.current / UI_GESTURES.SEARCH_PULL_DAMPING
        : 0;
      start.startPull = carried > 0 ? pullRef.current : 0;
      start.anchorY = carried > 0
        ? (nextSide === 'top' ? touch.clientY - carried : touch.clientY + carried)
        : touch.clientY;
    }
    const travel = (start.anchorY - touch.clientY) * (nextSide === 'bottom' ? 1 : -1);
    if (travel <= 0 || Math.abs(touch.clientX - start.x) > Math.abs(travel)) {
      schedule(0, null);
      return;
    }
    const value = Math.min(travel * UI_GESTURES.SEARCH_PULL_DAMPING, UI_GESTURES.SEARCH_PULL_MAX_PX);
    ownTravelRef.current = Math.max(ownTravelRef.current, value - start.startPull);
    schedule(value, nextSide);
  };

  const onTouchEnd = () => {
    if (!touchRef.current) return;
    const pulled = pullRef.current;
    const ownTravel = ownTravelRef.current;
    settle();
    // Opening is earned by this gesture's own travel: a tap on a returning surface has none.
    if (pulled >= UI_GESTURES.SEARCH_PULL_PX && ownTravel >= UI_GESTURES.SEARCH_PULL_PX) onTrigger();
  };

  const onTouchCancel = () => {
    if (!touchRef.current) return;
    settle();
  };

  const offset = side === 'top' ? pull : side === 'bottom' ? -pull : 0;

  return { pull, side, offset, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } };
}
