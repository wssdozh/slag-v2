// Font families and size scales the interface offers, as CSS stacks and multipliers.
import type { UiFontFamily, UiFontScale } from '../types';

export interface FontFamilyOption {
  id: UiFontFamily;
  label: string;
  description: string;
  cssSans: string;
  cssMono: string;
}

export const FONT_FAMILY_OPTIONS: Record<UiFontFamily, FontFamilyOption> = {
  inter: {
    id: 'inter',
    label: 'Inter (Linear)',
    description: 'Фирменный плотный гротеск для комфортного чтения',
    cssSans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    cssMono: "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace",
  },
  system: {
    id: 'system',
    label: 'Системный (OS Native)',
    description: 'Нативный шрифт операционной системы (SF Pro на macOS, Segoe UI на Windows)',
    cssSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    cssMono: "'Consolas', 'Menlo', 'Monaco', monospace",
  },
  mono: {
    id: 'mono',
    label: 'JetBrains Mono (Code)',
    description: 'Технический моноширинный акцент для всего текста и кода',
    cssSans: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
    cssMono: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
  },
};

export interface FontScaleOption {
  id: UiFontScale;
  label: string;
  percentage: string;
  multiplier: number;
  description: string;
}

export const FONT_SCALE_OPTIONS: Record<UiFontScale, FontScaleOption> = {
  small: {
    id: 'small',
    label: 'Компактный',
    percentage: '92%',
    multiplier: 0.92,
    description: 'Максимальная плотность информации на экранах ноутбуков',
  },
  normal: {
    id: 'normal',
    label: 'Обычный',
    percentage: '100%',
    multiplier: 1.0,
    description: 'Сбалансированная база 14px с четким выделением приоритетов P1–P4',
  },
  comfortable: {
    id: 'comfortable',
    label: 'Комфортный',
    percentage: '110%',
    multiplier: 1.1,
    description: 'Увеличенный размер для комфортного длительного чтения',
  },
  large: {
    id: 'large',
    label: 'Крупный',
    percentage: '120%',
    multiplier: 1.2,
    description: 'Максимальный режим доступности для 2K/4K экранов без масштабирования ОС',
  },
};

export function getFontScaleMultiplier(scale: UiFontScale): number {
  return FONT_SCALE_OPTIONS[scale]?.multiplier ?? 1.0;
}

export function getFontFamilyConfig(family: UiFontFamily = 'inter'): FontFamilyOption {
  return FONT_FAMILY_OPTIONS[family] ?? FONT_FAMILY_OPTIONS.inter;
}
