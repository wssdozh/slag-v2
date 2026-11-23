// Interactive back on the phone feed: one axis owns the touch until it ends.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { motionEase, motionMs, prefersReducedMotion } from '../../lib/motion';

const SLOP = 10;
const FLICK_SPEED = 0.55; // CSS pixels per millisecond
const FEED = '[data-testid="feed-list-container"], [data-testid="pinned-banner"]';
const EXCLUDE = '[data-swipe-ignore], .overflow-x-auto, input, textarea, select, [contenteditable], audio, video';
const translate = (x: number) => `translate3d(${x}px, 0, 0)`;

export function useFeedBackSwipe(enabled: boolean, onBack: (animate: boolean) => void) {
  const screenRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const node = screenRef.current;
    if (!node || !enabled) return;
    const screen = node;
    let drag: { id: number; x: number; y: number; offset: number; locked: boolean; lastX: number; lastTime: number; velocity: number } | null = null;
    let settle: Animation | null = null;
    let width = 0;
    let offset = 0;
    let reduced = false;

    function paint(x: number) {
      offset = Math.max(0, Math.min(width, x));
      screen.style.transform = reduced ? '' : translate(offset);
    }

    function finish(commit: boolean) {
      drag = null;
      settle?.cancel();
      const done = () => {
        screen.style.removeProperty('transform');
        offset = 0;
        setPreview(false);
        if (commit) onBack(false);
      };
      if (reduced || offset === 0) {
        done();
        return;
      }
      const animation = screen.animate([
        { transform: translate(offset) }, { transform: translate(commit ? width : 0) },
      ], { duration: motionMs('base'), easing: motionEase('entrance'), fill: 'forwards' });
      settle = animation;
      animation.onfinish = () => {
        settle = null;
        flushSync(done);
        animation.cancel();
      };
    }

    function start(event: TouchEvent) {
      if (event.touches.length !== 1) {
        if (drag?.locked) finish(false);
        drag = null;
        return;
      }
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(FEED) || target.closest(EXCLUDE)) return;
      const touch = event.touches[0];
      width = screen.clientWidth;
      reduced = prefersReducedMotion();
      const grabbing = settle !== null;
      if (settle) {
        const transform = getComputedStyle(screen).transform;
        settle.cancel();
        settle = null;
        paint(transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41);
      }
      drag = { id: touch.identifier, x: touch.clientX, y: touch.clientY, offset, locked: grabbing,
        lastX: touch.clientX, lastTime: event.timeStamp, velocity: 0 };
      if (grabbing && event.cancelable) event.preventDefault();
    }

    function move(event: TouchEvent) {
      if (!drag) return;
      const touch = event.touches[0];
      if (!touch || touch.identifier !== drag.id) return;
      const dx = touch.clientX - drag.x;
      const dy = Math.abs(touch.clientY - drag.y);
      if (!drag.locked) {
        if (Math.hypot(dx, dy) < SLOP) return;
        if (dx <= dy * 1.5 || !event.cancelable) {
          drag = null;
          return;
        }
        drag.locked = true;
        if (!reduced) setPreview(true);
      }
      if (event.cancelable) event.preventDefault();
      drag.velocity = (touch.clientX - drag.lastX) / Math.max(1, event.timeStamp - drag.lastTime);
      drag.lastX = touch.clientX;
      drag.lastTime = event.timeStamp;
      paint(drag.offset + dx);
    }

    function end(event: TouchEvent) {
      if (!drag?.locked) {
        drag = null;
        return;
      }
      const ended = event.type === 'touchend';
      const touch = event.changedTouches[0];
      if (ended && touch?.identifier === drag.id) paint(drag.offset + touch.clientX - drag.x);
      const velocity = event.timeStamp - drag.lastTime < 85 ? drag.velocity : 0;
      const commit = ended && velocity > -FLICK_SPEED &&
        (offset >= width * 0.28 || (offset >= 36 && velocity >= FLICK_SPEED));
      finish(commit);
    }

    screen.addEventListener('touchstart', start, { passive: false });
    screen.addEventListener('touchmove', move, { passive: false });
    screen.addEventListener('touchend', end);
    screen.addEventListener('touchcancel', end);
    return () => {
      screen.removeEventListener('touchstart', start);
      screen.removeEventListener('touchmove', move);
      screen.removeEventListener('touchend', end);
      screen.removeEventListener('touchcancel', end);
      settle?.cancel();
      screen.style.removeProperty('transform');
      setPreview(false);
    };
  }, [enabled, onBack]);

  return { screenRef, preview: enabled && preview };
}
