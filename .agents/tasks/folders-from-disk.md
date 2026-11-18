# папки — производные от диска, а не список в localStorage

- **цель**: папка существует ⇔ её каталог лежит в `notes/`. `state.json` хранит только метаданные по пути (name/description/icon/kanbanColumns/showReferenceColumn), кеш в localStorage перестаёт быть источником истины (остаётся для мгновенной отрисовки и для браузерного режима, где fs нет). созданная снаружи папка (mcp `create_folder`, другое устройство) появляется в интерфейсе без перезапуска, и запись из приложения больше не затирает её в `state.json`.
- **трогаем**: `src/lib/storage/folderSource.ts` (новый, чистый), `src/lib/storage/folderStore.ts`, `src/lib/storage/vaultFiles.ts`, `src/lib/storage/index.ts`, `src/config` (сид), `src/types/index.ts` (`isSystem`), `src/lib/storage/vaultWatch.ts` + `vaultWatchDiff.ts` + `src/context/hooks/useVaultWatch.ts`, `scripts/folder-source.test.mjs` + `scripts/vault-watch.test.mjs`.
- **не трогаем**: синк-протокол и релей, `src/components/**`, css, mcp-инструменты (он уже читает диск), `src-tauri`.
- **готово когда**: `npm run check` → `0 warnings and 0 errors`, `npm run build`, `npm run test:scripts` зелёные; в `npm run dev` создание/переименование/удаление папки работает; созданная через mcp папка появляется без перезапуска.
- **уже выяснили**: папки сегодня живут в трёх местах сразу — localStorage (`readFolders`), `state.json` (импорт только в `syncCurrentVaultFs`), каталоги на диске. писателей тоже четыре: `writeFolder`/`describeFolder`/`eraseFolder`/`renameFolderTree`, папковая часть `importSyncedVaultData`, импорт при старте, mcp `writeState`. `flushStateToDisk` пишет объект целиком из localStorage — поэтому действие с папкой в приложении стирает запись, сделанную mcp. mcp при этом уже дисковый: его `getFolders()` досоздаёт папки, найденные на диске.

---

после работы допиши: что оказалось не так, как думали, и что осталось.

## оказалось не так, как думали (ветка `feat/folders-from-disk`)

- `reloadFromDisk` меняет подпись, а единственный её вызывающий — `useVaultWatch.ts`, файл соседней ветки. На этой ветке `npm run check` красный ровно одной ошибкой tsc в нём; зелёный — после мержа `feat/folders-sweep`, где вызов пойдёт как `reloadFromDisk(change)`.
- `state.json` пишут двое — метаданные папок и workspace — и оба читают файл перед записью. Без общей очереди медленная запись возвращает устаревшую копию, поэтому записи в файл сериализованы в `VaultFiles.stateWrite`.
- список папок в `syncCurrentVaultFs` строится **после** флаша заметок: заметка, попавшая на диск, создаёт свой каталог, а список, прочитанный раньше, оставил бы её в папке, которой нет в сайдбаре.
- `readFolders` больше не дописывает «Входящие» в кеш при чтении: существование папки решает каталог, а не читатель. Каталог «Входящие» создаёт `ensureFolderOnDisk` в синке, до чтения списка.
- `isSystem` оставлен: в `src` его читают пять мест, порог задачи был «не больше трёх».

## осталось

- `scripts/folder-source.test.mjs` не добавлен в `test:scripts` в `package.json` — файл не был в списке своих.
- папковая часть `importSyncedVaultData` идёт через `persistFolders(folders, 'remote')` до `reconcileSyncedVault`: если папку переименовали, пока бандл писался, в `state.json` ляжет до-сверочный список, а кеш — сверочный. Это метаданные, следующий скан и следующее действие с папкой их выправят.
- `docs/CODE_MAP.md` не перегенерирован (`npm run map:code`) — новый модуль в карте появится на общей ветке.

