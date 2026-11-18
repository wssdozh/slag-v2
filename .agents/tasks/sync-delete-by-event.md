# синк: удаление — событие, а не разница множеств

## цель

убрать класс багов «индекс ещё не загрузился → всё удалено → разослать на все устройства»,
починить без порогов, эвристик и «проверок готовности», которыми обычно затыкают такое.

инцидент 2026-11-18: 84 заметки уехали в корзину на пк, релей разнёс это на ноут и телефон,
потом повторилось при повторном запуске.

## что оказалось не так, как думали

два места решали «объект удалён» через отсутствие в списке:

1. `pushBundle.ts` — `syncedIds ∖ currentIds`. `syncedIds` = «это устройство уже отправляло»,
   `currentIds` = текущий индекс. на старте индекс пуст → все `syncedIds` становятся `delete`.
   при этом в том же outbox уже лежит **явное** событие `item/delete` (его пишут и `trashItem`,
   и наблюдатель диска), а `pushBundle` его просто выбрасывал: в цикле по `pendingOps` не было
   ветки `kind === 'item'`.
2. `storage/index.ts::importSyncedVaultData` — «нет в присланном списке → удалить файл». бандл
   несёт изменения, а не снимок хранилища; база для списка — тот же индекс, который на старте пуст.

`seedSyncedIds` (syncEngine:init) добивал картину: он засевал леджер из индекса, так что чистка
`state.json` не помогала — при следующем старте леджер снова наполнялся.

## что трогаем

- `src/lib/sync/itemDeletions.ts` — новый чистый модуль: удаления берутся только из явных
  `item/delete` в outbox.
- `src/lib/sync/pushBundle.ts` — вычитание убрано, удаления пакуются из `pendingOps`.
  `syncedIds` из `PendingPush` уходит.
- `src/lib/sync/syncEngine.ts` — `stageImport`/`writeStagedImport` получают `removedIds`;
  `seedSyncedIds` и `saveSyncedIds` удалены.
- `src/lib/sync/applyBundle.ts` — копит `removedIds` по факту применённых `delete`.
- `src/lib/storage/vaultTransfer.ts` — `notesRemovedByImport`: какие файлы снимать с диска.
- `src/lib/storage/index.ts` — `importSyncedVaultData` снимает только явно удалённые id.
- `src/lib/sync/entities/registry.ts` — `item/delete` с origin `external` доезжает до outbox
  (раньше такие удаления жили только за счёт вычитания).
- `src/lib/sync/localBookkeeping.ts`, `src/lib/sync/syncSection.ts` — леджер `syncedIds` удалён
  целиком: второй источник правды, который никто не читал.
- `src/context/AppContext.tsx` — `syncEngine.init()` ждёт `storage.initTauriFs()`: движок не
  стартует на ещё не прочитанном с диска индексе.

## чего не трогаем

- LWW и формат бандла.
- `importVaultData` / `parseVaultBackup` — восстановление из бэкапа остаётся снимком.
- UI.

## критерий готовности

- `npm run check` — 0 warnings.
- `npm run test:scripts` — новые тесты `sync-deletions.test.mjs` зелёные.
- пустой индекс не рождает ни одного `delete` и ни одного снятого файла; явное удаление доезжает.
- `npm run build`; релиз dev-канала; обновление пк/ноут/телефон.

## после работы

(дописать, что вышло)
