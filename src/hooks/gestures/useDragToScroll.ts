import { useEffect, useRef } from 'react';

export interface DragToScrollOptions<T extends HTMLElement = HTMLElement> {
  /** If false, drag-to-scroll is disabled. Default: true */
  enabled?: boolean;
  /** Direction to scroll: 'x' | 'y' | 'both'. Defaults to 'both' */
  direction?: 'x' | 'y' | 'both';
  /**
   * Custom function to get the horizontal scroll container.
   * Defaults to the element attached to the ref.
   */
  getContainerX?: (target: HTMLElement, container: T) => HTMLElement | null;
  /**
   * Custom function to get the vertical scroll container.
   * Defaults to the element attached to the ref.
   */
  getContainerY?: (target: HTMLElement, container: T) => HTMLElement | null;
  /**
   * Selector of elements that should be ignored when starting drag.
   * Defaults to interactive elements (buttons, inputs, draggable items, etc.)
   */
  ignoreSelector?: string;
  /**
   * Minimum distance in pixels before drag activates (suppressing click).
   * Default: 5px.
   */
  threshold?: number;
  /**
   * Whether to enable flick momentum. Default: true.
   */
  momentum?: boolean;
}

const DEFAULT_IGNORE =
  'button, a, input, textarea, select, [contenteditable="true"], [draggable="true"], [data-draggable="true"], [data-no-pan], [data-resize-handle], .cursor-ns-resize';

/**
 * Reusable hook for mouse grab-to-scroll (pan) with 1:1 direct tracking,
 * hysteresis threshold for click disambiguation, and Apple-style flick momentum.
 */
export function useDragToScroll<T extends HTMLElement = HTMLElement>(
  options: DragToScrollOptions<T> = {},
  externalRef?: React.RefObject<T | null>
): React.RefObject<T | null> {
  const internalRef = useRef<T | null>(null);
  const containerRef = externalRef || internalRef;

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isPointerDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let activeContainerX: HTMLElement | null = null;
    let activeContainerY: HTMLElement | null = null;
    let startScrollX = 0;
    let startScrollY = 0;
    let velocityHistory: Array<{ x: number; y: number; time: number }> = [];
    let momentumRafId: number | null = null;

    const stopMomentum = () => {
      if (momentumRafId !== null) {
        cancelAnimationFrame(momentumRafId);
        momentumRafId = null;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const opts = optionsRef.current;
      if (opts.enabled === false) return;
      if (document.body.hasAttribute('data-dnd-active')) return;
      // Only primary mouse button (left-click)
      if (e.pointerType !== 'mouse' || e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const ignore = opts.ignoreSelector
        ? `${DEFAULT_IGNORE}, ${opts.ignoreSelector}`
        : DEFAULT_IGNORE;
      if (target.closest(ignore)) return;

      stopMomentum();

      isPointerDown = true;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;

      activeContainerX = opts.getContainerX ? opts.getContainerX(target, container) : container;
      activeContainerY = opts.getContainerY ? opts.getContainerY(target, container) : container;

      startScrollX = activeContainerX ? activeContainerX.scrollLeft : 0;
      startScrollY = activeContainerY ? activeContainerY.scrollTop : 0;

      velocityHistory = [{ x: e.clientX, y: e.clientY, time: performance.now() }];

      window.addEventListener('pointermove', handlePointerMove, { passive: false });
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPointerDown) return;
      if (document.body.hasAttribute('data-dnd-active')) {
        isPointerDown = false;
        isDragging = false;
        return;
      }
      const opts = optionsRef.current;
      const threshold = opts.threshold ?? 5;
      const direction = opts.direction ?? 'both';

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!isDragging) {
        if (Math.hypot(dx, dy) >= threshold) {
          isDragging = true;
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
        }
      }

      if (isDragging) {
        e.preventDefault();

        if ((direction === 'x' || direction === 'both') && activeContainerX) {
          activeContainerX.scrollLeft = startScrollX - dx;
        }

        if ((direction === 'y' || direction === 'both') && activeContainerY) {
          activeContainerY.scrollTop = startScrollY - dy;
        }

        velocityHistory.push({ x: e.clientX, y: e.clientY, time: performance.now() });
        if (velocityHistory.length > 5) {
          velocityHistory.shift();
        }
      }
    };

    const handlePointerUp = () => {
      isPointerDown = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (isDragging) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Suppress trailing click event so underlying targets don't trigger actions
        const stopClick = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
        };
        window.addEventListener('click', stopClick, { capture: true, once: true });
        setTimeout(() => {
          window.removeEventListener('click', stopClick, { capture: true });
        }, 50);

        const opts = optionsRef.current;
        if (opts.momentum !== false) {
          const now = performance.now();
          const recent = velocityHistory.filter(p => now - p.time < 120);
          if (recent.length >= 2) {
            const first = recent[0];
            const last = recent[recent.length - 1];
            const dt = last.time - first.time;
            if (dt > 10) {
              let vx = (last.x - first.x) / dt;
              let vy = (last.y - first.y) / dt;
              const direction = opts.direction ?? 'both';

              if (Math.hypot(vx, vy) > 0.08) {
                let lastFrameTime = performance.now();
                const step = (frameNow: number) => {
                  const frameDt = Math.min(frameNow - lastFrameTime, 32);
                  lastFrameTime = frameNow;
                  const friction = Math.pow(0.92, frameDt / 16);
                  vx *= friction;
                  vy *= friction;

                  if ((direction === 'x' || direction === 'both') && activeContainerX) {
                    activeContainerX.scrollLeft -= vx * frameDt;
                  }
                  if ((direction === 'y' || direction === 'both') && activeContainerY) {
                    activeContainerY.scrollTop -= vy * frameDt;
                  }

                  if (Math.hypot(vx, vy) > 0.02) {
                    momentumRafId = requestAnimationFrame(step);
                  } else {
                    momentumRafId = null;
                  }
                };
                momentumRafId = requestAnimationFrame(step);
              }
            }
          }
        }

        isDragging = false;
      }
    };

    container.addEventListener('pointerdown', handlePointerDown);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      stopMomentum();
      if (isDragging) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [containerRef]);

  return containerRef;
}
