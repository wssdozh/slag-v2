// Reads the CSS motion tokens as numbers, so JS animation timing matches theme.css.
import { flushSync } from 'react-dom';

/**
 * Bridges the CSS motion scale into the few places that need numbers in JS.
 * Timing lives in `theme.css`; nothing here invents a second duration.
 */

export type MotionToken = 'instant' | 'fast' | 'base' | 'slow';
export type MotionEase = 'standard' | 'entrance' | 'settle';

const FALLBACK_MS: Record<MotionToken, number> = {
  instant: 75,
  fast: 100,
  base: 150,
  slow: 200,
};

const FALLBACK_EASE: Record<MotionEase, string> = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
  settle: 'cubic-bezier(0.16, 1.12, 0.3, 1)',
};

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function motionMs(token: MotionToken): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--slag-motion-${token}`).trim();
  if (!raw) return FALLBACK_MS[token];
  const value = raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
  return Number.isFinite(value) ? value : FALLBACK_MS[token];
}

export function motionEase(token: MotionEase): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--ease-${token}`).trim();
  return raw || FALLBACK_EASE[token];
}

/**
 * A phone viewport. Below this width the surface is the whole window, so a clip
 * window grown out of a card is neither readable nor cheap: Android WebView
 * repaints `clip-path` on the main thread, and the main thread is also busy
 * mounting the surface. Phones get a compositor-only move instead.
 */
function isPhoneViewport(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

/**
 * Opens a full-bleed surface out of the card that was tapped. The clip window
 * grows from the card's box to the viewport, so no text is ever stretched by a
 * non-uniform scale.
 */
export function expandFromRect(origin: HTMLElement, target: HTMLElement): void {
  if (prefersReducedMotion()) return;
  if (isPhoneViewport()) {
    enterFromEdge(target, 44);
    return;
  }
  const from = origin.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width < 8 || from.height < 8 || to.width < 8 || to.height < 8) return;

  const top = Math.max(0, from.top - to.top);
  const left = Math.max(0, from.left - to.left);
  const right = Math.max(0, to.right - from.right);
  const bottom = Math.max(0, to.bottom - from.bottom);
  const distance = Math.hypot(left - 0, top - 0) + (to.width - from.width) * 0.25;

  target.animate(
    [
      { clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round 12px)` },
      { clipPath: 'inset(0px round 0px)' },
    ],
    {
      duration: Math.min(200, Math.max(150, distance * 0.2)),
      easing: 'ease-out',
    },
  );
}

/**
 * Rise-into-place for a surface that arrives without a box to grow from. The
 * fade lives here rather than in a `motion-fade` class: two independent owners
 * of the same opacity fight over the first frames, which is what made the
 * surface look cut off. Only `transform` and `opacity` animate, so the whole
 * thing stays on the compositor.
 */
export function enterFromEdge(target: HTMLElement, distance = 18): Animation | undefined {
  if (prefersReducedMotion()) return undefined;
  return target.animate(
    [
      { transform: `translateY(${distance}px) scale(0.99)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: motionMs('slow'), easing: motionEase('entrance') },
  );
}

/** The matching way back for a surface that has no card to collapse into. */
export function exitToEdge(target: HTMLElement, distance = 18): Animation | undefined {
  if (prefersReducedMotion()) return undefined;
  return target.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: `translateY(${distance}px) scale(0.99)`, opacity: 0 },
    ],
    { duration: motionMs('base'), easing: motionEase('standard'), fill: 'forwards' },
  );
}

/**
 * Collapses the full-bleed surface back into the origin card on exit,
 * providing symmetric reverse motion.
 */
export function collapseToRect(target: HTMLElement, dest: HTMLElement): Animation | undefined {
  if (prefersReducedMotion()) return undefined;
  if (isPhoneViewport()) return exitToEdge(target, 44);
  const to = dest.getBoundingClientRect();
  const from = target.getBoundingClientRect();
  if (to.width < 8 || to.height < 8 || from.width < 8 || from.height < 8) return undefined;

  const top = Math.max(0, to.top - from.top);
  const left = Math.max(0, to.left - from.left);
  const right = Math.max(0, from.right - to.right);
  const bottom = Math.max(0, from.bottom - to.bottom);
  const distance = Math.hypot(left - 0, top - 0) + (from.width - to.width) * 0.25;

  return target.animate(
    [
      { clipPath: 'inset(0px round 0px)', opacity: 1 },
      { clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round 12px)`, opacity: 0 },
    ],
    {
      duration: Math.min(150, Math.max(100, distance * 0.15)),
      easing: 'ease-in',
      fill: 'forwards',
    },
  );
}

/**
 * - `tab`      — peers (tabs, feed/kanban): a plain cross-fade.
 * - `tab-next` — lateral advance: the new tab slides in from the right.
 * - `tab-prev` — lateral return: the previous tab slides in from the left.
 * - `push`     — deeper (a folder, its info): the new screen comes from the right.
 * - `pop`      — back: the old screen leaves to the right, the new waits behind it.
 */
export type ScreenSwap = 'tab' | 'tab-next' | 'tab-prev' | 'push' | 'pop';

/**
 * The update of the transition in flight, until it has painted once. A browser
 * may hold the callback until after the next tap, so a newer request drains
 * this one first: a tab tap during a vault switch then keeps both the switch
 * and the tab, in the order they were asked for.
 */
let pendingUpdate: (() => void) | null = null;

function drainPendingUpdate(): void {
  const pending = pendingUpdate;
  if (!pending) return;
  // Cleared before the call: the update itself may start the next swap.
  pendingUpdate = null;
  pending();
}

/**
 * Swaps one full screen for another behind the browser's own snapshot layer.
 * The outgoing screen is never kept mounted: no duplicate nodes for tests or
 * screen readers, and a second tap cannot cut the exit short — it just starts
 * the next swap. React has to flush inside the callback, otherwise the new
 * snapshot is still the old DOM.
 */
export function swapScreen(kind: ScreenSwap, update: () => void, animate = true): void {
  const root = document.documentElement;
  if (
    !animate || prefersReducedMotion() ||
    typeof document.startViewTransition !== 'function' ||
    root.dataset.motionSwap
  ) {
    drainPendingUpdate();
    update();
    return;
  }

  let applied = false;
  const apply = () => {
    // The callback already ran (normally, drained, or before a browser refusal).
    if (applied) return;
    applied = true;
    if (pendingUpdate === apply) pendingUpdate = null;
    flushSync(update);
  };

  const release = () => {
    if (pendingUpdate === apply) pendingUpdate = null;
    delete root.dataset.motionSwap;
  };

  pendingUpdate = apply;
  root.dataset.motionSwap = kind;

  let transition: ReturnType<typeof document.startViewTransition>;
  try {
    transition = document.startViewTransition(apply);
  } catch (error) {
    release();
    // The browser refused before running the callback: apply this request once
    // by hand. If the callback did run and threw, the update is not retried —
    // that would paint twice and hide the real failure.
    if (applied) throw error;
    apply();
    return;
  }

  // `ready` reports the visual plane: a skipped swap (hidden tab, another
  // start) and an aborted one (duplicate transition names) are expected, and a
  // failed update also settles it. All of it is secondary here: the update
  // error keeps its one channel in `updateCallbackDone`, so rethrowing `ready`
  // would report the same failure twice.
  void transition.ready.catch(() => undefined);
  // The attribute picks the keyframes, so it must outlive the animation itself.
  // `finished` settles even when the swap is skipped or the tab is hidden, and
  // a callback error reaches the caller through `updateCallbackDone`.
  transition.finished.then(release, release);
}
