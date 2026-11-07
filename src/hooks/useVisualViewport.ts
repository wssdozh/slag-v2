import { useEffect } from 'react';

/** Below this the visual viewport moved for a tap or the URL bar, not the keyboard. */
const KEYBOARD_FLOOR = 48;

/** How long the browser gets to lift the focused field on its own before we help. */
const KEYBOARD_GRACE_MS = 350;

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
    let resumeAt = 0;

    // Opening a keyboard either resizes the layout or pans the page, and both land
    // the focused field on screen by themselves. Lifting the composer on top of
    // that is what made it jump too high and then drop back onto the keyboard, so
    // the manual inset stays out of the way while the browser catches up.
    const onFocusIn = (event: FocusEvent) => {
      const field = event.target as HTMLElement | null;
      if (!field) return;
      if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA' || field.isContentEditable) {
        resumeAt = performance.now() + KEYBOARD_GRACE_MS;
      }
    };

    const publish = () => {
      frame = 0;
      // The layout viewport, not `window.innerHeight`: when the keyboard resizes
      // the layout, a bottom-anchored surface is already above it and the inset
      // must stay zero. Reading the lagging innerHeight here reported the whole
      // keyboard height mid-animation, which lifted the composer too far and then
      // dropped it back onto the keyboard.
      const layout = root.clientHeight;
      const overlap = layout - (viewport.height + viewport.offsetTop);
      const settled = performance.now() >= resumeAt;
      const inset = settled && overlap > KEYBOARD_FLOOR ? Math.round(overlap) : 0;
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
    document.addEventListener('focusin', onFocusIn);
    publish();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', onFocusIn);
      root.style.setProperty('--keyboard-inset-bottom', '0px');
    };
  }, []);
}
