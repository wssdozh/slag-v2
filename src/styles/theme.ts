/**
 * SLAG v2 - Master Theme Colors (TypeScript Constants)
 * Mirrors src/styles/theme.css for Canvas 2D contexts, SVG rendering, and scripts.
 */

export const THEME_COLORS = {
  // Canvas / Base
  canvas: '#09090b',
  canvasSubtle: '#050507',

  // Panels & Sidebars
  panel: '#0c0c0e',
  panelHeader: '#0c0c0e',

  // Surfaces & Cards
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
} as const;

export type ThemeColorKey = keyof typeof THEME_COLORS;
