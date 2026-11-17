---
id: data_model_obsidian_vault
title: "Модель Данных: Obsidian-совместимое Локальное Хранилище"
type: spec
updated: 2026-10-21
tags:
  - storage
  - obsidian
  - markdown
  - yaml
  - local-first
---

# 📁 Модель Данных: Obsidian-совместимое Локальное Хранилище

> Родительский документ: [[00_MOC_Map_of_Content]]  
> Связанные документы: [[01_UI_UX_Interactions_Matrix]], [[03_AI_Engine_Zero_Slop_Gemini]]

---

## 1. Физическая структура каталогов на диске

SLAG v2 придерживается парадигмы **Local-First**: данные принадлежат пользователю, хранятся локально в виде стандартных текстовых файлов `.md` и без конвертации открываются в Obsidian, Logseq или обычном блокноте.

```text
MyVault/
├── .attachments/               # Бинарные вложения (фото, аудио .webm, видео .webm)
│   ├── voice_1716034200.webm
│   ├── video_1716034300.webm
│   └── photo_1716034400.png
├── .trash/                     # Безопасная корзина удаленных заметок
│   └── Удаленная заметка.md
├── Входящие/                   # Системная папка неразобранного (Inbox)
│   ├── Быстрая мысль.md
│   └── Купить кофе.md
├── Проекты/
│   ├── SLAG v2/
│   │   └── Архитектура ядра.md
│   └── Дизайн/
│       └── Референсы Linear.md
└── Личное/
    └── Заметки о книгах.md
```

Служебные метаданные папок и воркспейса хранятся не внутри хранилища, а в каталоге данных приложения: `vaults/<id>/state.json` (ключ `folders` и объект `workspace`). В корне хранилища лежат только заметки, `.attachments/` и `.trash/`.

---

## 2. Именование файлов и защита от коллизий

1. **Имя файла**: генерируется по названию заметки `Заголовок.md`.
2. **Санитизация**: запрещенные файловой системой символы (`\ / : * ? " < > |`) автоматически удаляются или заменяются на дефис.
3. **Защита от перезаписи**: при наличии файла с аналогичным именем к названию добавляется суффикс `Заголовок 1.md`, `Заголовок 2.md`.
4. **Уникальный идентификатор**: в YAML Frontmatter каждого файла сохраняется неизменный `id: note_...`, благодаря чему переименование заметки на диске не ломает внутренние связи (`replyToId` и `[[викилинки]]`).

---

## 3. Политика безопасной корзины `.trash/`

- **Поведение при удалении**: при нажатии «Удалить» (`⌫`) в контекстном меню заметка **не стирается физически**, а перемещается в скрытую папку `.trash/` внутри хранилища (стандартное поведение Obsidian).
- **Мгновенный Undo**: в правом нижнем углу всплывает Toast-уведомление *«Запись перемещена в корзину»* с кнопкой *«Отменить»*, возвращающей файл на прежнее место за 1 клик.
- **Очистка корзины**: доступна в настройках хранилища (кнопка «Очистить .trash/»).

---

## 4. Спецификация YAML Frontmatter

Каждый Markdown-файл начинается с валидного frontmatter блока, обеспечивающего 100% совместимость с Obsidian Dataview:

```markdown
---
id: note_1716034000_abc
type: task                  # note | article | task
title: Реализовать ИИ-триаж входящих
created: 1716034000000
updated: 1716034100000
tags:
  - ai
  - gemini
  - architecture
folder: Проекты/SLAG v2
status: in_progress         # todo | in_progress | done (только для task)
kanbanColumn: review        # ID кастомной колонки канбана (мапится на status)
priority: high              # none | low | medium | high (только для task)
dueDate: 2026-10-25         # YYYY-MM-DD
reminder: 2026-10-25T10:00:00Z
recurrence: FREQ=WEEKLY;BYDAY=FR # Правило повторения iCalendar RFC 5545
subtasks:
  - id: st1
    title: Собрать словарь существующих тегов
    completed: true
  - id: st2
    title: Написать промпт для Gemini Flash
    completed: false
readingTimeMinutes: 2       # только для article
summary: Краткая выжимка статьи
replyToId: note_1716033900_xyz # ID заметки, на которую дан ответ
linkedItemIds:
  - note_1716033500_foo     # Двусторонние связи
attachments:
  - id: att_1
    name: screenshot.png
    type: image
    relativePath: .attachments/screenshot.png
---

Тело заметки в чистом формате Markdown...
```

---

## 5. Трехуровневая модель сущностей

Все три сущности наследуются от единого интерфейса `SlagItem`:

```typescript
export type SlagItemType = 'note' | 'article' | 'task';

export interface SlagItem {
  id: string;
  type: SlagItemType;
  title: string;
  content: string; // Markdown
  folder: string;  // Относительный путь
  tags: string[];
  attachments: SlagAttachment[];
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
  isArchived?: boolean;

  // Task поля (изолированы от note и article, см. [[09_Smart_Dates_and_Reminders]])
  status?: 'todo' | 'in_progress' | 'done';
  kanbanColumn?: string; // ID пользовательского столбца канбан-доски папки
  priority?: 'none' | 'low' | 'medium' | 'high';
  dueDate?: string; // YYYY-MM-DD
  reminder?: string; // ISO DateTime
  recurrence?: string; // RFC 5545 recurrence rule
  subtasks?: Array<{ id: string; title: string; completed: boolean }>;

  // Article поля
  readingTimeMinutes?: number;
  summary?: string;

  // Связи
  replyToId?: string;
  linkedItemIds?: string[];
}
```

### 5.1. Умное автоопределение типа записи (Smart Type Inference)
При наборе текста в композере система автоматически адаптирует тип:
- Если строка начинается с `- [ ] ` или `[ ] ` — тип переключается на **Таску** (`task`).
- Если пользователь вводит структурированный Markdown с заголовками H1/H2 (`# Заголовок`) или объем текста превышает 3 абзаца — композер предлагает раскрыть **Статью** (`article`) в полноэкранном редакторе.
- Во всех остальных случаях создается быстрая **Заметка** (`note`).

---

## 6. Метаданные папок (`state.json`, ключ `folders`)

Папки на диске являются обычными директориями, а расширенные метаданные (иконка, описание для ИИ и персональные настройки Канбана) хранятся не во frontmatter заметок, а в служебном `state.json` каталога данных приложения (`vaults/<id>/state.json`), в массиве под ключом `folders`:

```json
{
  "folders": [
    {
      "path": "Входящие",
      "name": "Входящие",
      "description": "Все новые неотсортированные мысли, идеи и задачи.",
      "icon": "entity.inbox",
      "isSystem": true
    },
    {
      "path": "Проекты/SLAG v2",
      "name": "SLAG v2",
      "description": "Разработка приложения заметок в стиле Linear на React и Tauri v2.",
      "icon": "folder.code",
      "showReferenceColumn": true,
      "kanbanColumns": [
        { "id": "backlog", "title": "Бэклог", "statusMapping": "todo" },
        { "id": "dev", "title": "В разработке", "statusMapping": "in_progress" },
        { "id": "review", "title": "Код-ревью", "statusMapping": "in_progress" },
        { "id": "released", "title": "Релиз", "statusMapping": "done" }
      ]
    }
  ],
  "workspace": {},
  "updatedAt": 1716034200000
}
```

Текстовое поле `description` считывает Gemini Flash при проведении автоматического триажа, а массив `kanbanColumns` позволяет каждой папке иметь собственный жизненный цикл задач.
