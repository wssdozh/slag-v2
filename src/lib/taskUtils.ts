import type { SlagSubtask } from '../types';

/**
 * Extracts subtasks from markdown checkboxes: `- [ ] title` or `- [x] title`.
 * Supports CommonMark list markers (-, *, +) and arbitrary indentation.
 */
export function parseSubtasksFromContent(content: string): SlagSubtask[] {
  if (!content) return [];
  const lines = content.split('\n');
  const subtasks: SlagSubtask[] = [];
  let index = 0;

  for (const line of lines) {
    const match = line.match(/^\s*[-*+]\s*\[([ xX])\]\s*(.*)$/);
    if (match) {
      subtasks.push({
        id: `st_${index++}`,
        title: match[2].trim(),
        completed: match[1].toLowerCase() === 'x',
      });
    }
  }

  return subtasks;
}

/**
 * Toggles a single checkbox in markdown content by subtask ID or index.
 */
export function toggleCheckboxInContent(
  content: string,
  targetIdentifier: string | number,
  legacySubtasks?: SlagSubtask[]
): string {
  if (!content) return content;

  let targetIndex = -1;
  if (typeof targetIdentifier === 'number') {
    targetIndex = targetIdentifier;
  } else if (/^st_(\d+)$/.test(targetIdentifier)) {
    targetIndex = parseInt(targetIdentifier.replace('st_', ''), 10);
  } else if (legacySubtasks && legacySubtasks.length > 0) {
    targetIndex = legacySubtasks.findIndex(s => s.id === targetIdentifier);
  }

  const lines = content.split('\n');
  let currentIdx = 0;

  const updatedLines = lines.map(line => {
    const match = line.match(/^(\s*[-*+]\s*\[)([ xX])(\]\s*.*)$/);
    if (match) {
      if (currentIdx === targetIndex) {
        const isCompleted = match[2].toLowerCase() === 'x';
        currentIdx++;
        return `${match[1]}${isCompleted ? ' ' : 'x'}${match[3]}`;
      }
      currentIdx++;
    }
    return line;
  });

  return updatedLines.join('\n');
}

/**
 * Sets all checkboxes in markdown content to completed (x) or uncompleted ( ).
 */
export function setAllCheckboxesInContent(content: string, completed: boolean): string {
  if (!content) return content;
  const marker = completed ? 'x' : ' ';
  return content.replace(/^(\s*[-*+]\s*\[)[ xX](\]\s*.*)$/gm, `$1${marker}$2`);
}

/**
 * Appends legacy frontmatter subtasks to markdown body if not already present.
 */
export function migrateLegacySubtasksToContent(
  content: string,
  legacySubtasks?: SlagSubtask[]
): string {
  if (!legacySubtasks || legacySubtasks.length === 0) return content;
  if (/^\s*[-*+]\s*\[[ xX]\]/m.test(content)) return content;

  const checklistLines = legacySubtasks.map(
    st => `- [${st.completed ? 'x' : ' '}] ${st.title}`
  );
  const trimmed = content.trim();
  if (!trimmed) {
    return checklistLines.join('\n');
  }
  return `${trimmed}\n\n${checklistLines.join('\n')}`;
}

/** Подписи приоритетов для интерфейса. Один словарь вместо копий по компонентам. */
export const PRIORITY_LABELS: Record<string, string> = {
  none: 'Без приоритета',
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};
