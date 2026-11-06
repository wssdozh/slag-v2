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
