import { useRef, useState } from 'react';
import { UI_GESTURES } from '../../config';

interface Options {
  onTrigger: () => void;
}

/**
 * Pull past the end of the list to open search.
 *
 * The feed is pinned to its newest end, so "further up" is the one direction with nothing left
 * to reveal: the list stays put and the hint travels instead. A list that can still scroll never
 * starts the gesture, and so does a horizontal drag or a press that began in a field — that is
 * the keyboard, not a swipe.
 */
export function usePullToSearch({ onTrigger }: Options) {
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const move = (value: number) => {
    pullRef.current = value;
    setPull(value);
  };

  const onTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const node = event.currentTarget;
    const atEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 2;
    startRef.current = atEnd ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const onTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    const start = startRef.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) return;
    const dy = start.y - touch.clientY;
    if (dy <= 0 || Math.abs(touch.clientX - start.x) > dy) {
      move(0);
      return;
    }
    move(Math.min(dy, UI_GESTURES.SEARCH_PULL_MAX_PX));
  };

  const onTouchEnd = () => {
    if (!startRef.current) return;
    startRef.current = null;
    const pulled = pullRef.current;
    move(0);
    if (pulled >= UI_GESTURES.SEARCH_PULL_PX) onTrigger();
  };

  const onTouchCancel = () => {
    startRef.current = null;
    move(0);
  };

  return { pull, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } };
}
