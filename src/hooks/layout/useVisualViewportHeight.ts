import { useEffect } from 'react';

/**
 * Publishes the visual viewport height as `--vvh`.
 *
 * The app shell is sized from this instead of `100vh`. On Android the keyboard
 * does not resize the window, so a `100vh` shell stays taller than the visible
 * area and the platform pans the whole page to reach the focused field — the
 * header slides away and the composer jumps. A shell that tracks the visual
 * viewport shrinks with the keyboard: the header stays put and the composer rides
 * the keyboard edge frame by frame, the way a native chat does.
 *
 * Written straight to the root element: nothing re-renders per keyboard frame.
 */
export function useVisualViewportHeight() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const root = document.documentElement;
    let frame = 0;
    let applied = -1;

    const publish = () => {
      frame = 0;
      const height = Math.round(viewport.height);
      // The WebView shrinks with the keyboard on its own: visual viewport and
      // window agree, so the shell needs nothing and a write here would re-run
      // the whole app's layout on every keyboard frame for a value it ignores.
      if (Math.abs(height - window.innerHeight) <= 1) return;
      if (height === applied) return;
      applied = height;
      root.style.setProperty('--vvh', `${height}px`);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(publish);
    };

    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    window.addEventListener('orientationchange', schedule);
    publish();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      window.removeEventListener('orientationchange', schedule);
      root.style.removeProperty('--vvh');
    };
  }, []);
}
