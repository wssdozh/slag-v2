---
id: 12_logging_diagnostics_engine
title: "12. Архитектура Логирования и Инспекции (SLAG Logger & HUD)"
type: architecture_spec
updated: 2026-10-22
tags:
  - logging
  - diagnostics
  - hud
  - devtools
  - linear-dark
---

# 12. Архитектура Логирования и Инспекции (SLAG Logger & HUD)

> Локальная система диагностического логирования и In-App Dev HUD в эстетике Linear & Vercel Minimal Dark.  
> **Zero-Dependency (0 KB оверхеда)**, кольцевой буфер в памяти, авто-маскирование API-ключей, экспорт в Markdown/JSON для баг-репортов.

---

## 1. Архитектурная Концепция

В соответствии с **Лестницей простоты Ponytail** в проекте запрещено подключать тяжеловесные внешние фреймворки (Winston, Pino) или завязываться исключительно на Rust-рантайм (`tauri-plugin-log`), который не работает в браузере и E2E Playwright.

Реализовано единое ядро `src/lib/logger.ts`, работающее изоморфно (браузер, Tauri v2, Playwright):

```
┌────────────────────────────────────────────────────────┐
│                   SLAG Logger Engine                   │
│  - Скоупы: AI | FS | SEARCH | UI | APP | SYNC          │
│  - Уровни: trace | debug | info | warn | error         │
│  - Sensitive Redactor: маскирование API-ключей         │
│  - Time Tracking: logger.time / logger.trackAsync      │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌───────────────────────┐        ┌───────────────────────┐
│ Browser DevTools %c   │        │ In-Memory Ring Buffer │
│ - Цветовые бейджи     │        │ - Лимит 1000 записей  │
│ - Свернутые группы    │        │ - EventBus подписки   │
│ - Замеры времени (+ms)│        └───────────┬───────────┘
└───────────────────────┘                    │
                                             ▼
                               ┌───────────────────────────┐
                               │ LogViewer & LogModal UI   │
                               │ - Вкладка в Dockview      │
                               │ - HUD модалка (Ctrl + `)  │
                               │ - Поиск и фильтры         │
                               │ - Экспорт JSON & Markdown │
                               └───────────────────────────┘
```

---

## 2. Модель Данных (`src/types/index.ts`)

```typescript
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type LogScope = 'AI' | 'FS' | 'SEARCH' | 'UI' | 'APP' | 'SYNC';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  scope: LogScope;
  message: string;
  data?: unknown;
  durationMs?: number;
}
```

---

## 3. Политика Безопасности и Маскирования Данных (Privacy First)

Перед записью любого сообщения или объекта в память и консоль выполняется санитизация:
- Ключи Groq (`gsk_*`) и Gemini (`AIzaSy*`) маскируются: `gsk_12...[REDACTED]`.
- Заголовки авторизации (`Bearer ...`) маскируются: `Bearer [REDACTED_TOKEN]`.
- Поля объектов с именами `key`, `secret`, `token`, `password`, `authorization` заменяются на `[REDACTED_SECRET]`.

---

## 4. Скоупированное Логирование по Подсистемам

Для каждого модуля создается изолированный скоуп:

```typescript
import { logger } from './logger';

const aiLog = logger.scope('AI');
const fsLog = logger.scope('FS');
const searchLog = logger.scope('SEARCH');
const uiLog = logger.scope('UI');
const appLog = logger.scope('APP');
```

### Замер производительности:
```typescript
// Синхронный / ручной таймер
const endTimer = searchLog.time('Indexing items in Orama');
// ... работа ...
endTimer('Indexing finished'); // Запишет durationMs в лог

// Асинхронный трекер
const result = await aiLog.trackAsync('Gemini:GenerateTags', async () => {
  return await fetch(...);
});
```

---

## 5. UI/UX: LogViewer & Dev HUD

1. **Компонент `LogViewer` (`src/components/Logs/LogViewer.tsx`)**:
   - Фон: монохром `#08090a`, карточки записей `#141417`, бордеры `#27272a`.
   - Моноширинный стек записей со временем до миллисекунд `HH:mm:ss.SSS`.
   - Цветовая дифференциация скоупов и уровней.
   - Фильтры по уровню (`ALL`, `ERROR`, `WARN`, `INFO`, `DEBUG`) и скоупу (`AI`, `FS`, `SEARCH`, `UI`, `APP`, `SYNC`).
   - Полнотекстовый поиск по сообщению и данным.
   - Автопрокрутка вниз при поступлении новых записей (с умной паузой при прокрутке вверх).
   - Раскрывающиеся JSON-аккордеоны для записей с полезной нагрузкой (`data`).
   - Кнопка **«Отчёт»**: мгновенно генерирует и копирует готовый Markdown со спецификацией ОС, браузера, хранилища и последних ошибок для вставки в issue/чат.
   - Кнопка **«JSON»**: скачивание файла логов.
   - Кнопка **«Очистить»**: сброс буфера.

2. **Точки доступа**:
   - **Dockview Таб**: в любой группе вкладок можно нажать `[+]` и выбрать **«Логи & HUD»**.
   - **Глобальный хоткей**: ``Ctrl + ` `` (тильда) или `Cmd + ` ` вызывает оверлей `LogModal`.
   - **Кнопка в сайдбаре**: иконка терминала `Terminal` внизу сайдбара рядом с настройками.
   - **Стек закрытия (LIFO)**: клавиша `Escape` мгновенно скрывает модальное окно.
