# MCP mailbox bridge для safe status change в registry vaults

- **цель**: разрешить изменение статуса существующей задачи через MCP даже при наличии note-registry.json, не ломая legacy и не обходя guard напрямую.
- **трогаем**: новые и изменённые файлы
- **не трогаем**: Rust код, сетевой сервер, зависимости, протокол journal/revisions, живое хранилище production, DSH профиль, relay
- **готово когда**: `npm run check` без warning; тест на фикстуре показывает запрос/квитанцию, другой scope/нет journal/таймаут, legacy работает, чужие поля нетронуты
- **уже выяснили**:
  - `hasRegistryMarker()` проверяет `note-registry.json` → `assertLegacyWritable()` блокирует все записи MCP
  - `saveNoteEdit` возвращает `{ item, durable?: Promise<void> }` — `durable` это Promise journal commit
  - `noteIntentListeners.size > 0` = синхронный признак активного journal
  - `applyTaskCompletion(prev, next)` вычисляет авто-completion по подзадачам + recurrence
  - При активном journal: `saveNoteEdit` создает intentId → persistNoteIntents → queueNoteFileWrite (асинхронный диск)
  - При отсутствии journal: fallthrough к flushGuarded / прямому flush (Markdown write)
  - MCP запущен как отдельный Node.js процесс, нет IPC к приложению

---

## План реализации

### Файл 1: `src/lib/storage/taskMailbox.ts` — новый модуль
```typescript
// Mailbox directory constants
// Request/response types
// Atomic claim: rename pending/<uuid>.json -> processing/<uuid>.json
// Parse+validate: known filename pattern, bounded body, reject unknown/expired
// Cleanup: own artifacts only
```

### Файл 2: `src/mcp/vault.ts` — расширение saveNote/toggleTask
- Добавить `mailboxDir` config
- В `saveNote`: если передан только id + status (проверить zod defaults: status не default, id обязателен при update) → route через mailbox
- Остальные операции → assertLegacyWritable() unchanged
- Новый метод `queueStatusRequest(id, status): Promise<{ ok: true; receipt: string } | { ok: false; reason: string }>`

### Файл 3: `src/mcp/tools.ts` — обёртка save_note tool
- Передача результата mailbox в ответ клиенту
- Если blocked (vault closed/no journal) — сообщить корректно

### Файл 4: Точка запуска mailbox processor в AppContext
- Single-flight loop: polls mailbox every N ms
- Claims request atomically (rename pending→processing)
- Validates schema/scope/expiry
- Gets item from StorageCore
- Applies applyTaskCompletion(previous, next)
- Calls storage.saveNoteEdit(updated, { origin: 'local', editedFrom: previous })
- Waits for durable → confirms journal
- Optionally awaits disk write completion
- Writes receipt JSON to receipts/<uuid>.json
- Cleans up own artifacts

### Файл 5: Тестовая фикстура
- Mock vault dir with note-registry.json
- Create test task with specific id/status
- Send mailbox request via file system
- Verify request→receipt→disk projection
- Test: wrong scope, expired request, no active journal, legacy vault unaffected

---

## Инварианты
1. Не bypass guard — маршрутизация через mailbox
2. Атомарный claim через rename
3. At-most-once при рестарте/смене vault
4. Парсер строго известный формат filename/UUID
5. Очистка только своих артефактов
6. Receipt = local journal + local projection, НЕ relay sync statement
7. Idempotent explicit set-status
8. Не обрабатывать истекшие запросы
9. Не менять протокол/generations
