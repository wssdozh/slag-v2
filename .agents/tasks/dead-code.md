# ветка A аудита: мёртвый код

- **цель**: выпилить из `src/` то, что пишется, но не читается, и не менять при этом поведение: те же
  файлы на диске, те же события, те же id (кроме формата — см. ниже), те же настройки.
- **трогаем**: `src/lib/storage/{vaultFiles,port,browserPort,prefs,index,vaultTransfer}.ts`,
  `src/lib/sync/{localBookkeeping,tombstones,entities/registry,pushBundle}.ts`,
  `src/lib/platform/secretStore.ts`, `src/node/{secrets,stubs/browserPort}.ts`,
  `src/types/index.ts`, `src/config/storage.ts`, `src/mcp/vault.ts`, `src/lib/backupService.ts`,
  `src/components/FolderProfile/FolderProfileHeader.tsx`, `config/vite.node.config.ts`,
  `scripts/sync-tombstones.test.mjs` и 12 мест с `Date.now() + Math.random()`.
- **не трогаем**: `package.json`, `docs/CODE_MAP.md`, `src-tauri/`, релей, и всё из раздела
  «отдельным проходом» аудита (секции `state.json`, легаси-мерж, очереди записи).
- **готово когда**: `npm run check` (0/0), `npm run build` (все четыре шага), `npm run test:scripts`,
  `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/quick_shots.spec.ts e2e/sync_delete.spec.ts
  e2e/slag/storage_usage.spec.ts` — зелёные.
- **уже выяснили**:
  - `state.updatedAt` пишут три места в `vaultFiles.ts`, читает ноль: `state` — это
    `Record<string, unknown>`, ключ нигде не разбирается.
  - `StorageService` действительно удовлетворяет `VaultPort` (19 методов, `subscribeChanges`,
    `saveMemory → boolean`), кроме имени `hasBytes` → `hasAttachmentBytes`. Значит адаптер
    `browserPort.ts` не нужен, а `vault()` может вернуть сам сервис. Node-сборка подменяет
    `./index` из `port.ts` стабом — иначе в бандл приедет весь StorageService.
  - `BroadcastChannel` шлёт черновики и в браузере (`afterBrowserDraft`), и на нативе
    (`flushQueue`), поэтому слушатель `storage`-события по ключу черновиков дублирует его.
  - по id с таймстампом (`log_`, `att_`, `op_`, `item_`) таймстамп нигде не парсится. Но
    `backupService` вытаскивает id вложения из имени файла регуляркой `att_[0-9a-z_]+` — с
    uuid-хвостом (дефисы) она перестанет совпадать, поэтому класс символов расширяется на `-`.
  - `src/lib/storage/index.ts:133` — не копия `Date.now() + random`, а fallback самого
    `crypto.randomUUID()`; трогать нечего.

---

## что оказалось не так

- **13 копий — это 12.** `src/lib/storage/index.ts:133` не генерирует id из таймстампа: это
  fallback *внутри* вызова `crypto.randomUUID()`. Заменять его на этот же вызов бессмысленно,
  поэтому оставлен как есть.
- **`att_` — контракт в двух регулярках, а не только в имени.** Кроме `backupService` id вложения
  из имени файла режет `attachments.ts:77` (`/^att_[a-z0-9]+_/`): с uuid-хвостом (дефисы) она
  перестаёт совпадать, а `pathFor` — единственный путь к байтам, когда точное имя не открылось.
  Класс символов расширен на `-` в обоих местах. Поведение на старых (бездефисных) id не меняется.
- **`tombstonesToState` забрал с собой ещё и тип `TombstonesSection`** — он был только его
  возвращаемым типом. Тест на форму секции удалён целиком, остальные проверки — `sanitize`,
  `merge`, чтение — переписаны на `sanitizeTombstones(tombstonesFromState(...))` и живы.
- **Ключи импорта тянули за собой две обёртки.** После `foldersKey`/`draftsKey` умерли
  `folderStorageKey` (и её локальная константа) и `draftsStorageKey`. Последняя живёт в
  `settingsStore.ts` — файле dedup'а; там удалена ровно эта функция (4 строки), больше ничего.
- **Node-сборка: правило подмены переехало, а не исчезло.** `port.ts` теперь импортирует
  `./index`, и в `config/vite.node.config.ts` появилось правило `source === './index' &&
  importer.endsWith('/storage/port.ts') → storageSingleton`. Стаб `browserPort.ts` удалён.
  Caveat, который был и до ветки: сам `StorageService` в node-бандл всё равно приезжает через
  `lib/ai/*` и `lib/memory` (`'../storage'` вне `/lib/sync/`), так что размер бандла почти не
  изменился (1 304 → 1 303 kB). Подмена важна не размером, а тем, что `vault()` не может вернуть
  настоящий store в headless-сборке.
- **`newMemoryId(now)` получал `now` только ради префикса** — параметр убран вместе с ним,
  вызывающий один.
- **dedup приехал в `main` посреди работы**: `git merge main` (4413bbd) сделан после шести
  коммитов, последние три (ключи импорта, тип prefs, uuid) легли уже на смерженное дерево.
  `secretEnvelope.ts`, `writeJsonAtomic.ts`, `legacyJson.ts` не тронуты; `SecretBackend.mode`
  и `SecretStoreUnavailableError` выпилены до мержа и с dedup не пересекаются.
- **7 спек в `feed`/`assistant_memory` падают и на `main`** (прогнал те же тесты на 4413bbd —
  тот же список, те же ошибки). К этой ветке отношения не имеют, `feed`/`assistant_memory` — не
  мои зоны. Всё остальное в этих файлах зелёное (35 passed, 1 skipped).

## что осталось

- `docs/CODE_MAP.md` не перегенерирован (запрещено править): в нём ещё есть `browserPort.ts` и
  `isSystem`. Обновится `npm run map:code` на чужой ветке.
- `docs/project-map/09_Folder_Views_Stream_Kanban_Calendar.md` всё ещё описывает `isSystem`
  в `FolderMeta` — это архив для людей, руками не правил.
- `usage.ts` продолжает считать префикс `slag_folders_` в панели хранилища: ключ никто не пишет
  с переезда на `state.json`, но сама панель — не мой пункт списка.

## результат

`check` — 0 warnings / 0 errors; `build` — tsc ×2 + три бандла; `test:scripts` — 108 pass,
1 skip (документированное исключение про легаси-профиль); e2e-трио на одном воркере — 6 passed.
Дифф: 35 файлов, −199 / +114, в сумме −85 строк.

