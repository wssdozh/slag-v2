import type { AssistantToolDefinition } from './types';
import { APP_GUIDE_TOPICS } from './appGuide';
import { ITEM_UPDATES_SCHEMA } from '../vault/itemSchema';

export function getCanonicalTools(webSearchEnabled: boolean): AssistantToolDefinition[] {
  const canonicalTools: AssistantToolDefinition[] = [
  {
    name: 'search_notes',
    description: 'Полнотекстовый нечеткий поиск по заметкам, таскам, статьям с фильтрацией по времени, типу и папке. Возвращает список совпадений с датой создания, типом, статусом и краткой сутью.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Поисковый запрос (1-3 ключевых слова). Для запросов "все записи за сегодня" или "последние заметки" query можно оставить пустым или передать тему.',
        },
        timeframe: {
          type: 'string',
          enum: ['all', 'today', 'yesterday', 'week', 'month'],
          description: 'Временной фильтр. Для запросов "последние за сегодня", "что создал сегодня" передавай "today", для "вчера" — "yesterday", для "за неделю" — "week".',
        },
        type: {
          type: 'string',
          enum: ['all', 'note', 'task', 'article'],
          description: 'Тип записей: note (заметки), task (задачи), article (статьи), all (любые).',
        },
        folder: {
          type: 'string',
          description: 'Папка для ограничения поиска (например "Проекты/Идеи").',
        },
        sortBy: {
          type: 'string',
          enum: ['relevance', 'recent', 'oldest'],
          description: 'Сортировка: "recent" для самых свежих/последних сначала, "relevance" по смысловой релевантности.',
        },
        limit: {
          type: 'number',
          description: 'Максимум записей в ответе (по умолчанию 5, от 1 до 15).',
        },
      },
    },
  },
  {
    name: 'read_note',
    description: 'Прочитать полное содержимое заметки по ее ID или названию (например, после успешного search_notes).',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Идентификатор заметки или точный заголовок' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_vault_stats',
    description: 'Получить сводную статистику по количеству заметок, тасок, статей и частоте тегов.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['all', 'tags', 'folders'], description: 'Что анализировать' },
      },
    },
  },
  {
    name: 'get_calendar_agenda',
    description: 'Получить календарную повестку, список задач на день/дату, просроченные и незапланированные задачи.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Дата в формате YYYY-MM-DD (по умолчанию сегодня)' },
      },
    },
  },
  {
    name: 'save_item',
    description: 'Создать новую или обновить существующую заметку, задачу или статью (паттерн save_*). Если передан id (или точный заголовок существующей записи) — запись обновляется. Если id не передан — создается новая.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID или точный заголовок существующей записи для обновления. Опусти при создании новой записи.' },
        title: { type: 'string', description: 'Заголовок записи' },
        content: { type: 'string', description: 'Содержимое/текст записи в формате Markdown' },
        appendContent: { type: 'string', description: 'Текст для добавления в конец записи (при обновлении)' },
        itemType: { type: 'string', enum: ['note', 'task', 'article'], description: 'Тип записи: note (заметка), task (задача), article (статья)' },
        folder: { type: 'string', description: 'Папка для сохранения или перемещения' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Список тегов без знака #' },
        dueDate: { type: 'string', description: 'Срок выполнения задачи в формате YYYY-MM-DD (или пустая строка для сброса)' },
        dueDateText: { type: 'string', description: 'Естественное описание даты (например, "завтра в 10:00")' },
        reminder: { type: 'string', description: 'Время напоминания или слот дня (например, "10:00", "14:30" или ISO)' },
        priority: { type: 'string', enum: ['none', 'low', 'medium', 'high'], description: 'Приоритет задачи' },
        status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'done'], description: 'Статус задачи' },
        subtasks: { type: 'array', items: { type: 'string' }, description: 'Список подзадач' },
        actionLabel: { type: 'string', description: 'Краткое название действия в 2-4 слова' },
      },
      required: ['title'],
    },
  },
  {
    name: 'batch_update_items',
    description: 'Пакетное изменение нескольких существующих заметок/задач с индивидуальными параметрами для каждой (перенос дат, смена приоритетов, статусов, распределение нагрузки по времени/дням).',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Краткое общее название пакетного действия (например: "Перенос задач на завтра", "Смена приоритетов")' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              targetItemId: { type: 'string', description: 'Идентификатор записи' },
              title: { type: 'string', description: 'Заголовок записи' },
              updates: ITEM_UPDATES_SCHEMA,
              reason: { type: 'string', description: 'Обоснование изменений' },
            },
            required: ['updates'],
          },
          description: 'Список обновлений для каждой записи',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'filter_feed',
    description: 'Активировать ИИ-фильтр в стрим-ленте заметок, оставив на экране только выбранные записи.',
    parameters: {
      type: 'object',
      properties: {
        itemTitles: { type: 'array', items: { type: 'string' }, description: 'Названия заметок для фильтра' },
        itemIds: { type: 'array', items: { type: 'string' }, description: 'ID заметок для фильтра' },
        queryLabel: { type: 'string', description: 'Текстовая метка фильтра (например "Просроченные задачи" или "Чай")' },
      },
    },
  },
  {
    name: 'get_app_guide',
    description: 'Справочник по интерфейсу, кнопкам, навигации, горячим клавишам и логике работы SLAG v2. Вызывай, когда пользователь спрашивает, как пользоваться приложением, куда нажать, как работает режим (канбан, календарь, триаж, синхронизация) или какие есть хоткеи.',
    parameters: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          items: {
            type: 'string',
            enum: APP_GUIDE_TOPICS as unknown as string[],
          },
          description: 'Список топиков справки: overview, navigation, views, composer, feed_and_cards, context_menu, editor, kanban, calendar, search_triage, sync_storage, mobile, shortcuts.',
        },
      },
      required: ['topics'],
    },
  },
];

if (webSearchEnabled) {
  canonicalTools.push({
    name: 'web_search',
    description: 'Выполнить поиск актуальной информации в глобальной сети Интернет.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Поисковый запрос в веб' },
      },
      required: ['query'],
    },
  });
}

  return canonicalTools;
}
