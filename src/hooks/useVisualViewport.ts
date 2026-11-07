import { useEffect } from 'react';

/** Below this the visual viewport moved for a tap or the URL bar, not the keyboard. */
const KEYBOARD_FLOOR = 48;

/**
 * Publishes the virtual keyboard inset as `--keyboard-inset-bottom`.
 *
 * Nothing renders from it: the value is written straight to the root element, so a
 * keyboard slide does not re-render the tree. Events are coalesced to one write per
 * frame, because the OS reports intermediate viewport sizes while the keyboard
 * travels and an unthrottled write makes the composer shake.
 */
export function useVisualViewport() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const root = document.documentElement;
    let frame = 0;
    let applied = -1;

    const publish = () => {
      frame = 0;
      // The layout viewport, not `window.innerHeight`: when the keyboard resizes
      // the layout, a bottom-anchored surface is already above it and the inset
      // must stay zero. Reading the lagging innerHeight here reported the whole
      // keyboard height mid-animation, which lifted the composer too far and then
      // dropped it back onto the keyboard.
      const layout = root.clientHeight;
      const overlap = layout - (viewport.height + viewport.offsetTop);
      const inset = overlap > KEYBOARD_FLOOR ? Math.round(overlap) : 0;
      if (inset === applied) return;
      applied = inset;
      root.style.setProperty('--keyboard-inset-bottom', `${inset}px`);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(publish);
    };

    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    publish();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      root.style.setProperty('--keyboard-inset-bottom', '0px');
    };
  }, []);
}
