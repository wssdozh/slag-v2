# logging-diagnostics-standard.md — Стандарт Логирования и Диагностики SLAG v2

> Регламент системного логирования для модулей приложения и автономных ИИ-агентов.  
> Скоупы: `AI`, `FS`, `SEARCH`, `UI`, `APP`, `SYNC`.

---

## 1. Запрет на сырые `console.log`
В коде проекта запрещено оставлять произвольные `console.log` или `console.warn` без структуры. Все события приложения маршрутизируются через `logger`:

```typescript
import { logger } from '../lib/logger';

// Создание скоупированного инстанса
const aiLog = logger.scope('AI');
const fsLog = logger.scope('FS');
const searchLog = logger.scope('SEARCH');
```

## 2. Скоупы и Уровни
- **`AI`**: Вызовы моделей Groq/Gemini, парсинг тегов, триаж, reasoning, тулколлы, переключение на локальные эвристики.
- **`FS`**: Создание, чтение, изменение, перемещение в корзину `.trash`, переключение и создание Vault.
- **`SEARCH`**: Индексация Orama BM25, выполнение поисковых запросов, время поиска, fallback на fuzzy-фильтр.
- **`UI`**: Тосты, открытие/закрытие полноэкранных редакторов, смена активных представлений.
- **`APP`**: Инициализация приложения, глобальные ошибки `window.onerror`, unhandled promise rejections.
- **`SYNC`**: Сетевая синхронизация, WebSocket relay.

## 3. Трекинг Времени (Performance Metrics)
Любые ресурсоёмкие операции (индексация, сетевые запросы к LLM) должны сопровождаться замером длительности:

```typescript
// Вариант 1: Через time()
const endTimer = searchLog.time('Orama index rebuild');
// ...
endTimer('Orama index rebuilt'); // Автоматически запишет durationMs

// Вариант 2: Через trackAsync()
const data = await aiLog.trackAsync('Groq:AssistantChat', async () => {
  return await fetch(...);
});
```

## 4. Защита Чувствительных Данных (Privacy Filtering)
Логгер автоматически маскирует строки, содержащие:
- `gsk_...` (Groq API keys)
- `AIzaSy...` (Gemini API keys)
- `Bearer ...` (токены авторизации)
- Объектные ключи со словами `token`, `secret`, `key`, `password`

Ни при каких обстоятельствах не отключать санитизацию в `src/lib/logger.ts`.
