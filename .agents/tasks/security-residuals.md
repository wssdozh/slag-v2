# закрыть три остаточные security-находки

- **цель**: seed-фраза, токен аккаунта и private key устройства не лежат в `localStorage` открытым текстом; в tauri есть production CSP и отдельный dev CSP; relay считает лимиты по `X-Forwarded-For` только от доверенного прокси.
- **трогаем**: `src/lib/platform/secretStore.ts`, `src/lib/platform/encryptedLocalStore.ts`, `src/main.tsx`, `src/lib/sync/{syncConfig,accountCrypto,account,devices,syncEngine}.ts`, `src-tauri/src/secure_store.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `relay/server.py`, `relay/test_security.py`, `e2e/security_*`, docs.
- **не трогаем**: формат sync-бандлов, relay-протокол, схему sqlite, мастер-пароль и UX разблокировки. Android-keystore — отдельный follow-up: на Android остаётся шифрованное локальное хранилище с ключом в IndexedDB.
- **готово когда**: `npm run check`, `npm run build`, `python -m unittest test_relay test_security`, `cargo test`, security-e2e и sync-e2e зелёные; после миграции приложение работает, seed восстанавливается после перезапуска; в `localStorage` нет plaintext seed/токена/private key.
- **уже выяснили**:
  - `syncEngine` и `accountClient` создаются на import и читают config/сессию синхронно, поэтому `initSecretStore()` обязан выполниться до динамического импорта `App`.
  - seed лежит внутри `slag_sync_config_v2*`, токен — `slag_account_session_v1`, private key — `slag_account_device_v1:<id>`.
  - desktop keyring можно добавить только для windows/macos/linux; Android-зависимость не тянем, иначе рискуем сборкой.
  - в tauri уже есть `devCsp` в схеме; Vite dev идёт с `http://localhost:5173`, IPC — `ipc:`/`http://ipc.localhost`, вложения — `asset:`/`http://asset.localhost`/`android-fs-content:`.
  - relay за nginx видит один `peername`; `X-Forwarded-For` сейчас не читается, а `pair/claim` ключует неудачи сырым `peername`.

---

после работы допиши: что оказалось не так, как думали, и что осталось.

## после работы

- keyring взяли v4 (v3 уже ушёл вперёд); на Windows Credential Manager реальный round-trip
  проверен unit-тестом `secure_store::tests::round_trips_the_windows_credential_store`.
- `App` пришлось импортировать динамически после `initSecretStore`: иначе `syncEngine`
  и `accountClient` успевают прочитать config/сессию до миграции. `src/demo.tsx` грузит
  AppContext статически, поэтому `getCachedSecret` до boot читает legacy-plaintext только
  на чтение (запись — никогда); playground-тест это подтвердил.
- CSP проверен не только конфиг-тестом: собранный `fast`-бинарник запущен с
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, по CDP снят
  реальный `Content-Security-Policy` header, консоль без CSP-violation, вложения/аудио
  и sync websocket живые.
- на Android нативного keystore нет: там AES-GCM + IndexedDB, app sandbox. это осознанный
  follow-up, если в модель угроз добавят root/backup-извлечение.
- первый холодный Playwright-тест после смены графа зависимостей может не уложиться в
  15 c (`page.goto` платит Vite transform); это не CSP и не секреты, повторный прогон
  и полная пачка это лечат.
- полный `--workers=6`: 341 passed, 1 failed (`quick_shots` timeout, отдельно проходит),
  8 skipped. повторные параллельные прогоны на этой машине иногда роняют сам vite-dev-server;
  targeted security/sync/account-прогоны зелёные.

