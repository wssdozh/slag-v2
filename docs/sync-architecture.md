# Архитектура синхронизации SLAG v2 (целевой контракт)

> Актуальный контракт синхронизации. Заменяет устаревшие разделы
> `docs/project-map/06_E2E_Sync_Architecture.md` (там описан «эфемерный relay без БД»
> и «мастер-пароль» — реализация уже ушла вперёд: relay хранит SQLite, ключи от seed).
> Код сервера вынесен в [wssdozh/slag-relay](https://github.com/wssdozh/slag-relay);
> здесь остаётся клиент и контракт.

## Принципы

- **Local-first**: постоянное хранилище — только устройства. Relay — шифрованный брокер изменений (Zero-Knowledge: видит зашифрованные пакеты, не читает содержимое хранилища). Отдельно от бандлов — очередь напоминаний: `title`/`body` задачи лежат в `notify_jobs` открытым текстом, и, когда ни одно устройство не в сети, релей рисует сводку именно из них.
- **Server-authoritative ordering**: сервер назначает монотонно растущий `syncId`; клиенты применяют изменения в этом порядке, stale скипают. Это LWW без CRDT (модель Linear LSE).
- **Outbox**: каждое локальное изменение — операция `upsert/delete` с `synced` флагом в durable очереди, а не diff по wall-clock.
- **Delta**: по сети едут только изменённые объекты, не полный снапшот.

## Секреты at rest

`seedPhrase`, токен аккаунта и private key устройства не сериализуются в `localStorage`.
Их хранит `src/lib/platform/secretStore.ts`:

| платформа | backend | где лежит |
|---|---|---|
| desktop tauri | `keyring` (`src-tauri/src/secure_store.rs`) | Windows Credential Manager / macOS Keychain / Linux Secret Service |
| web, android | AES-GCM-256 (`encryptedLocalStore.ts`) | шифртекст в `slag_secure_v1:*`; ключ non-extractable в IndexedDB |

`initSecretStore()` выполняется до импорта `App`, переносит старые значения и удаляет
plaintext только после успешной записи. Конфиг синка (`slag_sync_config_v2*`) больше не
содержит `seedPhrase`; если существующее хранилище осталось без ключа, sync явно
блокируется, а не генерирует новый seed. Android Keystore — отдельный follow-up.

## Entity registry — что синхронизируется

| Entity | Синхр. | `id` | Описание |
|---|---|---|---|
| `item` | ✅ | `item.id` | заметка/задача/статья: tags, attachments (метаданные), pin/архив, task-поля |
| `folder` | ✅ | `folder.path` | upsert + delete + rename |
| `workspace` | ✅ | `'workspace_state'` | канбан-колонки, виды |
| `trash` | ✅ | `item.id` | delete-tombstone + кросс-девайс восстановление из корзины |
| `attachment` | ✅ | `attachment.id` | байты отдельным изменением в том же бандле, один файл на бандл, ≤6 МБ, **не** base64 внутри item |
| `assistantHistory` | ❌ | — | per-device (чат с ИИ) |
| `composerDrafts` | ❌ | — | per-device (черновики) |
| настройки (тема/AI/клавиши) | ❌ | — | per-device |

## Типы

```ts
// src/lib/sync/entities.ts
export type SyncEntityKind = 'item' | 'folder' | 'workspace' | 'trash' | 'attachment';

export interface SyncEntity {
  kind: SyncEntityKind;
  id: string;
  version: number;   // Фаза 1 = Date.now(); Фаза 2 = server syncId
  deleted: boolean;
  payload: unknown;  // SlagItem | FolderMeta | WorkspaceState | SlagAttachment
}

export interface SyncChange {
  kind: SyncEntityKind;
  id: string;
  action: 'upsert' | 'delete';
  version: number;
  payload?: unknown;
}
```

```ts
// src/lib/sync/outbox.ts
export interface OutboxOp extends SyncChange { opId: string; synced: boolean; }

export class Outbox {
  enqueue(op: Omit<OutboxOp, 'opId' | 'synced'>): void;
  pending(): OutboxOp[];
  markSynced(opIds: string[]): void;
  compact(maxSynced?: number): void;
  clear(): void;
}
```

## Единая точка входа

> **Статус: цель, в коде этого ещё нет.** Сейчас очередь живёт в `SyncEngine.getOutbox()`,
> пуш дебаунсится `scheduleDebouncedPush()`, а бандл остаётся полным снапшотом, не delta.
> `commit()` и `outbox.enqueue()` — из плана ниже, не ищите их в `src/`.

`SyncEngine.commit(kind, id, action, payload?)` → `outbox.enqueue(...)` + debounce(300ms) push.
Все мутации в `AppContext` (save/update/delete/move/restore/folder/workspace) идут через `commit`,
не напрямую через `pushLocalChanges`.

## Контракт сервер/клиент (relay)

```sql
CREATE TABLE sync_events (
  sync_id INTEGER PRIMARY KEY AUTOINCREMENT,  -- server-assigned total order
  room_id TEXT NOT NULL,
  from_device_id TEXT NOT NULL,
  payload TEXT NOT NULL,                      -- encrypted list<SyncChange>
  created_at REAL NOT NULL, expires_at REAL NOT NULL
);
CREATE INDEX idx_sync_events_room ON sync_events(room_id, sync_id);
CREATE TABLE device_cursors (
  device_id TEXT, room_id TEXT, last_sync_id INTEGER,
  PRIMARY KEY(device_id, room_id)
);
```

- `POST /api/rooms/{room}/events` — сервер назначает `syncId`, broadcast, отвечает `{syncId}`.
- `GET /api/rooms/{room}/events?since=<syncId>` — `{events, latestSyncId}` (catch-up после офлайна).
- ack = обновление `device_cursors.last_sync_id` (at-least-once, дубли гасятся по `syncId`).

### Манифест комнаты (сделано)

Сверка «у меня и у соседа один корень»: `src/lib/sync/manifestSync.ts`, форма — `manifestChannel.ts`.

- `POST /api/rooms/{room}/manifest?vault=<id>` — тело `{v: 1, root, folders}`. Сервер хранит
  **только `root` и `folders`** (`routes_manifest.py` отбрасывает `leaves`) и отвечает `{syncId}`.
- `GET /api/rooms/{room}/manifest?vault=<id>` — `{v, root, folders, syncId}`; `204`, когда
  присланный `since` не старше записи; `404`, когда никто ещё не публиковал; `413` на тело больше 128 КБ.
- Клиент шлёт листья, пока они влезают в лимит. Релей их сегодня не хранит, поэтому ремонт —
  **один полный ресэнд состояния**, а не догрузка конкретных заметок (это осознанный потолок).
- Решение принимает `decideManifest`: совпало → ничего; расхождение → один полный ресэнд на каждое
  состояние соседа (защёлка `manifestReconcileRoot`, чтобы две машины не гоняли бандлы по кругу);
  повтор против того же корня → только отчёт. Устройство в `receive-only` не переотправляет никогда.
- Манифест строится без ключа (`buildManifest` без `CryptoKey`): тот же индекс пишет панель, и
  ключевание развело бы две подписи одного и того же хранилища. Транспорт и так шифрован.

## Спиннер синка

`status.state === 'syncing'` — единственное, что крутит иконку синка в сайдбаре. Инвариант: кто
поставил `syncing`, тот его и снимает. `persistIncomingBundle` ставил его до всех проверок и уходил
ранними `return` (свой же эхо-бандл, повторная доставка после потерянного ACK) — спиннер оставался
крутиться до следующей локальной правки. Теперь `syncing` ставится после валидаций, а выход по смене
`generation` возвращает `connected`/`idle` (`settleStatus`). Манифест состояние не трогает: сверка —
проверка движка, а не его шаг.

## Фазы внедрения

1. **Фаза 0** — этот документ.
2. **Фаза 1** (клиент-only, сервер не меняем): `entities.ts` + `outbox.ts` + `commit()`; push/apply
   переводятся на операции из outbox (бандл временно остаётся полным снапшотом для совместимости).
   Чинит: удаление/переименование папок, `moveItem`/`restoreFromTrash` (сейчас не пушатся сразу).
3. **Фаза 2** (relay): `sync_events` + `syncId` + `since`-курсор; бандлы становятся delta; LWW по `syncId`.
4. **Фаза 3**: `trash` — полноценная entity; `attachment` — сделано: байты едут изменением `attachment` в том же шифрованном бандле (один файл на бандл, ≤6 МБ, без чанков), приёмник пишет их в IndexedDB и `.attachments/`. Файл больше лимита не синкается и честно помечается в UI «файла нет на устройстве».
5. **Фаза 4**: вынести `transport.ts`/`reconcile.ts`, `syncEngine.ts` — тонкий оркестратор.
