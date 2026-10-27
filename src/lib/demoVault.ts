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
      priority: 'high',
      dueDate: new Date(now + 86400000).toISOString().slice(0, 10),
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
      id: 'demo_article_1',
      type: 'article',
      title: 'Манифест ультра-минимализма: почему интерфейс не должен орать',
      content:
        '# Манифест ультра-минимализма\n\n' +
        'Большинство современных приложений для заметок перегружены визуальным шумом: яркие градиенты, громоздкие тулбары, постоянные всплывающие подсказки и рамки фокуса на каждом инпуте.\n\n' +
        '### Три ключевых принципа SLAG\n\n' +
        '1. **Монохромная тишина**: черный цвет и едва заметные разделители (1px `rgba(255,255,255,0.06)`). Никаких цветных радужных градиентов. Глаза отдыхают даже при 10 часах работы.\n' +
        '2. **Формат Obsidian (.md)**: все данные хранятся в открытом виде как Markdown-файлы с YAML frontmatter. Если приложение исчезнет, ваши заметки останутся в вашей файловой системе.\n' +
        '3. **Монолог в Telegram**: ввод заметки должен ощущаться как отправка сообщения самому себе в избранное. Минимум кликов — нажал Enter, и мысль зафиксирована.',
      folder: 'База знаний',
      tags: ['дизайн', 'минимализм', 'манифест'],
      createdAt: now - 86400000 * 2,
      updatedAt: now - 86400000 * 1,
      readingTimeMinutes: 2,
      summary: 'Философия интерфейса в стиле Linear и Vercel: отсутствие визуального мусора и честное хранение в Markdown.',
      attachments: [],
    },
    {
      id: 'demo_reply_1',
      type: 'note',
      title: 'Дизайн-система и архитектура UI',
      content:
        'Сверил требования со статьёй [[Манифест ультра-минимализма: почему интерфейс не должен орать]].\n\n' +
        'Теги и структура должны подбираться тихо, без визуального шума.',
      folder: 'База знаний',
      tags: ['дизайн', 'архитектура'],
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
      attachments: [],
    },
    {
      id: 'demo_task_3',
      type: 'task',
      title: 'Синхронизация по архитектуре баз данных',
      content:
        'Обсудить SQLite vs Markdown хранилище в 14:00-15:30.\n\n' +
        '- [x] Подготовить схему таблиц\n' +
        '- [ ] Сравнить скорость поиска Orama',
      folder: 'Проекты',
      tags: ['architecture', 'meeting'],
      createdAt: now - 800000,
      updatedAt: now - 800000,
      status: 'todo',
      priority: 'medium',
      dueDate: new Date().toISOString().slice(0, 10),
      reminder: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
      subtasks: [
        { id: uid('st_db1'), title: 'Подготовить схему таблиц', completed: true },
        { id: uid('st_db2'), title: 'Сравнить скорость поиска Orama', completed: false },
      ],
      attachments: [],
    },
    {
      id: 'demo_article_2',
      type: 'article',
      title: '12 правил эффективности',
      content:
        '# 12 правил эффективности\n\n' +
        'Кратко: Личная заметка с правилами эффективности. #продуктивность #эффективность #делегирование #планирование #таймменеджмент #фокус #саморазвитие #приоритеты #работа #заработок #review\n\n' +
        '1. Фокус на главном и отсечение лишнего.\n' +
        '2. Делегирование рутинных задач.\n' +
        '3. Четкое планирование повестки на день и недельный спринт.',
      folder: 'База знаний',
      tags: ['продуктивность', 'эффективность', 'планирование', 'саморазвитие'],
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
      readingTimeMinutes: 1,
      summary: 'Личная заметка с правилами эффективности: фокус, делегирование, планирование.',
      attachments: [],
    },
    {
      id: uid('demo_personal'),
      type: 'task',
      title: 'Купить хороший зеленый чай',
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
    {
      id: uid('demo_flowers'),
      type: 'task',
      title: 'Полить цветы в кабинете',
      content: 'Еженедельный уход за растениями.',
      folder: 'Входящие',
      tags: ['быт'],
      createdAt: now - 700000,
      updatedAt: now - 700000,
      status: 'todo',
      priority: 'none',
      dueDate: new Date(now + 86400000).toISOString().slice(0, 10),
      attachments: [],
    },
  ];
}
