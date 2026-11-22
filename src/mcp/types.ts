// Zod schemas and vault shapes the MCP tools accept, with their user-facing descriptions.
import { z } from 'zod';
import { DEFAULT_INBOX_FOLDER } from '../config';
import type { SlagItem, FolderMeta, RecurrenceRule } from '../types';
import { parseISODateString } from '../lib/time/dateUtils';

const RecurrenceSchema: z.ZodType<RecurrenceRule> = z.object({
  freq: z.enum(['daily', 'weekdays', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().positive().optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  resetSubtasks: z.boolean().optional(),
});

export interface McpVaultConfig {
  vaultPath: string; // Absolute path to vault (notes dir)
  notesDir: string;  // Absolute path to notes/
  trashDir: string;  // Absolute path to .trash/
  statePath: string; // Absolute path to state.json
}

export interface VaultStateData {
  folders?: FolderMeta[];
  updatedAt?: number;
  [key: string]: unknown;
}

export interface NoteMatch {
  item: SlagItem;
  relativePath: string;
  absolutePath: string;
}

// Zod Schemas for Tools

// NOTE: `type` and `folder` deliberately have no zod default. A client that updates a task and
// sends only `status` must not be silently moved to «Входящие» and demoted to a note: defaults
// belong to the create path inside McpVault.saveNote, not to the schema.
export const SaveNoteSchema = {
  id: z.string().optional().describe('ID или имя файла существующей заметки для обновления. Если не указан — создается новая.'),
  title: z.string().optional().describe('Заголовок заметки или задачи (обязателен при создании новой).'),
  content: z.string().optional().describe('Основной текст в формате Markdown.'),
  appendContent: z.string().optional().describe('Текст для добавления в конец существующей заметки.'),
  type: z.enum(['note', 'task', 'article']).optional().describe('Тип записи: note, task, article. При обновлении пропуск сохраняет тип; при создании без срока — note. Для задач укажи task.'),
  folder: z.string().optional().describe(`Папка сохранения (например "${DEFAULT_INBOX_FOLDER}" или "Проекты/Дизайн"). Пропуск сохраняет папку при обновлении; новая запись — во «${DEFAULT_INBOX_FOLDER}».`),
  tags: z.array(z.string()).optional().describe('Список тегов без знака решетки #.'),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done']).optional().describe('Статус задачи.'),
  priority: z.enum(['none', 'low', 'medium', 'high']).optional().describe('Приоритет задачи.'),
  dueDate: z.string().refine(value => Number.isFinite(parseISODateString(value).getTime()), 'Нужна существующая дата YYYY-MM-DD').nullable().optional().describe('Срок задачи YYYY-MM-DD, не время. null снимает срок; пропуск сохраняет. Относительную дату сначала уточни по дате и часовому поясу пользователя.'),
  reminder: z.iso.datetime({ offset: true }).nullable().optional().describe('Момент напоминания ISO datetime с часовым поясом (например 2026-11-17T10:00:00+03:00), не просто HH:mm. null снимает напоминание; пропуск сохраняет.'),
  duration: z.number().positive().nullable().optional().describe('Длительность задачи в минутах, не в секундах. null снимает длительность; пропуск сохраняет.'),
  recurrence: RecurrenceSchema.nullable().optional().describe('Повтор задачи: {freq, interval?, weekdays?, resetSubtasks?}; interval — положительное целое (по умолчанию 1), weekdays — 1=пн…7=вс для weekly. null снимает повтор; пропуск сохраняет. Это поле recurrence, не repeat и не текст в content.'),
  subtasks: z.array(z.string()).optional().describe('Список подзадач (текст каждого пункта).'),
};

export const GetNoteSchema = {
  idOrTitle: z.string().describe('Идентификатор (id), заголовок или имя файла заметки (с расширением .md или без).'),
};

export const ReadAttachmentSchema = {
  note: z.string().describe('Идентификатор (id), заголовок или имя файла заметки, к которой приложен файл.'),
  filename: z.string().describe('Имя вложения из списка attachments карточки заметки: имя файла, например "photo.webp", или его relativePath.'),
};

export const SearchNotesSchema = {
  query: z.string().describe('Поисковая фраза (поиск по заголовку, содержимому и тегам).'),
  folder: z.string().optional().describe('Ограничить поиск конкретной папкой.'),
  type: z.enum(['note', 'task', 'article', 'all']).default('all').describe('Фильтр по типу записи.'),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done', 'all']).default('all').describe('Фильтр по статусу задач.'),
  tag: z.string().optional().describe('Фильтр по тегу без решетки #.'),
  limit: z.number().default(10).describe('Максимум возвращаемых результатов (по умолчанию 10).'),
};

export const ListNotesSchema = {
  folder: z.string().optional().describe('Папка для листинга (по умолчанию все).'),
  type: z.enum(['note', 'task', 'article', 'all']).default('all').describe('Тип записей.'),
  tag: z.string().optional().describe('Фильтр по тегу.'),
  sortBy: z.enum(['recent', 'title', 'priority']).default('recent').describe('Сортировка: recent (свежие сначала), title (по алфавиту), priority (по важности).'),
  limit: z.number().default(20).describe('Максимальное количество записей (по умолчанию 20).'),
};

export const DeleteNoteSchema = {
  idOrTitle: z.string().describe('Идентификатор (id), заголовок или имя файла заметки для перемещения в безопасную корзину .trash/.'),
};

export const ListTasksSchema = {
  view: z.enum(['today', 'upcoming', 'overdue', 'backlog', 'completed', 'all']).default('today').describe('Срез задач: today (на сегодня), upcoming (будущие), overdue (просроченные), backlog (бэклог), completed (завершенные), all (все).'),
  folder: z.string().optional().describe('Фильтр по папке.'),
};

export const ToggleTaskSchema = {
  id: z.string().describe('Идентификатор или заголовок задачи.'),
  subtaskId: z.string().optional().describe('ID или текст подзадачи для переключения (если нужно отметить конкретный чекбокс).'),
  status: z.enum(['todo', 'done']).optional().describe('Явный целевой статус (если не указан, меняется на противоположный).'),
};

export const CreateFolderSchema = {
  path: z.string().describe('Относительный путь новой папки (например, "Проекты/Мобилка").'),
  description: z.string().optional().describe('Описание назначения папки (используется ИИ для правильной классификации).'),
  icon: z.string().optional().describe('Ключ реестра иконок (например, "folder.generic", "folder.briefcase", "folder.code").'),
};
