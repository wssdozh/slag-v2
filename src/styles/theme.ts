/**
 * SLAG v2 - Master Theme Colors (TypeScript Constants)
 * Mirrors src/styles/theme.css for Canvas 2D contexts, SVG rendering, and scripts.
 */

export const THEME_COLORS = {
  // Canvas / Base
  canvas: '#121316',
  canvasSubtle: '#0e0f12',

  // Panels & Sidebars
  panel: '#16171c',
  panelHeader: '#181920',

  // Surfaces & Cards
  surface: '#1c1d23',
  surfaceHover: '#22232b',
  surfaceElevated: '#252630',
  surfaceActive: '#2b2c37',

  // Typography
  fgPrimary: '#f4f4f5',
  fgSecondary: '#a1a1aa',
  fgMuted: '#71717a',
  fgDim: '#52525b',

  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.07)',
  borderHover: 'rgba(255, 255, 255, 0.14)',
  borderStrong: 'rgba(255, 255, 255, 0.22)',
} as const;

export type ThemeColorKey = keyof typeof THEME_COLORS;
