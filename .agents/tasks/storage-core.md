# индекс, папки и реестр уезжают из localStorage

- **цель**: `slag_items_*`, `slag_attachments_*` и `slag_folders_*` больше не пишутся в
  `localStorage` на native; индекс заметок живёт в памяти и пересобирается сканом диска, корзина —
  снимком `.trash/`, список папок — память + дефолты, реестр хранилищ (`slag_vaults_v2`,
  `slag_current_vault_v2`) — в `prefs` (`settings.json`). `compactLocalStorage` удалена.
  Браузерная сборка без диска — законный случай: у неё localStorage и есть хранилище.
- **трогаем**: `src/lib/storage/index.ts`, `src/lib/storage/folderStore.ts`,
  `src/lib/storage/vaultRegistry.ts`, `src/lib/storage/vaultFiles.ts`, `src/lib/storage/trashStore.ts`;
  новый чистый модуль `src/lib/storage/vaultRegistryModel.ts`; `scripts/vault-registry.test.mjs`.
- **не трогаем**: `package.json`, `docs/CODE_MAP.md`, `scripts/no-localstorage.test.mjs`
  (файлы оркестратора), `secretStore` (читает те же ключи реестра из prefs), `state.json`
  (кроме удаления `compactLocalStorage`), `settingsStore`/`vaultTransfer` (их волны ещё не
  наступили), `src/node/**`, остальные worktree.
- **готово когда**: `npm run check` — `0 warnings and 0 errors`; `node --test
  scripts/vault-registry.test.mjs scripts/vault-discovery.test.mjs` зелёный; `npm run build`
  зелёный целиком; три спеки, сидящие данные в `slag_items_*`, проходят на вебе
  (`storage_usage`, `workspace`, `editor`).
- **уже выяснили**: `prefs` в браузере — тот же `localStorage` за одним бэкендом
  (`prefsBackend.browser.ts`), поэтому ключи `STORAGE_KEYS.VAULTS`/`CURRENT_VAULT` не
  переименовываются: e2e-фикстуры кладут их до загрузки и `initPrefs()` их подхватывает.
  `attachments.ts` в `localStorage` не пишет вовсе — `slag_attachments_*` остался только
  легаси-мусором, который вычищала `compactLocalStorage`. `folderSource.ts` уже решает
  «диск — существование, `state.json` — одежда»; от folderStore остаётся только память.
  Корзина — это файлы `.trash/`, а не ключ; её читает `scanTrashDir`, как заметки `scanNotesDir`.

---

## что оказалось не так

- `cacheItems` — общая дверь не только для индекса заметок, но и для корзины: `trashStore`
  кладёт `slag_trash_<id>` тем же вызовом. После перевода в память корзина после перезагрузки
  стала пустой — это ломало поведение, а не тесты. Починено: `scanTrashDir` в `vaultFiles`
  собирает снимок `.trash/` на старте (и на каждом `syncCurrentVaultFs`), снимок живёт в том же
  `itemsIndex` под ключом корзины, `moveToTrash`/`restoreFromTrash` правят его, native пишет
  файлы. `readTrash` больше не читает localStorage.
- Второй разрыв: без записи в localStorage на вебе ~20 спек находят пустое хранилище. Значит
  `cacheItems` пишет память всегда, а в localStorage — только `!isTauri()`; `readItemsIndex`
  смотрит в память, затем на вебе в localStorage, на native до скана пустой. Один бранч в одном
  месте, native туда не заходит. Без этого e2e не только падали, но и не находили ключ
  `slag_items_*`, в который сами дописывают данные.
- Демо-заметки пришлось вернуть — но только для веба и через `cacheItems` (`seedBrowserVault`).
  e2e ждут онбординг «Добро пожаловать в SLAG» и сидят данные в существующий ключ; на native
  по-прежнему пустая установка и кнопка «сгенерировать демо». Старый `initDefaultsIfNeeded`
  с сеянием папок и записью в localStorage напрямую не вернулся.
- `VaultImportIo.foldersKey()` требует строку, а `importVaultPayload` пишет по ней папки в
  `localStorage`. `vaultTransfer.ts` в этой волне не трогаем, поэтому папки вынимаются из payload
  в `importVaultData` и идут через `persistFolders`; `foldersKey` остаётся мёртвым именем ключа.
- Чтобы проверить модель реестра под plain node, пришлось вынести её в
  `vaultRegistryModel.ts`: `vaultRegistry.ts` тянет `@tauri-apps/*` и extensionless-импорты,
  и `node --test` его не грузит. Чистого места в четырёх разрешённых файлах не было.
- `npm run build` падал на node-шаге из-за отсутствующего `rename` в `src/node/stubs/tauriFs.ts`;
  после `git merge main` (там `fix(node)`) сборка зелёная целиком, править стабы не пришлось.
- Нативный скан `.trash/` живьём не проверялся: tauri-сборку по правилам репозитория локально
  не гоняю (её делает CI), проверка — типы, общий путь `syncCurrentVaultFs` и веб-прогон.

## результат

- `npm run check` — `Found 0 warnings and 0 errors.` / `Finished in 262ms on 611 files`.
- `node --test scripts/vault-registry.test.mjs scripts/vault-discovery.test.mjs` — 11/11.
- `npm run build` — exit 0, app + mcp + node шаги зелёные.
- `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/slag/storage_usage.spec.ts
  e2e/slag/workspace.spec.ts e2e/slag/editor.spec.ts` — 32 passed, 1 skipped (54-я спека
  `test.skip`), 0 failed.
