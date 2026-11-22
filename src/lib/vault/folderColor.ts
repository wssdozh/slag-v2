import type { FolderColor } from '../../types';

const legacyHues = { blue: 250, green: 155, amber: 78, rose: 12 } as const;

export function isFolderColor(value: unknown): value is FolderColor {
  if (typeof value !== 'string') return false;
  return Object.hasOwn(legacyHues, value) || /^hue:(?:0|[1-9]\d{0,2})$/.test(value) && Number(value.slice(4)) <= 360;
}

export function folderHue(color?: FolderColor): number | undefined {
  if (color === undefined) return undefined;
  return color in legacyHues ? legacyHues[color as keyof typeof legacyHues] : Number(color.slice(4));
}

export function folderColorCss(color?: FolderColor): string | undefined {
  const hue = folderHue(color);
  return hue === undefined ? undefined : `oklch(72% 0.075 ${hue})`;
}
