# конфиг синка и книги из localStorage в state.json.sync

- **цель**: конфиг синка, курсор, отправленные хеши, известные id, очередь и метки черновиков
  переживают вычистку профиля webview: на десктопе они лежат в `vaults/<id>/state.json`, секция
  `sync`, а не в `localStorage`. Сид-фраза в файл не попадает никогда и приходит в `loadConfig`
  параметром из secret store.
- **трогаем**: `src/lib/sync/syncConfig.ts` (конфиг), `localBookkeeping.ts` (дверь в секцию,
  гидрирование, миграция), `syncSection.ts` (форма секции, чистая), `outbox/outbox.ts`,
  `pushBundle.ts`, `applyBundle.ts`, `syncEngine.ts` (гидрирование в `init`, сид из `getSecret`),
  `scripts/sync-state.test.mjs`.
- **не трогаем**: `tombstones.ts` (`loadTombstones`/`saveTombstones` работают как работали),
  `secretStore.ts`, `storage/vaultFiles.ts` (`readStateSection`/`writeStateSection` — единственная
  дверь), `package.json`, `docs/CODE_MAP.md`, `scripts/no-localstorage.test.mjs`, e2e-спеки.
- **готово когда**: `node --test scripts/sync-state.test.mjs` зелёный; `npm run check` — две строки,
  `0 warnings and 0 errors`; `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/sync_` зелёный.
- **уже выяснили**:
  - `state.json` пишется очередью `vaultFiles.queueStateWrite`, `writeStateSection` мержит на
    верхнем уровне → каждый писатель несёт только свои ключи.
  - `writeStateSection` **никогда не отклоняется**: она сама ловит ошибку и логирует. Значит
    «файл принял патч» доказывается только чтением назад — это делает `writeSyncSectionVerified`.
  - `isTauri() === false` на вебе, в Playwright и в headless-ноде. Там секции нет, и всё, что
    зависит от неё, должно падать обратно на прежнее хранилище.
  - `getCachedSecret` не годится для `loadConfig`: `knownVaultIds()` сканирует localStorage, а
    реестр оттуда уезжает (другая ветка).

---

## что оказалось не так

- **`prefs` не подошла на роль «веб-сборки без диска»**. Три синк-спека (`sync_init_race`,
  `sync_delete`, `sync_push_transport`) кладут и читают `slag_sync_*` в `localStorage`
  **синхронно** в том же тике, а `setPref` доезжает до бэкенда через промис. Хуже: headless-нода
  (`src/node/index.ts`) не вызывает `initPrefs()` вообще, а `src/node/cli.ts` читает
  `getConfig().seedPhrase` и `getConfig().deviceId` **до** `init()` — на пустой карте prefs это
  каждый раз новое устройство и «нет ключа хранилища» на `slag-node run`. Поэтому фоллбэк остался
  сырым `localStorage`, но за пятью функциями в `localBookkeeping.ts`: `readFallbackJson`,
  `writeFallbackJson`, `readFallbackText`, `writeFallbackText`, `removeFallbackKey` плюс одно
  чтение старых ключей в миграции. Пять из шести файлов чисты, `localBookkeeping.ts` остаётся в
  baseline трещотки — это и должно покраснеть вторым тестом, список сокращает оркестратор.
- **Метка initial sync переехала за функцию, но не в файл.** `e2e/initial_sync_engine.spec.ts`
  синхронно проверяет `localStorage.getItem('slag_initial_sync_<vault>') === 'pending'` — включая
  «после перезапуска движка». Спека вне зоны этой задачи, поэтому метка осталась на прежнем ключе,
  но `syncEngine.ts` больше не называет `localStorage`: за неё отвечают `isInitialSyncPending` /
  `setInitialSyncPending` (в секцию они пишут, когда она гидрирована).
- **Сид нельзя вызвать в конструкторе.** Движок создаётся на импорте модуля, задолго до того, как
  можно дождаться keychain. Конструктор передаёт `getCachedSecret(...)` явным параметром (нода без
  этого не работает — см. выше), а `init`/`switchVault` — `await getSecret(...)`. Из `loadConfig`
  убрано и чтение кеша, и **создание** сида: при холодном кеше оно бы записало новый сид поверх
  настоящего. Создание переехало в `hydrateConfig` — единственное место, где сид рождается, и оно
  сначала пишет в secret store, потом в конфиг.
- **`writeStateSection` глотает ошибки**, поэтому «сначала файл, потом удалить ключ» на одном
  `await` не построить: после записи секция читается назад и сравнивается, и только затем старый
  ключ удаляется. При неудаче ключ остаётся, следующий запуск повторит.
- **Пришлось добавить седьмой файл** `src/lib/sync/syncSection.ts`. Форма секции должна быть
  чистой, чтобы `node --test` читал её как есть (так же, как `tombstones.ts`), и чтобы
  `localBookkeeping.ts` не вырос с 220 до 869 строк. Без этого тесту пришлось бы тащить хук
  разрешения модулей. `localBookkeeping.ts` (571 строка) остался дверью: ключи, фоллбэк,
  гидрирование, очередь записи, аксессоры.
- **Один полный пуш после апгрейда на self-hosted комнате.** Старый чекпоинт состояния
  (`slag_sync_last_state_hash_<vault>`, без комнаты) мигрирует в комнату `local`, а читается по
  `room_<...>`; ключ на комнату — кэш, потеря стоит трафика, а не данных. Аккаунтные комнаты
  (`<vault>_<room>`) мигрируют точно.
- **`getVaultSeedPhrase` для чужого хранилища всё ещё смотрит в `getCachedSecret`**: он синхронный
  (`vaultSharing`, `useDevicePairing`), а `getSecret` — нет. Это follow-up к той ветке, что увозит
  реестр хранилищ из localStorage: вместе с реестром уйдёт и `preload` чужих сидов.

## что осталось

- Абзац про `prefs`-бэкенд: когда `src/node/index.ts` начнёт `initPrefs()`, фоллбэк в
  `localBookkeeping.ts` можно свести к `prefs` и вычеркнуть файл из baseline трещотки.
- Метка initial sync ждёт, пока `e2e/initial_sync_engine.spec.ts` перестанет читать ключ напрямую.
