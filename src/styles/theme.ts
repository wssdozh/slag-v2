/**
 * SLAG v2 - Master Theme Colors (TypeScript Constants)
 * Mirrors src/styles/theme.css for Canvas 2D contexts, SVG rendering, and scripts.
 */

export const THEME_COLORS = {
  // Canvas / Base (Raycast Charcoal #131316)
  canvas: '#131316',
  canvasSubtle: '#0f0f12',

  // Panels & Sidebars
  panel: '#131316',
  panelHeader: '#131316',

  // Surfaces & Cards (#1a1a1f)
  surface: '#1a1a1f',
  surfaceHover: '#212127',
  surfaceElevated: '#24242c',
  surfaceActive: 'rgba(255, 255, 255, 0.08)',

  // Typography
  fgPrimary: '#f4f4f5',
  fgSecondary: '#a1a1aa',
  fgMuted: '#71717a',
  fgDim: '#52525b',

  // Borders
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderHover: 'rgba(255, 255, 255, 0.14)',
  borderStrong: 'rgba(255, 255, 255, 0.22)',

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
