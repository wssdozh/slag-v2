---
id: smart_dates_and_reminders
title: "Умные Даты и Системные Напоминания (Smart Dates & Reminders)"
type: architecture
updated: 2026-10-21
tags:
  - reminders
  - tasks
  - dates
  - chrono
  - tauri
  - notifications
---

# ⏰ Умные Даты и Системные Напоминания

> Родительский документ: [[00_MOC_Map_of_Content]]  
> Связанные документы: [[01_UI_UX_Interactions_Matrix]], [[02_Data_Model_Obsidian_Vault]], [[07_Roadmap_Implementation]]

Модуль распознает даты, время и повторения из естественной речи пользователя при наборе задач в ленте. Работает локально в браузере и десктопном клиенте без сетевых запросов к LLM.

---

## 1. Базовые принципы и границы ответственности

1. **Строгая изоляция типов (Tasks Only)**:
   - Временные метаданные (`dueDate`, `reminder`, `recurrence`) принадлежат только задачам (`type: 'task'`).
   - Заметки (`type: 'note'`) и статьи (`type: 'article'`) не засоряются дедлайнами.
   - Если пользователь пишет фразу со временем в режиме заметки, композер предлагает переключить карточку в режим задачи.
2. **Сохранение авторского текста**:
   - Распознанные слова времени не вырезаются из текста.
   - Текст «завтра в 12:00 помыть капусту» сохраняется в исходном виде. Метаданные пишутся параллельно в YAML Frontmatter.
3. **Нулевая цена отмены**:
   - Распознанная дата отображается в виде интерактивного чипа до момента сохранения.
   - Один клик на `✕` или нажатие `Escape` отключают дату для текущей записи.

---

## 2. Поведение интерфейса (UX Flow)

```
[ Пользователь вводит текст ]
               │
               ▼
[ Краевой анализ: начало ^ или конец $ строки ]
               │
       ┌───────┴───────┐
   Найдено          Не найдено
       │               │
       ▼               ▼
[ Показ Ghost-чипа ]  [ Обычный ввод ]
       │
   ┌───┴───────────────┐
   │                   │
Нажат ✕             Enter / Сохранить
   │                   │
   ▼                   ▼
[ Отмена даты ]     [ Запись YAML: dueDate / reminder ]
```

1. **Ввод текста**:
   - При наборе текста в `Composer` срабатывает дебаунс-парсер (150 мс).
   - Парсер проверяет совпадения по краям фразы.
2. **Интерактивный чип (Ghost Chip)**:
   - Под строкой ввода появляется плашка:
     `[ 📅 Пятница, 13:00  ✕ ]`
   - Чип показывает точную вычисленную дату и время.
3. **Действия пользователя**:
   - **Сохранение (`Enter` / `Ctrl+Enter`)**: создается задача с полями `dueDate` и `reminder`. Исходный текст остается полным.
   - **Отмена (`✕` / `Escape` / `Backspace` по пустому чипу)**: чип скрывается, привязка к календарю снимается, текст не меняется.

---

## 3. Защита от ложных срабатываний (Edge Anchoring)

Парсер анализирует только начало или конец строки:
- **Начало строки (`^...`)**:
  - `завтра в 12:00 позвонить в банк` ➔ дата извлекается.
  - `каждую пятницу отчет` ➔ дата и повторение извлекаются.
- **Конец строки (`...$`)**:
  - `купить билеты в пятницу` ➔ дата извлекается.
  - `созвон с командой в 15:30` ➔ время извлекается.
- **Середина предложения (игнорируется)**:
  - `я помню, что в пятницу был дождь, а потом мы пошли в кино` ➔ парсер не срабатывает.

---

## 4. Движок разбора естественного языка

### 4.1. Выбор фреймворка: почему именно chrono-node

При анализе рынка фреймворков для разбора естественных дат выявлено:
- **`sherlock.js` / `compromise-dates` / `sugar-date`**: поддерживают только английский язык.
- **`@microsoft/recognizers-text-date-time`**: тяжелый энтерпрайз-пакет (>2 МБ) без поддержки русского языка.
- **`Duckling` (Meta)**: требует фонового сервиса на Haskell, нарушая Local-First архитектуру.
- **`Natasha` / `yargy`**: Python-библиотеки, недоступные в браузере без тяжелых WASM-прослоек.

**`chrono-node`** — единственное зрелое решение в JS/TS с полноценной поддержкой русской грамматики (`chrono.ru.casual`), нулевыми зависимостями, быстрым исполнением (<1 мс) и открытой архитектурой рефайнеров.

### 4.2. Архитектура и точечный импорт (Tree-Shaking)

Для минимизации размера бандла подключаются только востребованные локали вместо импорта всех мировых языков:

```typescript
// Точечный импорт нужных локалей
import * as chronoRu from 'chrono-node/ru';
import * as chronoEn from 'chrono-node/en';
import { rrulestr } from 'rrule';

export interface ParsedDateResult {
  date: Date;
  hasTime: boolean;
  rawText: string;
  recurrence?: string;
}

export function parseNaturalDate(input: string, referenceDate = new Date()): ParsedDateResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Проверка повторяющихся правил (Recurrence)
  const recurrenceRule = detectRecurrence(trimmed);

  // 2. Каскадный выбор парсера: сначала RU, затем EN
  const isCyrillic = /[а-яё]/i.test(trimmed);
  const parser = isCyrillic ? chronoRu.casual : chronoEn.casual;

  const results = parser.parse(trimmed, referenceDate, { forwardDate: true });
  if (!results.length) return null;

  const match = results[0];
  
  // 3. Краевой фильтр: совпадение строго в начале или в конце строки
  const isAtStart = match.index === 0;
  const isAtEnd = (match.index + match.text.length) >= trimmed.length - 2;

  if (!isAtStart && !isAtEnd) {
    return null;
  }

  const date = match.start.date();
  const hasTime = match.start.isCertain('hour');

  return {
    date,
    hasTime,
    rawText: match.text,
    recurrence: recurrenceRule || undefined,
  };
}
```

### 4.3. Вычисление повторений через rrule

Для повторяющихся задач используется стандартная библиотека `rrule`:
1. При создании задачи сохраняется строка правила iCalendar RFC 5545, например:  
   `recurrence: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=13;BYMINUTE=0"`
2. При завершении задачи чекбоксом (`done`) система рассчитывает следующий срок:
   ```typescript
   const rule = rrulestr(item.recurrence);
   const nextDate = rule.after(new Date());
   // Обновление dueDate и reminder на следующую дату без создания дубликата
   ```

### Поддерживаемые шаблоны

| Язык | Входная фраза | Результат |
|---|---|---|
| RU | `завтра помыть капусту` | Завтра, 00:00 (целый день) |
| RU | `послезавтра в 12:00` | Дата + 2 дня, 12:00 |
| RU | `в пятницу в 13 00` | Ближайшая пятница, 13:00 |
| RU | `сегодня вечером` | Сегодня, 20:00 |
| EN | `tomorrow at 3pm` | Завтра, 15:00 |
| EN | `next monday 10:00` | Следующий понедельник, 10:00 |

### Правила повторений (Recurrence)

Для регулярных событий («каждую пятницу в 13:00», «every day at 9am») парсер формирует строку по стандарту iCalendar RFC 5545:
- `FREQ=WEEKLY;BYDAY=FR;BYHOUR=13;BYMINUTE=0`
- `FREQ=DAILY;BYHOUR=9;BYMINUTE=0`

---

## 5. Контракт данных (Markdown Frontmatter)

В файле заметки `.md` метаданные фиксируются в секции YAML:

```yaml
---
id: task_1716034500_abc
type: task
title: завтра помыть капусту
folder: Входящие
status: todo
priority: none
dueDate: 2026-05-15
reminder: 2026-05-15T12:00:00Z
recurrence: FREQ=WEEKLY;BYDAY=FR
tags:
  - дом
attachments: []
createdAt: 1716034500000
updatedAt: 1716034500000
---

завтра помыть капусту
```

---

## 6. Системные уведомления (Notification Engine)

Напоминания приходят через системный центр уведомлений операционной системы (Windows, macOS, Linux, Android, iOS).

```
[ AppContext: Таймер каждые 30с ]
               │
               ▼
[ Сверка reminder <= Date.now() ]
               │
       ┌───────┴───────┐
   Tauri Десктоп     Веб-браузер
       │               │
       ▼               ▼
[ tauri-plugin-     [ Web Notification
  notification ]           API ]
       │               │
       └───────┬───────┘
               ▼
[ Системный баннер со звуком ]
               │
[ Клик: переход к карточке задачи ]
```

1. **Десктоп (Tauri v2)**:
   - Плагин: `@tauri-apps/plugin-notification`.
   - Поддерживает показ баннеров при свернутом окне и в системном трее.
2. **Веб-версия**:
   - Стандартный `Notification API`.
   - Запрос разрешения прав при первом включении напоминания.
3. **Обработка срабатывания**:
   - При клике по уведомлению приложение открывает нужную папку и подсвечивает карточку задачи.
   - Если задача повторяющаяся (`recurrence`), дата `dueDate` и `reminder` сдвигаются на следующий интервал.
