# security-audit — slag v2, 2026-11-13

проверка по пяти наборам SecLists: `security-fuzzing`, `security-patterns`,
`security-passwords`, `security-usernames`, `security-payloads`.
аудит только локальный: свой клиент, `relay/`, `src/mcp/`, `src-tauri/`, dev-сервер.
продакшн-relay, чужие аккаунты и внешняя сеть не использовались.

- commit: `aaa489c` + рабочее дерево
- окружение: windows, node 24.20, python 3.12.10, rust 1.99.1
- данных продакшна, реальных ключей и seed в тестах нет; payload-файлы и eicar — только во временных каталогах

## итог

| severity | найдено | закрыто | осталось |
|---|---:|---:|---:|
| critical | 1 | 1 | 0 |
| high | 4 | 4 | 0 |
| medium | 4 | 4 | 0 |
| low | 2 | 2 | 0 |

все подтверждённые находки закрыты кодом и тестами. остаточные риски (android keystore,
`style-src 'unsafe-inline'`, широкий `connect-src`, доступность linux keyring) перечислены
в конце и не являются отдельными дырами.

## findings

### 1. stored xss через `javascript:`/`data:` в markdown — critical, fixed

`src/components/UI/MarkdownRenderer.tsx` использовал `urlTransform={(url) => url}`,
то есть отключал штатную санитизацию react-markdown. заметка, пришедшая из синка,
mcp, импорта или obsidian-файла, могла отрендерить `[x](javascript:...)` в карточке
ленты и в ответе ассистента. клик выполнял js в контексте webview, откуда доступны
`localStorage` (seed, токены) и tauri ipc.

фикс: allowlist `http:`, `https:`, `mailto:`, `wiki:` и относительных ссылок;
`javascript:`, `data:`, `vbscript:`, `file:` и control-char-обходы отбрасываются.
wiki-ссылки и обычные ссылки продолжают работать.
тест: `e2e/security_hardening.spec.ts` — проверяет href-ы, клик и `window.__xss`.

### 2. mcp: запись за пределы vault — high, fixed

`src/mcp/vault.ts` склеивал `folderPath`/`targetFolder` с `notesDir` без проверки.
`save_note { folder: "../../escape" }` или `create_folder { path: "/tmp/escape" }`
создавали каталог/файл вне хранилища. это особенно опасно потому, что mcp — это
инструмент для ии-агента, а содержимое заметок может подсунуть аргумент.

фикс: `src/lib/vault/safePath.ts` (`safeVaultRelativePath`) + проверки в
`createFolder`, `saveNote`, `getFolders`. отклоняются `..`, `.`, absolute, drive,
unc, nul/control, `:`/`?`/`*`, reserved-имена windows, хвостовые точка/пробел,
сегменты >120 и путь >240.
тест: `e2e/mcp_security.spec.ts` — traversal, absolute, nul, 300-символьный folder,
плюс легитимная вложенная папка.

### 3. tauri `open_in_folder`: path traversal — high, fixed

`src-tauri/src/lib.rs` резал ведущие слэши, но пропускал `..`; команда создавала
каталоги и открывала explorer вне appdata. теперь `resolve_open_target` разрешает
только normal-компоненты, запрещает absolute/drive/unc/`~`/nul/control, а после
`create_dir_all` канонизирует путь и требует `starts_with(canonical_base)` —
это же закрывает symlink-выход из appdata.
тесты: 5 unit-тестов в `src-tauri/src/lib.rs`, `cargo test`.

### 4. импорт backup/json и frontmatter: путь из данных — high, fixed

`importVaultFromJson`/`restoreFromZip` сохраняли `folder`/`filename`/`id` из
манифеста без проверки, а `flushItemToDisk` доверял `item.folder`. плюс
`parseMarkdownToItem` брал `folder`/`id` из yaml frontmatter как есть: подсунутый
`.md` с `folder: ../../..` уводил следующую запись за пределы vault.

фикс: `safeVaultRelativePath` в `importVaultData`, `importSyncedVaultData`,
`flushItemToDisk`, `removeItemFromDisk`, `removeFolderFromDisk`;
`parseMarkdownToItem` отбрасывает небезопасные `folder`/`id` и падает обратно на
папку/имя файла; `getSafeNoteFilename` чистит control-символы, reserved-имена
(`CON`, `NUL`, `COM1`), хвостовые точки/пробелы и режет до 60 символов;
`AttachmentStore` не выпускает `..`/absolute basename из `.attachments/`.
тест: `e2e/security_hardening.spec.ts` — импорт malicious json отклоняется целиком,
валидный проходит; отдельно проверяются имена.

### 5. seed-фраза и private key устройства в `localStorage` — high, fixed

`src/lib/sync/syncConfig.ts` держал `seedPhrase` в конфиге, `accountCrypto.ts` — private key
устройства, `account.ts` — токен сессии открытым json в `localStorage`. при xss (п.1) всё
это уезжало вместе с ним.

фикс:
- `src/lib/platform/secretStore.ts` — единый асинхронный слой; ключи `vault-seed:<id>`,
  `device-key:<id>`, `account-session`.
- desktop tauri: команды `secret_get/set/delete` в `src-tauri/src/secure_store.rs` через
  crate `keyring` (Windows Credential Manager, macOS Keychain, Linux Secret Service).
- web/android fallback: `src/lib/platform/encryptedLocalStore.ts` — AES-GCM-256, ключ
  non-extractable в IndexedDB, шифртекст в `slag_secure_v1:*`.
- `src/main.tsx` ждёт `initSecretStore()` и только потом импортирует `App`; старые
  значения мигрируются, plaintext удаляется после успешной записи. если keyring был
  выбран, а потом пропал — boot-экран с retry, а не тихий откат.
- `saveConfig` больше не сериализует `seedPhrase`; существующий vault без ключа
  блокирует sync с явной ошибкой, а не генерирует новый seed.
тесты: `e2e/security_secrets.spec.ts` (миграция, идемпотентность, отсутствие plaintext,
запись нового seed) + unit-тест валидации ключа в rust.

### 6. dev-сервер: open-folder traversal + `host: true` — medium, fixed

`vite.config.ts` принимал `target=../../..`, создавал каталог и открывал explorer;
сервер слушал все интерфейсы. теперь target — только `notes`/`logs`/`backups` или
безопасный vault-relative путь, а `host` по умолчанию `127.0.0.1`
(`SLAG_DEV_HOST=0.0.0.0` — только осознанно, для телефона).
тест: `e2e/security_hardening.spec.ts` — endpoint отдаёт 500 и не создаёт каталог.

### 7. relay static: prefix bypass — medium, fixed

`relay/server.py` проверял `str(target).startswith(str(static_dir))`, поэтому
соседний каталог `dist_evil` с тем же префиксом проходил. заменено на
`Path.relative_to`.
тест: `relay/test_security.py::test_static_files_do_not_escape_the_root`.

### 8. relay: анонимные пишущие endpoint'ы без лимитов — medium, fixed

`/api/auth/challenge`, `/api/pair/create`, `/api/telemetry/event` создавали строки
в sqlite без ограничений; `failed_claim_attempts` рос по ip и не чистился.
добавлен bounded sliding-window (`60/мин` challenge, `30/мин` pair create,
`120/мин` telemetry, `429 too_many_requests`), prune в cleanup-loop, чистка
пустых ключей pairing claim. `pair/claim` сохранил свой строгий лимит 5/5 мин.
тесты: 4 теста в `relay/test_security.py`.

### 9. нет csp в tauri — medium, fixed

`src-tauri/tauri.conf.json` содержал `"csp": null`. теперь:
- production `csp`: `script-src 'self'` без `unsafe-inline`/`unsafe-eval`, `object-src
  'none'`, `frame-src 'none'`, `base-uri 'self'`, `form-action 'none'`;
- `style-src 'self' 'unsafe-inline'` — вынужденно из-за React `style=` и CodeMirror;
- `connect-src` включает `ipc:`/`http://ipc.localhost`, `https:`/`wss:` и `http:`/`ws:`
  для self-hosted relay; `img-src`/`media-src` — `asset:`, `http://asset.localhost`,
  `android-fs-content:`, `data:`, `blob:`;
- отдельный `devCsp` разрешает Vite HMR (`localhost:5173`, `ws://`, `unsafe-eval`) и не
  ослабляет production.
тест: `e2e/security_csp.spec.ts` проверяет директивы; ручной smoke — в отчёте о проверках.

### 10. relay rate-limit за прокси — low, fixed

лимиты и pairing claim считались по `peername`; за nginx все клиенты делят один ip.
теперь `SLAG_TRUSTED_PROXIES`/`--trusted-proxies` задаёт IP/CIDR доверенных прокси,
`_client_ip(writer, headers)` идёт по `X-Forwarded-For` справа налево, пропускает
доверенные хопы и берёт первый недоверенный. от недоверенного peer заголовок
игнорируется полностью; `pair/claim` ключует неудачи тем же адресом.
тесты: 5 тестов в `relay/test_security.py` (spoof, rightmost, отдельные buckets,
garbage header, invalid config). nginx-настройка — в `relay/DEPLOYMENT.md`.

### 11. прочее — low/info

- `X-Content-Type-Options: nosniff` и `Referrer-Policy: no-referrer` добавлены в
  ответы relay; `Access-Control-Allow-Origin: *` оставлен: куки не используются,
  токен идёт в `Authorization`, а админка живёт на отдельном origin.
- `SLAG_ADMIN_TOKEN` без значения отключает админ-api (`403 admin_not_configured`);
  `compare_digest` используется. слабые пароли из топ-листов не проходят.
- pin — 6 цифр, `secrets.randbelow`, ttl 300 c, 5 попыток/5 мин, успешный claim
  чистит счётчик; полный перебор в пределах ttl нереален.
- account id — `acc_` + 24 hex от sha256 публичного ключа; username-перебор
  не даёт входа, ошибки не различают существующий/несуществующий аккаунт.
- sql везде параметризован; payload'ы `quick-SQLi`, `special-chars`,
  `command-injection-commix` не меняют состояние и не дают 500.
- захардкоженных ключей в трекаемых файлах не найдено: только тестовые
  `sk-kie-test-argon-token`, `test-token`, `secret-admin-token`. `.env`-файлов нет.
- `logRedaction` маскирует `gsk_`, `AIza`, `sk-`, bearer, `key=` и поля
  `key/secret/token/password/authorization`; seed-фразу как 12/24 слова не
  распознаёт. прямых логов seed в коде не найдено, но это стоит закрыть отдельно.

## проверено и чисто

- sql-инъекции в `accountId`, `device.name`, `vault.name`, `eventType`,
  `bundleId`, `roomId` — параметризовано, состояние не меняется.
- path traversal в админ-путях, static, mcp, backup, tauri — закрыт.
- xss через markdown-ссылки и wiki-ссылки — закрыт, wiki продолжает работать.
- admin token: точное сравнение, пустой/слабый/чужой токен → 401/403.
- pairing claim: 5 неудач → 429, успешный claim сбрасывает счётчик.
- account/device enumeration: формат `acc_` и одинаковые ответы.
- relay malformed json/types: 4xx без traceback и без обрыва соединения.
- mcp: traversal/absolute/nul/overlong folder не создают файлов вне vault.
- tauri: `..`, absolute, drive, unc, `~`, nul, control — отказ; symlink-выход
  за appdata отсекается канонизацией.
- dev open-folder: traversal → 500, каталог не создаётся.

## тесты и результаты

```powershell
# relay: 55 tests, OK (20.7s)
cd relay; python -m unittest test_relay test_security

# rust: 7 tests, OK (5 open_in_folder + 2 secure_store)
cargo test --manifest-path src-tauri/Cargo.toml

# security-спеки: 12 tests, OK
npx playwright test e2e/security_hardening.spec.ts e2e/mcp_security.spec.ts e2e/security_secrets.spec.ts e2e/security_csp.spec.ts --workers=1

# типы/линт: 0 warnings, 0 errors
npm run check

# сборка: web + mcp, OK
npm run build
```

скриншот прогона xss-теста: `test-results/screenshots/security_markdown_links.png`
(заметка с `js`/`mixed`/`data`/`ok` и wiki-ссылкой; опасные схемы не кликаются).

desktop smoke: собран `npm run build:desktop:fast`; бинарник запущен с
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, по CDP снят
реальный `Content-Security-Policy` header (production, script-src с tauri-хешами,
без `unsafe-inline`/`unsafe-eval`), консоль без CSP-violation, вложения/аудио
загрузились, sync websocket подключился. `slag_secret_mode=os`; seed, session и
device key найдены в Windows Credential Manager (`com.slag.notes`), в `localStorage`
их нет.

полный `npx playwright test --workers=6`: **341 passed, 1 failed, 8 skipped** (7.1 min).
единственное падение — `quick_shots.spec.ts` («mobile settings shots»), таймаут 180 c
под нагрузкой; отдельно `--workers=1` проходит. при повторных параллельных прогонах
на этой машине иногда отваливается сам vite-dev-сервер (connection refused у десятков
тестов сразу) — это окружение, а не логика: те же спеки по отдельности и в targeted
прогонах зелёные. `security_*` спеки и все sync/account-спеки проходят.

`npm run build:android` не выполнен: в окружении нет java (`JAVA_HOME` не задан,
android studio jbr отсутствует). изменения rust — desktop-only (`keyring` под
`cfg(windows|macos|linux)`), но сборку apk всё равно нужно повторить на машине с
android sdk/java.

## что не проверяли

- продакшн-relay и официальный домен: только локальный инстанс с temp sqlite.
- реальные аккаунты, seed, токены и чужие vault'ы.
- android-устройство: сборка apk не поднялась без java, `adb` не использовался.
- внешние провайдеры (kie/groq) кроме существующих fake-upstream тестов.
- полноценный penetration test сети, tls-конфигурация nginx и dns.
- криптографический аудит `@noble/curves` и webcrypto: использованы штатные
  примитивы, но отдельного review нет.

## остаточные риски

1. android: seed/private key шифруются в IndexedDB, но не в Android Keystore. app sandbox
   закрывает другие приложения; нативный Keystore — follow-up, если в модели угроз есть
   root/backup-извлечение.
2. linux keyring зависит от разблокированного Secret Service. если режим `os` уже выбран,
   приложение показывает boot-ошибку с retry, а не теряет ключи.
3. CSP: `style-src 'unsafe-inline'` нужен React/CodeMirror, `connect-src` широкий ради
   self-hosted relay. `script-src 'self'` — основная линия защиты.
4. android build + устройство — повторить на машине с java/android sdk.
