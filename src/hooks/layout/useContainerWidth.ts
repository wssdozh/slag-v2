import { useState, useEffect } from 'react';

/**
 * Lightweight hook to measure an element's container width via ResizeObserver.
 * Critical for multi-panel / dockview environments where panels resize independently of window.
 */
export function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set initial measured width
    setWidth(el.offsetWidth);

    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === el) {
          const newWidth = Math.round(entry.contentRect.width || el.offsetWidth);
          setWidth(newWidth);
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}
