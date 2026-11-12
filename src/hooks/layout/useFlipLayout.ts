// FLIP motion for a list: moved cards glide, one new card lands, scroll stays still.
import { useLayoutEffect, useRef } from 'react';
import { motionEase, motionMs, prefersReducedMotion } from '../../lib/motion';

interface Options {
  selector?: string;
}

interface Point {
  top: number;
  left: number;
}

interface Snapshot {
  ids: Set<string>;
  boxes: Map<string, Point>;
}

/**
 * Layout motion for a list, driven by whatever `signature` the caller passes.
 *
 * Moved cards glide from their previous box to the new one. A single newly added
 * card lands instead, and survivors are not animated on growth: the feed already
 * scrolls itself to the bottom, and two motions in opposite directions wobble.
 *
 * Boxes are measured against the container, so scrolling never looks like layout.
 */
export function useFlipLayout(
  containerRef: React.RefObject<HTMLElement | null>,
  signature: string,
  { selector = '[data-flip-id]' }: Options = {},
) {
  const previousRef = useRef<Snapshot | null>(null);
  const animationsRef = useRef(new Map<string, Animation>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const origin = container.getBoundingClientRect();
    const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));
    const boxes = new Map<string, Point>();
    const ids = new Set<string>();
    const byId = new Map<string, HTMLElement>();
    for (const element of elements) {
      const id = element.dataset.flipId;
      if (!id) continue;
      const box = element.getBoundingClientRect();
      ids.add(id);
      byId.set(id, element);
      boxes.set(id, { top: box.top - origin.top + container.scrollTop, left: box.left - origin.left + container.scrollLeft });
    }

    const previous = previousRef.current;
    previousRef.current = { ids, boxes };
    if (!previous) return;
    if (prefersReducedMotion()) return;

    const added = [...ids].filter(id => !previous.ids.has(id));
    const grew = ids.size > previous.ids.size;

    for (const [id, box] of boxes) {
      const element = byId.get(id);
      if (!element) continue;

      if (added.includes(id) && added.length === 1 && grew) {
        element.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: motionMs('slow'), easing: motionEase('entrance') },
        );
        continue;
      }

      if (grew) continue;
      const from = previous.boxes.get(id);
      if (!from) continue;
      const dx = from.left - box.left;
      const dy = from.top - box.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      animationsRef.current.get(id)?.cancel();
      animationsRef.current.set(id, element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: motionMs('slow'), easing: motionEase('standard') },
      ));
    }
  }, [containerRef, signature, selector]);

  useLayoutEffect(() => {
    const animations = animationsRef.current;
    return () => {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    };
  }, []);
}
