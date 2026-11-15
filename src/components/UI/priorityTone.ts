// Maps a priority to its one colour family; text, dot and chip classes hang off it.
import type { SlagItemPriority } from '../../types';

/**
 * Цветовая семья приоритета: high — rose, medium — amber, low — blue, none — zinc.
 * Единственное место, где приоритет превращается в цвет; разметка уже берёт классы
 * из карт ниже.
 */
export type PriorityTone = 'rose' | 'amber' | 'blue' | 'zinc';

export function priorityTone(priority?: SlagItemPriority): PriorityTone {
  switch (priority) {
    case 'high':
      return 'rose';
    case 'medium':
      return 'amber';
    case 'low':
      return 'blue';
    default:
      return 'zinc';
  }
}

/** Тон текста; у «обычного» приоритета подпись приглушена, но светлеет под курсором. */
export const PRIORITY_TONE_TEXT: Record<PriorityTone, string> = {
  rose: 'text-rose-400',
  amber: 'text-amber-400',
  blue: 'text-blue-400',
  zinc: 'text-fg-muted hover:text-fg-tertiary',
};

/** Тон точки-маркера в списках и календарных блоках. */
export const PRIORITY_TONE_DOT: Record<PriorityTone, string> = {
  rose: 'bg-rose-500',
  amber: 'bg-amber-400',
  blue: 'bg-blue-400',
  zinc: 'bg-fg-muted',
};

/** Тон компактной плашки-чипа: подложка 15% и светлый текст. */
export const PRIORITY_TONE_CHIP: Record<PriorityTone, string> = {
  rose: 'bg-rose-500/15 text-rose-300',
  amber: 'bg-amber-500/15 text-amber-300',
  blue: 'bg-blue-500/15 text-blue-300',
  zinc: 'bg-fg-muted/15 text-fg-tertiary',
};
