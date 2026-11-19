// Подписи и цвета важности находок. Цвета — из токенов темы, никаких выдуманных hex.
import type { Severity } from '../../../../lib/vault/integrity/types';

export function severityLabel(severity: Severity): { text: string; badge: string } {
  switch (severity) {
    case 'high':
      return {
        text: 'Критично',
        badge: 'bg-danger-subtle text-danger',
      };
    case 'medium':
      return {
        text: 'Внимание',
        badge: 'bg-warning-subtle text-warning',
      };
    case 'low':
      return {
        text: 'Замечание',
        badge: 'text-fg-muted bg-tint-3',
      };
  }
}
