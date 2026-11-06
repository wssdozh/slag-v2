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
