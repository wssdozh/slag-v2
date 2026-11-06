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
 * Opens a full-bleed surface out of the card that was tapped. The clip window
 * grows from the card's box to the viewport, so no text is ever stretched by a
 * non-uniform scale.
 */
export function expandFromRect(origin: HTMLElement, target: HTMLElement): void {
  if (prefersReducedMotion()) return;
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
      duration: Math.min(280, Math.max(200, distance * 0.35)),
      easing: motionEase('entrance'),
    },
  );
}

/**
 * - `tab`   — peers (tabs, feed/kanban): a plain cross-fade, nothing slides.
 * - `push`  — deeper (a folder, its info): the new screen comes from the right.
 * - `pop`   — back: the old screen leaves to the right, the new waits behind it.
 */
export type ScreenSwap = 'tab' | 'push' | 'pop';

/**
 * Swaps one full screen for another behind the browser's own snapshot layer.
 * The outgoing screen is never kept mounted: no duplicate nodes for tests or
 * screen readers, and a second tap cannot cut the exit short — it just starts
 * the next swap. React has to flush inside the callback, otherwise the new
 * snapshot is still the old DOM.
 */
export function swapScreen(kind: ScreenSwap, update: () => void): void {
  const root = document.documentElement;
  if (
    prefersReducedMotion() ||
    typeof document.startViewTransition !== 'function' ||
    root.dataset.motionSwap
  ) {
    update();
    return;
  }

  const release = () => {
    delete root.dataset.motionSwap;
  };
  root.dataset.motionSwap = kind;

  let transition: ReturnType<typeof document.startViewTransition>;
  try {
    transition = document.startViewTransition(() => {
      flushSync(update);
    });
  } catch {
    release();
    update();
    return;
  }

  // The attribute picks the keyframes, so it must outlive the animation itself.
  // `finished` settles even when the swap is skipped or the tab is hidden.
  transition.finished.then(release, release);
}

/** Cross-fade an update through the same snapshot layer, where it exists. */
export function crossFade(update: () => void): void {
  swapScreen('tab', update);
}
