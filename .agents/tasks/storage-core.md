# индекс, папки и реестр уезжают из localStorage

- **цель**: `slag_items_*`, `slag_attachments_*` и `slag_folders_*` больше не пишутся в
  `localStorage`; индекс заметок живёт в памяти и пересобирается сканом диска, список папок —
  память + дефолты, реестр хранилищ (`slag_vaults_v2`, `slag_current_vault_v2`) — в `prefs`
  (`settings.json`). `compactLocalStorage` удалена.
- **трогаем**: `src/lib/storage/index.ts`, `src/lib/storage/folderStore.ts`,
  `src/lib/storage/vaultRegistry.ts`, `src/lib/storage/vaultFiles.ts`; новый чистый модуль
  `src/lib/storage/vaultRegistryModel.ts`; `scripts/vault-registry.test.mjs`.
- **не трогаем**: `package.json`, `docs/CODE_MAP.md`, `scripts/no-localstorage.test.mjs`
  (файлы оркестратора), `secretStore` (читает те же ключи реестра из prefs), `state.json`
  (кроме удаления `compactLocalStorage`), `trashStore`/`settingsStore`/`vaultTransfer`
  (их волны ещё не наступили), остальные worktree.
- **готово когда**: в четырёх файлах нет `localStorage.`; `node --test
  scripts/vault-registry.test.mjs scripts/vault-discovery.test.mjs` зелёный; `npm run check`
  — `0 warnings and 0 errors`.
- **уже выяснили**: `prefs` в браузере — тот же `localStorage` за одним бэкендом
  (`prefsBackend.browser.ts`), поэтому ключи `STORAGE_KEYS.VAULTS`/`CURRENT_VAULT` не
  переименовываются: e2e-фикстуры кладут их до загрузки и `initPrefs()` их подхватывает.
  `attachments.ts` в `localStorage` не пишет вовсе — `slag_attachments_*` остался только
  легаси-мусором, который вычищала `compactLocalStorage`. `folderSource.ts` уже решает
  «диск — существование, `state.json` — одежда»; от folderStore остаётся только память.

---

## что оказалось не так

- `cacheItems` — общая дверь не только для индекса заметок, но и для корзины
  (`trashStore` кладёт `slag_trash_<id>` тем же вызовом). Память заменила localStorage и
  там; чтение `.trash/` с диска — отдельная волна, до неё корзина после перезагрузки пуста.
  Файл `trashStore.ts` в моём списке не значился, поэтому менять его не стал.
- `VaultImportIo.foldersKey()` требует строку, а `importVaultPayload` пишет по ней папки в
  `localStorage`. `vaultTransfer.ts` трогать нельзя, поэтому папки вынимаются из payload в
  `importVaultData` и идут через `persistFolders`; `foldersKey` остаётся мёртвым именем ключа.
- e2e-фикстуры массово сидят заметки через `localStorage.setItem('slag_items_*')` и читают их
  оттуда же (`e2e/slag/*.spec.ts`, `multimedia_enrichment`, `security_hardening`, …). После
  перевода индекса в память эти спеки увидят пустое хранилище: их надо переводить на
  `window.storage`/импорт, это не входило в мои файлы.
- Чтобы проверить модель реестра под plain node, пришлось вынести её в
  `vaultRegistryModel.ts`: `vaultRegistry.ts` тянет `@tauri-apps/*` и extensionless-импорты,
  и `node --test` его не грузит. Чистого места в четырёх разрешённых файлах не было.
- `initDefaultsIfNeeded` удалён целиком, а не только сеяние заметок: после переезда папок в
  память у него не осталось работы, а его вызов из `switchVault` только сеял бы дефолты
  поверх скана.
