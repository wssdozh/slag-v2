/**
 * Single Source of Truth (SSOT) metadata registry for SlagItem mutable fields.
 * Any field added here automatically becomes available in:
 * 1. AI Tool Calling JSON Schemas (update_item and batch_update_items)
 * 2. AppContext dynamic update pipeline (applyItemUpdates)
 */

export interface PropertySchemaItem {
  type: string;
  enum?: readonly string[];
  items?: { type: string };
  description: string;
}

export const ITEM_MUTABLE_PROPERTIES: Record<string, PropertySchemaItem> = {
  title: { type: 'string', description: 'Новый заголовок записи' },
  content: { type: 'string', description: 'Новый полный текст содержимого записи' },
  appendContent: { type: 'string', description: 'Текст, который нужно дописать в конец записи' },
  folder: { type: 'string', description: 'Новая папка (перемещение)' },
  type: { type: 'string', enum: ['note', 'task', 'article'], description: 'Тип записи' },
  status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'done'], description: 'Статус задачи' },
  priority: { type: 'string', enum: ['none', 'low', 'medium', 'high'], description: 'Приоритет задачи' },
  dueDate: { type: 'string', description: 'Срок выполнения в формате YYYY-MM-DD (или пустая строка/null для сброса)' },
  dueDateText: { type: 'string', description: 'Естественное описание даты (например, "завтра в 10:00 p1")' },
  reminder: { type: 'string', description: 'Время напоминания или слота дня (например, "10:00", "14:30" или ISO)' },
  duration: { type: 'number', description: 'Длительность задачи в минутах (например, 15, 30, 45, 60, 90)' },
  kanbanColumn: { type: 'string', description: 'Колонка канбан-доски' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Полный список тегов (заменяет старый)' },
  addTags: { type: 'array', items: { type: 'string' }, description: 'Теги для добавления к существующим' },
  removeTags: { type: 'array', items: { type: 'string' }, description: 'Теги для удаления' },
  subtasks: {
    type: 'array',
    items: { type: 'string' },
    description: 'Список подзадач для добавления/декомпозиции',
  },
  isPinned: { type: 'boolean', description: 'Закрепить или открепить запись' },
  isArchived: { type: 'boolean', description: 'Архивировать или разархивировать запись' },
  customProps: { type: 'object', description: 'Пользовательские frontmatter-свойства (key-value)' },
};

export const ITEM_UPDATES_SCHEMA = {
  type: 'object',
  description: 'Объект с параметрами, которые нужно изменить (передавай только изменяемые поля)',
  properties: ITEM_MUTABLE_PROPERTIES,
};
