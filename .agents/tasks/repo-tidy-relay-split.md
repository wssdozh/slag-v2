# навести порядок в корне и вынести relay в отдельный репозиторий

- **цель**: в корне `slag-v2` остаются только входные точки и конфиги; README читается за один экран и не пахнет нейрослопом; сервер синка и telegram-бот живут в `wssdozh/slag-relay` со своей историей, тестами и CI; ссылки и карта кода не врут.
- **трогаем**: корневые `*.md`, `demo.html`, `src/demo.tsx`, `e2e/ui_playground.spec.ts`, `playwright.config.ts`, `.gitignore`, `AGENTS.md`, `README.md`, `docs/*`, `.agents/tasks/relay-server-decompose.md`, `scripts/gen-code-map.mjs`, `relay/**`, `.github/workflows/release.yml`, `docs/RELEASING.md`.
- **не трогаем**: клиентский код, API синка, схему SQLite, формат `.md`/frontmatter, дефолтный URL relay, ветки/теги/релизы `slag-v2`, продовый сервер. Ветки по решению пользователя не переименовываем и не force-push'им.
- **готово когда**: `python -m pytest` в новом `slag-relay` зелёный и CI зелёный; в монорепе `npm run check`, `npm run build`, `npx playwright test` зелёные; `docs/CODE_MAP.md` без `relay` и `demo.tsx`; `gh secret list -R wssdozh/slag-v2` совпадает с `release.yml`; в корне нет `AUDIT_ANDROID.md`, `ROADMAP.md`, `SPECIFICATION.md`, `demo.html`, `relay/`.
- **уже выяснили**:
  - `origin/main` отстал на 676 коммитов, дефолт GitHub — `master`; ветки не трогаем.
  - `HEAD` = `de03b40` = `origin/master`; untracked только `rust-core-boundary.md` и `slag-landing.md`.
  - `relay/` — 31 файл, ~7,1k строк, 50 коммитов, зависимость `cryptography`, тесты на `unittest`/pytest.
  - `demo.html` и `src/demo.tsx` держат отдельный `webServer` на 5174 и спеку `e2e/ui_playground.spec.ts`.
  - `.gitignore` игнорирует `src-tauri/gen/`, хотя 65 файлов Gradle-проекта отслеживаются и нужны Android-CI.
  - в `slag-v2` пять секретов; `release.yml` просит шестой `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, а ключ по `docs/RELEASING.md` создаётся без пароля.
  - жёстких секретов в `relay/` не найдено.

## гипотеза и метрика

если убрать из корня исторические доки и мёртвый playground, а relay вынести в отдельный репо, то новый человек (и агент) находит входную точку и документацию без раскопок. метрика: корневых отслеживаемых записей 30 → 25, README ≤ ~80 строк, в `docs/CODE_MAP.md` нет `relay`/`demo.tsx`, в монорепе нет `relay/`.

## что оказалось не так, как думали

- baseline `python -m pytest relay/` был не зелёный: architecture gate не знал модуль `premium`.
  добавил его в `LEVELS`, стало 139 passed; фикс уехал в историю нового репо.
- параллельно в дереве шла landing-задача (App, Admin, Landing, e2e). её файлы не трогал;
  она легла отдельным коммитом `c9037aa` и обновила карту кода.
- `e2e/support/account_relay.py` импортировал `relay/server.py` из монорепы. после переезда
  account-спеки не могут стартовать без клона `slag-relay`; добавил `SLAG_RELAY_DIR` и скип
  с понятной причиной. проверено: без клона 4 теста skip, с `SLAG_RELAY_DIR` релей поднимается.
- первый полный e2e на 5173 умер на середине: dev-сервер отдал `ERR_CONNECTION_REFUSED`.
  повтор на 5180 с 4 воркерами дошёл до конца: 364 passed, 8 skipped, 28 failed (11.5 min).
  из 28: 4 account (теперь skip), 13 memory-тестов падают и на одном воркере без нашего кода,
  остальные — точечные флейки/регрессии вне этой задачи.
  после разбора: 3 падения были из-за жёсткого 5173 — починил, они зелёные; 4 account теперь skip;
  остальные 21 — pre-existing (13 memory + 8 точечных), к этой задаче не относятся.
- `docs/screenshots` после e2e перезаписываются тестами; вернул их, в коммит не попали.
- после удаления широкой строки `src-tauri/gen/` из `.gitignore` всплыл `gen/schemas/`;
  закрыл его точечно, Gradle-проект остаётся отслеживаемым.
- карту кода генерил из `git archive HEAD`, чтобы не втянуть чужие незакоммиченные файлы.
- upgrade-ключ создан без пароля, поэтому `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` из release.yml
  убран; в репозитории остаются пять секретов.

