# папки — производные от диска, а не список в localStorage

- **цель**: папка существует ⇔ её каталог лежит в `notes/`. `state.json` хранит только метаданные по пути (name/description/icon/kanbanColumns/showReferenceColumn), кеш в localStorage перестаёт быть источником истины (остаётся для мгновенной отрисовки и для браузерного режима, где fs нет). созданная снаружи папка (mcp `create_folder`, другое устройство) появляется в интерфейсе без перезапуска, и запись из приложения больше не затирает её в `state.json`.
- **трогаем**: `src/lib/storage/folderSource.ts` (новый, чистый), `src/lib/storage/folderStore.ts`, `src/lib/storage/vaultFiles.ts`, `src/lib/storage/index.ts`, `src/config` (сид), `src/types/index.ts` (`isSystem`), `src/lib/storage/vaultWatch.ts` + `vaultWatchDiff.ts` + `src/context/hooks/useVaultWatch.ts`, `scripts/folder-source.test.mjs` + `scripts/vault-watch.test.mjs`.
- **не трогаем**: синк-протокол и релей, `src/components/**`, css, mcp-инструменты (он уже читает диск), `src-tauri`.
- **готово когда**: `npm run check` → `0 warnings and 0 errors`, `npm run build`, `npm run test:scripts` зелёные; в `npm run dev` создание/переименование/удаление папки работает; созданная через mcp папка появляется без перезапуска.
- **уже выяснили**: папки сегодня живут в трёх местах сразу — localStorage (`readFolders`), `state.json` (импорт только в `syncCurrentVaultFs`), каталоги на диске. писателей тоже четыре: `writeFolder`/`describeFolder`/`eraseFolder`/`renameFolderTree`, папковая часть `importSyncedVaultData`, импорт при старте, mcp `writeState`. `flushStateToDisk` пишет объект целиком из localStorage — поэтому действие с папкой в приложении стирает запись, сделанную mcp. mcp при этом уже дисковый: его `getFolders()` досоздаёт папки, найденные на диске.

---

после работы допиши: что оказалось не так, как думали, и что осталось.
