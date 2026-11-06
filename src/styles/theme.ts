/**
 * SLAG v2 - Master Theme Colors (TypeScript Constants)
 * Mirrors src/styles/theme.css for Canvas 2D contexts, SVG rendering, and scripts.
 */

export const THEME_COLORS = {
  // Canvas / Base (Seamless #0c0c0e)
  canvas: '#0c0c0e',
  canvasSubtle: '#08080a',

  // Panels & Sidebars
  panel: '#0c0c0e',
  panelHeader: '#0c0c0e',

  // Surfaces & Cards (Classic Relaxed #141417)
  surface: '#141417',
  surfaceHover: '#161619',
  surfaceElevated: '#18181c',
  surfaceActive: 'rgba(255, 255, 255, 0.07)',

  // Typography
  fgPrimary: '#f4f4f5',
  fgSecondary: '#a1a1aa',
  fgMuted: '#71717a',
  fgDim: '#52525b',

  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderHover: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.2)',

  // Functional & Semantic
  accent: '#3b82f6',
  accentSubtle: 'rgba(59, 130, 246, 0.15)',
  success: '#10b981',
  successSubtle: 'rgba(16, 185, 129, 0.15)',
  warning: '#f59e0b',
  warningSubtle: 'rgba(245, 158, 11, 0.12)',
  danger: '#f43f5e',
  dangerSubtle: 'rgba(244, 63, 94, 0.12)',
} as const;

export type ThemeColorKey = keyof typeof THEME_COLORS;
