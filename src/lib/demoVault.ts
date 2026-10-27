import type { SlagItem } from '../types';

/**
 * Generates a clean, cohesive set of starter demo items across the default folders.
 * Uses fresh timestamps and unique IDs so each workspace has independent notes.
 */
export function generateDemoItems(): SlagItem[] {
  const now = Date.now();
  const uid = (prefix: string) => `${prefix}_${now}_${Math.random().toString(36).slice(2, 6)}`;

  return [
    {
      id: uid('demo_inbox'),
      type: 'note',
      title: 'Добро пожаловать в SLAG',
      content:
        'Локальный минималистичный менеджер заметок и задач.\n\n' +
        'Каждая мысль сохраняется в открытый Markdown без привязки к облаку.\n\n' +
        '- [x] Открыть приложение SLAG\n' +
        '- [ ] Написать первую мысль в поле ввода внизу и отправить по Enter\n' +
        '- [ ] Указать умную дату: например «позвонить завтра в 15:00 p1»\n' +
        '- [ ] Нажать ⌘K / Ctrl+K для глобального нечёткого поиска\n' +
        '- [ ] Нажать ПКМ по любой заметке для вызова контекстных действий',
      folder: 'Входящие',
      tags: ['старт', 'инструкция'],
      createdAt: now - 3600000 * 2,
      updatedAt: now - 3600000 * 2,
      attachments: [],
    },
    {
      id: uid('demo_project'),
      type: 'task',
      title: 'План работы над проектом',
      content:
        'Ключевые этапы и контрольные точки.\n\n' +
        '- [x] Определить цели и ограничения\n' +
        '- [ ] Собрать базовую структуру заметок\n' +
        '- [ ] Проверить сохранение файлов на диске',
      folder: 'Проекты',
      tags: ['проект', 'план'],
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
      status: 'todo',
      priority: 'medium',
      subtasks: [
        { id: uid('st_1'), title: 'Определить цели и ограничения', completed: true },
        { id: uid('st_2'), title: 'Собрать базовую структуру заметок', completed: false },
        { id: uid('st_3'), title: 'Проверить сохранение файлов на диске', completed: false },
      ],
      attachments: [],
    },
    {
      id: uid('demo_kb'),
      type: 'note',
      title: 'Горячие клавиши и разметка',
      content:
        'Краткая памятка по эффективной работе в SLAG:\n\n' +
        '• **⌘K / Ctrl+K** — мгновенный нечёткий поиск Orama по всей базе\n' +
        '• **⌘E / Ctrl+E** — переключение в полноэкранный фокус-редактор\n' +
        '• **Enter / Shift+Enter** — отправка заметки или перевод строки в поле ввода\n' +
        '• **[[Заметка]]** — быстрая вики-ссылка на связанную мысль',
      folder: 'База знаний',
      tags: ['справка', 'хоткеи'],
      createdAt: now - 1800000,
      updatedAt: now - 1800000,
      attachments: [],
    },
    {
      id: uid('demo_personal'),
      type: 'task',
      title: 'Купить хороший чай',
      content: 'Сенча или Габа для работы по вечерам.\n\n- [ ] Заглянуть в чайную лавку у дома',
      folder: 'Личное',
      tags: ['быт', 'покупки'],
      createdAt: now - 900000,
      updatedAt: now - 900000,
      status: 'todo',
      priority: 'low',
      dueDate: new Date().toISOString().slice(0, 10),
      subtasks: [
        { id: uid('st_tea'), title: 'Заглянуть в чайную лавку у дома', completed: false },
      ],
      attachments: [],
    },
  ];
}
