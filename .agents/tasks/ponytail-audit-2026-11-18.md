# ponytail-audit разбор, 2026-11-18

аудит переусложнения после ухода с localStorage. находки отчёта разложены на «применяем сейчас»
(безопасно, поведение не меняется) и «отдельным проходом» (может поменять поведение, нужен
ручной прогон).

## применяем сейчас — ветка A, мёртвый код

по одной строке на находку, файлы — в скобках. перед удалением подтвердить grep'ом, что
импортёров нет.

- `state.updatedAt`: три писателя, ноль читателей (`src/lib/storage/vaultFiles.ts:264,295,657`).
- `clearOutbox`: ноль вызовов, включая собственный файл (`src/lib/sync/localBookkeeping.ts:575`).
- `tombstonesToState`: живёт только в собственном тесте (`src/lib/sync/tombstones.ts:23`).
- `SecretBackend.mode` и тип `SecretStoreMode`: пишут три бэкенда, не читает никто — режим живёт в
  префах (`src/lib/platform/secretStore.ts:34-41,72-88`, `src/node/secrets.ts:30`).
- `SecretStoreUnavailableError`: кидается в четырёх местах, по типу не ловится ни одним `catch`
  (`src/lib/platform/secretStore.ts:43-48,222,256,265,273`).
- `isSystem` у папок: единственный читатель и так смотрит на путь (`src/types/index.ts:88`,
  `src/config/storage.ts:53`, `src/mcp/vault.ts:153`, `src/lib/backupService.ts:523`,
  `src/lib/storage/vaultFiles.ts:731`, `src/components/FolderProfile/FolderProfileHeader.tsx:66`).
- `foldersKey`/`draftsKey` из `VaultImportIo`: `importVaultPayload` их не зовёт
  (`src/lib/storage/vaultTransfer.ts:56-60`, `src/lib/storage/index.ts:873-887,407-409`).
- адаптер `browserPort.ts` (19 методов-делегатов): `StorageService` сам удовлетворяет `VaultPort`
  кроме `hasBytes` → `hasAttachmentBytes` (`src/lib/storage/browserPort.ts`, `port.ts:61-63`).
- второй канал кросс-оконных черновиков: `window.addEventListener('storage', …)` слушает ключ,
  который на native больше не пишется, а `BroadcastChannel` уже шлёт то же самое
  (`src/lib/storage/index.ts:324-341,411-413`, `settingsStore.ts:530-532`).
- `read?`/`entries?` в общем `PrefsBackend`: реализует только браузерный бэкенд — вынести в его
  тип и убрать `backend?.read?.()` из `getPref` (`src/lib/storage/prefs.ts:36-41,88-93,115-123`).
- 13 копий `Date.now() + Math.random().toString(36).slice(2,6)` → `crypto.randomUUID()`
  (`registry.ts:11`, `pushBundle.ts:278`, `logger.ts:325`, `memory.ts:191`, `demoVault.ts:10`,
  `fileDropHelper.ts:53`, `backupService.ts:474`, `useOverlays.ts:161`, `mcp/vault.ts:516`,
  `openAiAdapter.ts:188`, `openAiResponsesAdapter.ts:152,193`, `storage/index.ts:133`).

## применяем сейчас — ветка B, дубляж

- `parseLegacyJson` в трёх идентичных экземплярах (`settingsStore.ts:289`,
  `localBookkeeping.ts:344`, `legacyProfile.ts:408`) → один в `src/lib/storage/legacyJson.ts`.
- «запиши и перечитай, сравнив JSON» в двух местах (`localBookkeeping.ts:180`,
  `legacyProfile.ts:287`) → одна `writeVerified`.
- write-then-rename по `@tauri-apps/plugin-fs` в двух местах (`prefsBackend.native.ts:39`,
  `secretFileBackend.ts:68`) → одна `writeJsonAtomic`.
- разбор конверта AES-GCM в двух местах (`secretFileBackend.ts:40`, `encryptedLocalStore.ts:82`).
- `JSON.parse(JSON.stringify(...))` → `structuredClone` (`logger.ts:292`).
- `mergeIds`/`mergeOutbox` через `Map`/`Set` вместо ручных циклов (`syncSection.ts:121-142`).
- имена секций `state.json` в трёх файлах (`settingsStore.ts:66-70`, `legacyProfile.ts:144-147`,
  `localBookkeeping.ts:20`) → один `STATE_SECTIONS` в `src/lib/storage/stateSections.ts`.

## отдельным проходом, после ручного прогона (НЕ в этих ветках)

1. свернуть 18 пар «секция на диске / fallback» в `SyncSectionStore`
   (`localBookkeeping.ts:111-133,379-577`) — на этой ветке живут web-сборка и headless-нода,
   ошибка теряет надгробия, а это возврат удалённых заметок из релея.
2. `syncSection.ts` 302 строки → ~60: кэши не требуют валидатора на каждое поле, строгими должны
   остаться надгробия, конфиг и очередь. поведение меняется только на битых файлах.
3. удалить механику легаси-мержа в `settingsStore.ts:215,250-334`: пишет теперь
   `legacyProfile.ts`, на нативе эти префиксы в префы никто не писал. риск — наполовину
   мигрированный профиль.
4. 17 браузерных развилок `settingsStore` (534-894) — свести к семантике `state.json` на
   localStorage-бэкенде.
5. три коалесцирующие очереди записи (`prefs.flush`, `localBookkeeping.flushQueue`,
   `settingsStore.markDirty`) → одна `coalesce(key, run)`.

итого по отчёту аудита: ≈ −680 строк, зависимостей не снимается (все 22 пакета импортируются).
