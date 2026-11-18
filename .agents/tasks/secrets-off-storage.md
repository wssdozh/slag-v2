# секреты — с localStorage на файл

- **цель**: на нативном рантайме шифртекст секретов лежит в `<AppData>/secrets.json`, а не в профиле
  webview; маркер режима — в `prefs`; legacy-обходы профиля удалены. На вебе шифртекст остаётся в
  `localStorage` — там это единственное хранилище.
- **трогаем**: `src/lib/platform/secretStore.ts`, `src/lib/platform/encryptedLocalStore.ts`, новый
  `src/lib/platform/secretFileBackend.ts`, `e2e/security_secrets.spec.ts` (он проверял удаляемую
  миграцию).
- **не трогаем**: `package.json`, `docs/CODE_MAP.md`, `scripts/no-localstorage.test.mjs` (файлы
  оркестратора), `src/node/env.ts` и `src/node/stubs/**`, `src-tauri/`, основную копию и другие
  worktree.
- **готово когда**: `npm run check` (две строки, `0 warnings and 0 errors`), `npm run build`
  (четыре шага), `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/security_secrets.spec.ts` и
  `e2e/account_ui.spec.ts` зелёные; в двух файлах секрет-стора нет `localStorage`, кроме одного
  помеченного блока (браузерный бэкенд + одноразовый перенос конвертов на натив).
- **уже выяснили**:
  - `prefs` инициализируется до секрет-стора (`main.tsx`), значит регистр хранилищ
    (`slag_vaults_v2`) и список AI-коннектов читаются синхронно и на старте уже есть;
  - `accountClient` создаётся при импорте `lib/sync/account` и синхронно читает `accountSession`
    из кеша — это единственный читатель, без которого меняется поведение; `main.tsx` и
    `src/node/index.ts` инициализируют стор до импорта синка;
  - `getCachedSecret` ещё зовут `syncConfig.getVaultSeedPhrase` (сид **другого** хранилища, при
    шаринге) и `loadAiSettings` (сид рендера) — им нужен прогрев, асинхронного пути у них нет;
  - ключи устройств (`signDeviceChallenge`) прогревать не нужно: `getOrCreateDeviceIdentity`
    всегда `await getSecret` до подписи, а `renameStoredDevice`/`getDevicePrivateKey` сами ждут
    `getSecret`;
  - e2e `security_secrets.spec.ts` сидирует открытый текст в профиль и проверяет его миграцию в
    конверты — после удаления миграции спека обязана поменяться, иначе она проверяет удалённое
    поведение.

---

## сделано

- `encryptedLocalStore.ts`: AES-GCM и мастер-ключ в IndexedDB остались; шифртекст ушёл за
  интерфейс `SecretEnvelopeStore`. Браузер — профиль (`localStorage`), натив — файл.
- `secretFileBackend.ts`: `<AppData>/secrets.json`, плоская карта `secretKey → {v, iv, data}`,
  запись через `secrets.json.tmp` + `rename`, битый/отсутствующий файл = пусто + `logger.scope('SYNC').warn`.
- одноразовый перенос конвертов из профиля в файл при пустом файле (натив), с удалением
  перенесённых ключей из профиля.
- `secretStore.ts`: маркер `slag_secret_mode` → `prefs`; удалены `collectLegacySecrets`,
  `migrateEncryptedLocalToOs`, `knownVaultIds`/`knownDeviceIds` как обходы профиля,
  `readLegacySecret`, `SecretMigrationError`; `preload` греет только сессию, сиды хранилищ из
  `prefs` и AI-ключи; `migrateAiKeys` переведён на `prefs` (иначе он писал в профиль на нативе).

## что оказалось не так

- `e2e/security_secrets.spec.ts` целиком проверял удаляемую миграцию: сидировал открытый текст в
  профиль и ждал конверты. Без переписывания спеки критерий «зелёные» недостижим, поэтому она
  переписана на новое поведение: профиль не читается как источник секретов, сид, записанный через
  приложение, уходит в конверт и не возвращается в конфиг, перезагрузка его не теряет.
- `migrateAiKeys` в списке на удаление не было, но он тоже читал и писал `localStorage` — на нативе
  это запись в профиль webview. Не удалил: перевёл на `prefs`. Иначе у веб-пользователя, у которого
  ключи провайдеров ещё лежат открытым текстом в `slag_ai_settings_v2`, они бы просто пропали
  (`applyAiKeys` берёт ключ только из стора или из того же plaintext-поля).
- маркер режима оказался не косметикой. Проба отвечает на вопрос «есть ли keychain», а не «где
  лежат ключи»: если один старт прошёл с залоченной связкой ключей (на Linux это обычное дело),
  ключи уехали в шифрованный стор, и следующий старт с рабочей связкой ушёл бы в пустой keychain.
  `migrateEncryptedLocalToOs` удалён, поэтому теперь маркер решает, за каким стором данные: `local`
  держится, пока `settings.json` не сброшен. Без маркера (первый запуск, сброшенные настройки) —
  решает проба, как и было.
- `knownDeviceIds` можно было удалить без прогрева: `signDeviceChallenge` — единственный
  синхронный читатель ключа устройства, и перед ним всегда идёт `getOrCreateDeviceIdentity`,
  которая `await getSecret` либо создаёт ключ. Соседние `renameStoredDevice`/`getDevicePrivateKey`
  тоже сами ждут `getSecret`.
- `hydrateConfig` по-прежнему кует новый сид, если в сторе его нет, — то есть «синк честно
  попросит фразу» срабатывает только когда стор вообще не ответил (`init()` и его ошибка «Ключ
  хранилища недоступен»), а не когда ключа просто нет. Это поведение синка, не стора, и в этой
  задаче не трогалось — но при вайпе стора оно даёт новый сид, а не запрос.
- `scripts/no-localstorage.test.mjs` остаётся с одной протухшей строкой
  (`src/lib/platform/secretStore.ts`): файл оркестратора, не правил. `encryptedLocalStore.ts`
  честно остаётся в baseline — на вебе `localStorage` и есть хранилище шифртекста, плюс там же
  одноразовый перенос конвертов на натив.
- `e2e/account_ui.spec.ts` в этом окружении скипается: без чекаута `wssdozh/slag-relay` спека
  гейтится `relayCheckout()`. С `SLAG_RELAY_DIR` на локальный релей два теста из трёх зелёные, а
  «account cabinet registration…» падает одинаково на базе `cce15f2` и на этой ветке: клик по
  кнопке хранилища в сайдбаре `Account integration vault · <suffix>` не находит элемент 4 минуты.
  К секретам это не относится (кнопку рисует реестр хранилищ), баг был до задачи.

