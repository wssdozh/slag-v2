import { useLayoutEffect, type ComponentPropsWithoutRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface AnchoredPopoverProps extends ComponentPropsWithoutRef<'div'> {
  surfaceRef: RefObject<HTMLDivElement | null>;
  getAnchor: () => HTMLElement | null;
  isOpen: boolean;
  direction?: 'up' | 'down' | 'auto';
  align?: 'start' | 'end';
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
  matchAnchorWidth?: boolean;
}

/** Keep an anchored surface in the visible window, outside any scrolling parent. */
export function AnchoredPopover({
  surfaceRef, getAnchor, isOpen, direction = 'auto', align = 'start',
  minWidth = 0, maxWidth = Infinity, maxHeight = Infinity, matchAnchorWidth = false,
  className = '', ...props
}: AnchoredPopoverProps) {
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!isOpen || !surface) return;
    const viewport = window.visualViewport;
    const gap = 6;
    const margin = 8;
    let frame = 0;

    function place() {
      frame = 0;
      if (!surface) return;
      const anchor = getAnchor()?.getBoundingClientRect();
      const leftEdge = (viewport?.offsetLeft ?? 0) + margin;
      const topEdge = (viewport?.offsetTop ?? 0) + margin;
      const availableWidth = Math.max(0, (viewport?.width ?? window.innerWidth) - 2 * margin);
      const availableHeight = Math.max(0, (viewport?.height ?? window.innerHeight) - 2 * margin);
      const rightEdge = leftEdge + availableWidth;
      const bottomEdge = topEdge + availableHeight;
      const widthLimit = Math.min(maxWidth, availableWidth);

      // Measure with the full window width available, even if the last position was near the right edge.
      surface.style.left = `${leftEdge}px`;
      surface.style.maxWidth = `${widthLimit}px`;
      surface.style.minWidth = `${Math.min(widthLimit, Math.max(minWidth, matchAnchorWidth ? anchor?.width ?? 0 : 0))}px`;
      surface.style.maxHeight = `${Math.min(maxHeight, availableHeight)}px`;
      // Offset dimensions ignore the entrance transform, unlike getBoundingClientRect().
      const width = surface.offsetWidth;
      const height = surface.offsetHeight;
      let left = leftEdge + (availableWidth - width) / 2;
      let top = topEdge + (availableHeight - height) / 2;

      if (anchor) {
        const above = anchor.top - gap - topEdge;
        const below = bottomEdge - anchor.bottom - gap;
        const up = direction === 'up' ? above >= height || below < height && above >= below
          : below < height && (above >= height || above > below);
        left = align === 'end' ? anchor.right - width : anchor.left;
        top = up ? anchor.top - gap - height : anchor.bottom + gap;
      }

      surface.style.left = `${Math.max(leftEdge, Math.min(left, rightEdge - width))}px`;
      surface.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - height))}px`;
    }

    const schedule = (event?: Event) => {
      if (event?.target instanceof Node && surface.contains(event.target)) return;
      if (!frame) frame = requestAnimationFrame(place);
    };
    const observer = new ResizeObserver(() => schedule());
    observer.observe(surface);
    const anchor = getAnchor();
    if (anchor) observer.observe(anchor);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    place();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
    };
  }, [surfaceRef, getAnchor, isOpen, direction, align, minWidth, maxWidth, maxHeight, matchAnchorWidth]);

  return createPortal(
    <div {...props} ref={surfaceRef} inert={!isOpen} className={`fixed overflow-auto overscroll-contain scrollbar-thin ${className}`} />,
    document.body,
  );
}
