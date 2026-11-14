# разложить relay/server.py (4136 строк) на доменные модули

- **цель**: правка одной фичи в релее перестаёт требовать чтения файла на 4136 строк: сервер ≤ 500 строк, каждый модуль ≤ 400, граф импортов без циклов и его сторожит тест.
- **трогаем**: `relay/**` (server.py, новые модули, 6 строк в `test_security.py`, новый `test_architecture.py`), `relay/DEPLOYMENT.md`, `docs/CODE_MAP.md` (генерация).
- **не трогаем**: HTTP/WS-контракт, имена env-переменных, схему sqlite, тексты бота, `tg.py` (уже лист), `src/**`, `src-tauri/**`.
- **готово когда**: `python -m pytest relay/` зелёный на каждой фазе (сейчас baseline 122 passed, 22.5 s), `python relay/server.py --help` работает, `/health` и ws-хендшейк живы, `npm run pytest`-эквивалент по доку; в `server.py` ≤ 500 строк.
- **уже выяснили**: см. ниже.

---

## факты (не искать второй раз)

- файл **4136** строк (в `docs/CODE_MAP.md` 3968 — карта отстала на 168 строк, реген после работы).
- 173 функции, 3753 строки в телах. Классы: `RelayDatabase` 71 метод / 999 строк, `SlagRelayServer` 81 метод / 2656, `WebSocketConnection` 4 / 74, `NotifyStore` 6 / 67.
- `SlagRelayServer._route_http` — **1157 строк** и ~56 эндпоинтов в одной цепочке `if`: 28% файла.
- тесты импортируют из `server`: `RelayDatabase`, `SlagRelayServer`, `SESSION_TTL_SECONDS`, `ApiError`, `assistant_card_block`, `render_notification` (ре-экспорт из `tg`), константы `NOTIFY_*`, `ASSISTANT_*`, `TG_*`.
- 6 мест патчат константы через имя модуля: `patch("server.RATE_LIMIT_PAIR_CREATE"…)` и т.п. в `test_security.py` (134–195). Их надо перевесить на новый модуль лимитов — это единственная правка тестов.
- деплой запускает файл напрямую: `ExecStart=… python /opt/slag-relay/server.py`, а `DEPLOYMENT.md:52` копирует **только** `server.py`. Раз модулей станет много — копировать весь `relay/` (док уже это предписывает, стр. 176).
- в `DEPLOYMENT.md:174–178` уже заявлен целевой вид: `relay/tg.py`, `relay/bot.py`, `relay/assistant.py`. `tg.py` из этого списка уже вынесен и служит образцом: лист, без импортов из релея.
- в коде нет `match`, только `from __future__ import annotations` — модули можно резать по любой границе без правки синтаксиса.

## гипотеза и метрика

если разложить файл по границам «лист → хранилище → домен → транспорт → сборка», то цена правки падает: вместо «открыть 4136 строк» — «открыть ≤ 2 модуля по ≤ 400 строк». мерим на трёх типовых правках: (1) новый http-эндпоинт, (2) изменение доставки уведомления, (3) изменение ассистентского флоу. до: 1 файл × 4136 всегда. после: `routes_*.py` (1 файл) + `store/*` при надобности. вторая метрика — max(file lines) по `relay/`: 4136 → ≤ 500; третья — число тестов и время прогона не растут (122 / ~22 s).

**вердикт**: делаем, тремя независимо-зелёными фазами. «урезанно» не годится: половина выигрыша (листья) оставляет `_route_http` на 1157 строк, то есть главную боль.

## ux-путь

не применимо: это бэкенд-рефактор без пользовательских экранов. проверяемый «путь» здесь — путь разработчика: `docs/CODE_MAP.md` → `npm run where` → нужный модуль. после работы карта должна находить `/api/ai/chat` в `relay/routes_ai.py`, а не в 4000-строчном файле.

## PRD

меняется только раскладка файлов, не поведение. механизм — **миксины**: тела функций переезжают в модуль как методы класса-миксина, `SlagRelayServer(Mix…)` собирается в `server.py`. вызовы `self.foo()` и `srv.foo()` в тестах остаются валидными, переписывать call-sites не нужно; поведение = побайтово тот же код.

целевые модули и уровни (импорт разрешён только «вниз»):

| уровень | модуль | из чего | ~строк |
|---|---|---|---|
| 0 | `errors.py` | `ApiError` | 10 |
| 0 | `settings.py` | env/флаги/PLANS/прокси/TTL-константы | 130 |
| 0 | `ratelimit.py` | `RATE_LIMIT_*` + `RateLimiter` | 80 |
| 0 | `wire.py` | `WebSocketConnection`, `decode_bundle_frame`, `WS_GUID` | 130 |
| 0 | `assistant_card.py` | `iso_time`, `hash_token`, `assistant_action_*`, `assistant_card_block`, `assistant_message_html`, `parse_assistant_action` | 160 |
| 0 | `notify_routes.py` | `NotifyStore` | 100 |
| 1 | `store/schema.py` | DDL + `_ensure_column` (249 строк сейчас) | 300 |
| 1 | `store/base.py` | conn, cache bytes, rooms, telemetry, cleanup, max-cache const | 180 |
| 1 | `store/bundles.py` | save/pending/watermarks/acks | 110 |
| 1 | `store/accounts.py` | регистрация, сессии, челленджи, девайсы, audit, ai usage | 200 |
| 1 | `store/pairing.py` | pairing-сессии | 90 |
| 1 | `store/vaults.py` | vaults + grants | 110 |
| 1 | `store/notify.py` | инвайты, джобы, лимиты, delivery-события, assistant_links | 250 |
| 1 | `store/assistant.py` | `assistant_requests` жизненный цикл | 110 |
| 2 | `ai_proxy.py` | kie/groq, `_normalize_ai_model`, дневной лимит | 260 |
| 2 | `delivery.py` | `_arm_notifications`, `_armed_digest`, `_notify_channel_state`, `notify_delivery_loop`, `_deliver_notifications` | 230 |
| 2 | `assistant.py` | `_bot_question`, typing/bubble/stage, `_answer_assistant`, action/drop callbacks, expiry loop, `_pick_device` | 520 |
| 2 | `bot.py` | `bot_loop`, `_handle_bot_update`, `/start`, команды, telegram-обёртки, `_public_base` | 480 |
| 2 | `http_plumbing.py` | `handle_connection/_route_http` вход, ответы, CORS, client ip, bearer | 200 |
| 2 | `routes_admin.py` | `/api/admin/*` | 560 |
| 2 | `routes_auth.py` | `/api/telemetry/event`, `/api/auth/*`, `/api/account*` | 200 |
| 2 | `routes_notify.py` | `/api/notify/*`, `/api/assistant/*`, `/api/vaults*`, `/api/pair/*` | 330 |
| 2 | `routes_sync.py` | `/api/sync/*`, `/n`, статика | 170 |
| 2 | `routes_ai.py` | `/api/ai/chat`, `/api/ai/vision`, `/api/ai/audio` | 220 |
| 3 | `router.py` | упорядоченная таблица маршрутов + диспетчер | 140 |
| 3 | `realtime.py` | ws upgrade, сообщения, ingest bundle, broadcast | 230 |
| 4 | `server.py` | `__init__`, auth-хелперы, валидаторы, подписи, `run`, `main`, ре-экспорты | ~450 |

## фазы (каждая заканчивается зелёным и коммитом)

**A. листья, нулевой риск** — `errors`, `settings`, `ratelimit`, `wire`, `assistant_card`, `notify_routes`, `store/*`. `server.py` 4136 → ~2100. правка тестов: 6 строк `patch("server.RATE_LIMIT_*")` → `patch("ratelimit.RATE_LIMIT_*")`.

**B. телеграм-домен** — `ai_proxy`, `delivery`, `assistant`, `bot`. `server.py` ~2100 → ~950.

**C. транспорт** — `http_plumbing`, `routes_*`, `router`, `realtime`. `server.py` ~950 → ~450. эндпоинты переносятся блоками в исходном порядке: порядок цепочки `if` — часть контракта (prefix-блоки падают сквозь себя).

## acceptance criteria (проверяемые)

1. `python -m pytest relay/` — зелёный после каждой фазы, 122 теста (новые не в счёт), время в пределах 2× baseline.
2. `relay/test_architecture.py` (новый, ~70 строк) и он же — гейт:
   - ни один модуль, кроме `server.py`, не импортирует `server`;
   - импорты идут только на уровень ниже (список разрешённых рёбер зашит в тест);
   - `server.py` ≤ 500 строк, любой другой `relay/*.py` ≤ 450 (кроме `store/schema.py`, у него лимит 320);
   - в таблице маршрутов нет дублей `(method, prefix)`, и в ней ≥ 50 записей;
   - `from server import RelayDatabase, SlagRelayServer, ApiError, assistant_card_block, render_notification, SESSION_TTL_SECONDS, TG_TEXT_LIMIT` работает (фасад цел).
3. `python relay/server.py --help` и бут на свободном порту с `:memory:`: `/health` → 200, `ws://…/ws/room?device=x` → handshake 101 и `ping`→`pong`.
4. `git diff -w` по перенесённым блокам: тела функций совпадают (перенос, не переписывание). ревью — вручную по `git diff -M --stat`/`-w`.
5. `npm run map:code` — карта обновлена, в `relay/` 0 «самых длинных файлов» в топе.

## edge cases

- `store/` — пакет: запуск `python relay/server.py` добавляет `relay/` в `sys.path`, `import store` резолвится. тесты под pytest получают тот же путь. проверить оба запуска, а не только pytest.
- `NotifyStore` открывает второй файл (`notify_routes.db`) — путь считается в `server.__init__`; после переноса он должен остаться тем же (тест: абсолютный путь в tmp).
- `RelayDatabase.DEFAULT_MAX_CACHE_BYTES` читается как `self.db.DEFAULT_MAX_CACHE_BYTES` — остаётся атрибутом класса на `store/base.py`.
- `_route_http` возвращает `None`, когда ответ уже ушёл в writer (страница `/n`, статика); диспетчер обязан сохранить это значение и не пытаться сериализовать.
- `SLAG_STATIC_DIR`/`dist` путь считается от `__file__` — после переноса в `routes_sync.py` корень должен остаться `Path(__file__).parent` самого релея (передать `relay_dir` из `server.py`, не вычислять по новому файлу).
- патчи констант в тестах — единственная разрешённая правка существующих тестов; если всплывёт ещё один `patch("server.*")`, это стоп и вопрос, а не тихая правка.

## что останется

- `docs/CODE_MAP.md` и таблица зон в `AGENTS.md`: строка `relay/` перестаёт быть одним файлом.
- `relay/DEPLOYMENT.md`: копировать `relay/*.py` и `relay/store/`, а не один `server.py`.
- `tg.py` не трогаем: он уже целевой образец.
