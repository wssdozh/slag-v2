// Pull a list past either end to open search, with rubber-band damping.
import { useRef, useState } from 'react';
import { UI_GESTURES } from '../../config';

interface Options {
  onTrigger: () => void;
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
 * A horizontal drag never starts the gesture, and neither does a press that began in a field:
 * that is the keyboard, not a swipe.
 */
export function usePullToSearch({ onTrigger }: Options) {
  const [pull, setPull] = useState(0);
  const [side, setSide] = useState<Side | null>(null);
  const pullRef = useRef(0);
  const touchRef = useRef<{ x: number; y: number; anchorY: number | null } | null>(null);

  const move = (value: number) => {
    pullRef.current = value;
    setPull(value);
  };

  const stop = () => {
    touchRef.current = null;
    move(0);
    setSide(null);
  };

  const onTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchRef.current = { x: touch.clientX, y: touch.clientY, anchorY: null };
  };

  const onTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    const start = touchRef.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;

    const dy = start.y - touch.clientY;
    if (dy === 0) return;
    const nextSide: Side = dy > 0 ? 'bottom' : 'top';

    const node = event.currentTarget;
    const atEnd = nextSide === 'bottom'
      ? node.scrollTop + node.clientHeight >= node.scrollHeight - 2
      : node.scrollTop <= 2;
    if (!atEnd) {
      // Still scrolling: the anchor follows the finger so only the overflow part counts.
      start.anchorY = touch.clientY;
      if (pullRef.current !== 0) {
        move(0);
        setSide(null);
      }
      return;
    }

    if (start.anchorY === null) start.anchorY = touch.clientY;
    const travel = (start.anchorY - touch.clientY) * (nextSide === 'bottom' ? 1 : -1);
    if (travel <= 0 || Math.abs(touch.clientX - start.x) > Math.abs(travel)) {
      move(0);
      setSide(null);
      return;
    }
    setSide(nextSide);
    move(Math.min(travel * UI_GESTURES.SEARCH_PULL_DAMPING, UI_GESTURES.SEARCH_PULL_MAX_PX));
  };

  const onTouchEnd = () => {
    if (!touchRef.current) return;
    const pulled = pullRef.current;
    stop();
    if (pulled >= UI_GESTURES.SEARCH_PULL_PX) onTrigger();
  };

  return { pull, side, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: stop } };
}
