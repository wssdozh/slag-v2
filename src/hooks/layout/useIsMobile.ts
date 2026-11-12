// Tracks whether the viewport sits below the mobile breakpoint, on load and resize.
import { useState, useEffect } from 'react';
import { UI_BREAKPOINTS } from '../../config';

/**
 * Hook to detect mobile screens (< 768px by default).
 * Responsive to window resizes and orientation changes.
 */
export function useIsMobile(breakpoint: number = UI_BREAKPOINTS.MOBILE): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    update(mql);

    if (mql.addEventListener) {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    } else {
      mql.addListener(update);
      return () => mql.removeListener(update);
    }
  }, [breakpoint]);

  return isMobile;
}
