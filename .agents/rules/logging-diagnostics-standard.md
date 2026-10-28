# Стандарт Логирования и Диагностики

Регламент системного логирования для модулей приложения и ИИ-агентов.

---

## 1. Запрет сырых `console.log`
Все события маршрутизируются через `logger.scope(...)`:

```typescript
import { logger } from '../lib/logger';

const aiLog = logger.scope('AI');
const fsLog = logger.scope('FS');
```

---

## 2. Скоупы
- `AI`: Вызовы LLM, парсинг тегов, триаж, reasoning, замеры `durationMs`.
- `FS`: Операции с файлами, `.trash`, сохранение вложений, квота хранилища.
- `SEARCH`: Индексация Orama BM25, поисковые запросы, fallback.
- `UI`: Тосты, навигация по папкам, смена представлений, модальные окна.
- `APP`: Инициализация, статус сети, глобальные ошибки.
- `SYNC`: Сетевая синхронизация, WebSocket relay.
- `MEDIA`: Запись аудио/видео, разрешения микрофона и камеры, MediaRecorder.
- `WORKSPACE`: Отвязывание вкладок (tear-off), стыковка окон, сохранение геометрии.

---

## 3. Замер времени выполнения
Тяжелые операции сопровождаются замером длительности:

```typescript
const endTimer = searchLog.time('Orama index rebuild');
// ...
endTimer('Orama index rebuilt');

// или
const data = await aiLog.trackAsync('AssistantChat', async () => fetch(...));
```

---

## 4. Защита чувствительных данных
Логгер автоматически маскирует строки с `gsk_`, `AIzaSy`, `Bearer` и ключи объектов со словами `token`, `secret`, `key`, `password`. Запрещено отключать санитизацию в `src/lib/logger.ts`.
