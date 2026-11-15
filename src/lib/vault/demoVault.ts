import type { SlagItem } from '../../types';
import { DEFAULT_INBOX_FOLDER } from '../../config';

/**
 * Generates a clean, cohesive set of starter demo items across the default folders.
 * Uses fresh timestamps and unique IDs so each workspace has independent notes.
 */
export function generateDemoItems(): SlagItem[] {
  const now = Date.now();
  const uid = (prefix: string) => `${prefix}_${now}_${Math.random().toString(36).slice(2, 6)}`;

  return [
    // Входящие
    {
      id: uid('demo_inbox'),
      type: 'note',
      title: 'Добро пожаловать в SLAG',
      content:
        '# Добро пожаловать в SLAG\n\n' +
        'Локальный минималистичный менеджер заметок и задач.\n\n' +
        'Каждая мысль сохраняется в открытый Markdown без привязки к облаку.\n\n' +
        '- [x] Открыть приложение SLAG\n' +
        '- [ ] Написать первую мысль в поле ввода внизу и отправить по Enter\n' +
        '- [ ] Указать умную дату: например «позвонить завтра в 15:00 p1»\n' +
        '- [ ] Нажать ⌘K / Ctrl+K для глобального нечёткого поиска\n' +
        '- [ ] Нажать ПКМ по любой заметке для вызова контекстных действий',
      folder: DEFAULT_INBOX_FOLDER,
      tags: ['старт', 'инструкция'],
      createdAt: now - 3600000 * 2,
      updatedAt: now - 3600000 * 2,
      attachments: [],
    },

    // Карьера
    {
      id: uid('demo_career_job'),
      type: 'task',
      title: 'Обновить резюме и портфолио проектов',
      content:
        'Собрать ключевые кейсы и подготовить обновленное резюме.\n\n' +
        '- [x] Выписать стек технологий и последние достижения\n' +
        '- [ ] Оформить PDF и страницу на GitHub\n' +
        '- [ ] Собрать список целевых компаний',
      folder: 'Карьера',
      tags: ['карьера', 'резюме', 'работа'],
      createdAt: now - 3600000 * 3,
      updatedAt: now - 3600000 * 3,
      status: 'in_progress',
      priority: 'high',
      dueDate: new Date(now + 86400000 * 3).toISOString().slice(0, 10),
      subtasks: [
        { id: uid('st_job1'), title: 'Выписать стек технологий и последние достижения', completed: true },
        { id: uid('st_job2'), title: 'Оформить PDF и страницу на GitHub', completed: false },
        { id: uid('st_job3'), title: 'Собрать список целевых компаний', completed: false },
      ],
      attachments: [],
    },

    // Личное
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
      folder: 'Личное',
      tags: ['быт'],
      createdAt: now - 700000,
      updatedAt: now - 700000,
      status: 'todo',
      priority: 'none',
      dueDate: new Date(now + 86400000).toISOString().slice(0, 10),
      attachments: [],
    },
    {
      id: uid('demo_health'),
      type: 'task',
      title: 'Записаться на ежегодный чекап и анализы',
      content: 'Проверить витамин D, общий анализ крови и записаться к терапевту.',
      folder: 'Личное',
      tags: ['здоровье', 'чекап'],
      createdAt: now - 1200000,
      updatedAt: now - 1200000,
      status: 'todo',
      priority: 'medium',
      dueDate: new Date(now + 86400000 * 2).toISOString().slice(0, 10),
      attachments: [],
    },

    // Проекты
    {
      id: uid('demo_project'),
      type: 'task',
      title: 'План работы над проектом',
      content:
        'Ключевые этапы и контрольные точки разработки проекта.\n\n' +
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
      id: 'demo_task_3',
      type: 'task',
      title: 'Синхронизация по архитектуре баз данных',
      content:
        'Обсудить сортировку блоков и SQLite vs Markdown хранилище в 14:00-15:30.\n\n' +
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
      id: uid('demo_media'),
      type: 'note',
      title: 'Идеи для контента и публикаций',
      content:
        '# Идеи для контента и медиа\n\n' +
        '• Разбор архитектуры Local-First приложений\n' +
        '• Пост-сравнение SQLite vs чистого Markdown\n' +
        '• Видеодемонстрация MCP-сервера в Claude и Cursor',
      folder: 'Проекты',
      tags: ['контент', 'заметки'],
      createdAt: now - 2400000,
      updatedAt: now - 2400000,
      attachments: [],
    },
    {
      id: 'demo_reply_1',
      type: 'note',
      title: 'Дизайн-система и архитектура UI',
      content:
        'Сверил требования со статьёй [[Вернулся к обычному .txt после двадцати лет заметочников]].\n\n' +
        'Теги и структура должны подбираться тихо, без визуального шума.',
      folder: 'Проекты',
      tags: ['дизайн', 'архитектура'],
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
      attachments: [],
    },

    // База знаний
    {
      id: uid('demo_kb'),
      type: 'note',
      title: 'Горячие клавиши и разметка',
      content:
        '# Горячие клавиши и разметка\n\n' +
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
      title: 'Вернулся к обычному .txt после двадцати лет заметочников',
      content:
        '# Один файл вместо десяти приложений\n\n' +
        'Вычитал на Хабре: инженер с 2005 года перепробовал полтора десятка\n' +
        'заметочников и вернулся к plain text. Не потому что модно, а потому что\n' +
        'остальное мешало.\n\n' +
        '> Все они были по-своему хороши. Все они имели одну общую проблему: они\n' +
        '> навязывали мне свой способ и структуру ведения задач. А обычный plain\n' +
        '> text файл даёт нужный градус свободы.\n\n' +
        '> Я не хочу жить в мире, где ПО формирует закрытые экосистемы. Я хочу жить\n' +
        '> в мире протоколов и открытых реализаций.\n\n' +
        'Зацепила мысль про внимание: «идеальный интерфейс — это тот, которого не\n' +
        'видишь и о котором не думаешь». Ровно то, чего я хочу от заметочника:\n' +
        'файл, папка, Enter.\n\n' +
        'Что забрать себе:\n\n' +
        '- [x] Дочитать до конца\n' +
        '- [ ] Посмотреть сообщество OBTF и файл Джеффа Хуана на 51 000 строк\n' +
        '- [ ] Попробовать неделю вести всё в одном файле\n' +
        '- [ ] Не превращать это в культ: у них один файл, у меня папки\n\n' +
        'Источник — habr.com/ru/articles/1002520, автор blozheupasi.',
      folder: 'База знаний',
      tags: ['заметки', 'чтение'],
      createdAt: now - 86400000 * 2,
      updatedAt: now - 86400000 * 1,
      readingTimeMinutes: 3,
      summary: 'Заметка-выжимка: почему инженер ушёл от заметочников к одному .txt и что из этого стоит забрать.',
      attachments: [],
    },
    {
      id: 'demo_article_2',
      type: 'article',
      title: '12 правил эффективности',
      content:
        '# 12 правил эффективности\n\n' +
        'Кратко: Личная заметка с правилами эффективности. #продуктивность #эффективность #планирование #фокус\n\n' +
        '1. Фокус на главном и отсечение лишнего.\n' +
        '2. Делегирование рутинных задач.\n' +
        '3. Четкое планирование повестки на день и недельный спринт.',
      folder: 'База знаний',
      tags: ['продуктивность', 'эффективность', 'планирование'],
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
      readingTimeMinutes: 1,
      summary: 'Личная заметка с правилами эффективности: фокус, делегирование, планирование.',
      attachments: [],
    },
  ];
}
