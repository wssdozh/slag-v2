// FLIP motion for a list: moved cards glide, one appended card rises, scroll stays still.
import { useLayoutEffect, useRef } from 'react';
import { motionEase, motionMs, prefersReducedMotion } from '../../lib/motion';

interface Options {
  selector?: string;
  /**
   * A single card appended at the end of the list rises from below by its own
   * height instead of fading in place. The feed turns this on so a new note comes
   * out from under the composer; a board without a dock keeps the plain landing.
   */
  enterFromBelow?: boolean;
  /** Read after the caller has compensated a prepend in its layout effect. */
  skipMotionRef?: React.RefObject<boolean>;
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
 * Moved cards glide from their previous box to the new one. When a single note is
 * appended, the list also settles to the bottom in the same frame: that scroll is
 * tracked while it moves and folded into the delta, so the cards above start where
 * the reader saw them instead of bouncing, and the transform and the scroll do not
 * add up. Other changes keep the plain content delta.
 *
 * A single card appended at the end lands instead: it rises from below by its own
 * height, so the composer covers it until it arrives. Any other insertion keeps
 * the short fade.
 */
export function useFlipLayout(
  containerRef: React.RefObject<HTMLElement | null>,
  signature: string,
  { selector = '[data-flip-id]', enterFromBelow = false, skipMotionRef }: Options = {},
) {
  const previousRef = useRef<Snapshot | null>(null);
  const scrollRef = useRef<Point>({ top: 0, left: 0 });
  const animationsRef = useRef(new Map<string, Animation>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const track = () => {
      scrollRef.current = { top: container.scrollTop, left: container.scrollLeft };
    };
    track();
    container.addEventListener('scroll', track, { passive: true });
    return () => container.removeEventListener('scroll', track);
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const origin = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const scrollLeft = container.scrollLeft;
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
      boxes.set(id, { top: box.top - origin.top + scrollTop, left: box.left - origin.left + scrollLeft });
    }

    const previous = previousRef.current;
    const previousScroll = scrollRef.current;
    previousRef.current = { ids, boxes };
    scrollRef.current = { top: scrollTop, left: scrollLeft };
    if (!previous) return;
    if (skipMotionRef?.current || prefersReducedMotion()) return;

    const added = [...ids].filter(id => !previous.ids.has(id));
    const grew = ids.size > previous.ids.size;
    const lastId = elements[elements.length - 1]?.dataset.flipId;
    // A card appended to a list that was already there; a folder switch replaces
    // the whole list and must not look like a note leaving the composer.
    const previousLastId = [...previous.ids].pop();
    const appended = previousLastId !== undefined && ids.has(previousLastId);
    // Only a note landing at the end brings the list settling to the bottom in the
    // same frame; other changes keep the content delta they always had.
    const followedScroll = appended && added.length === 1;

    for (const [id, box] of boxes) {
      const element = byId.get(id);
      if (!element) continue;

      if (added.includes(id)) {
        if (enterFromBelow && appended && added.length === 1 && id === lastId) {
          animationsRef.current.get(id)?.cancel();
          const gap = parseFloat(getComputedStyle(element).marginTop) || 0;
          animationsRef.current.set(id, element.animate(
            [
              { opacity: 0, transform: `translateY(${element.offsetHeight + gap}px)` },
              { opacity: 1, transform: 'none' },
            ],
            { duration: motionMs('slow'), easing: motionEase('entrance') },
          ));
        } else if (added.length === 1 && grew) {
          element.animate(
            [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
            { duration: motionMs('slow'), easing: motionEase('entrance') },
          );
        }
        continue;
      }

      const from = previous.boxes.get(id);
      if (!from) continue;
      // The settle is not screen motion, so the glide starts where the reader saw
      // the card.
      const dx = followedScroll
        ? (from.left - previousScroll.left) - (box.left - scrollLeft)
        : from.left - box.left;
      const dy = followedScroll
        ? (from.top - previousScroll.top) - (box.top - scrollTop)
        : from.top - box.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      animationsRef.current.get(id)?.cancel();
      animationsRef.current.set(id, element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: motionMs('slow'), easing: motionEase('standard') },
      ));
    }
  }, [containerRef, signature, selector, enterFromBelow, skipMotionRef]);

  useLayoutEffect(() => {
    const animations = animationsRef.current;
    return () => {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    };
  }, []);
}
