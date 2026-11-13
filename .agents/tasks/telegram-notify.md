# отложенные уведомления в telegram через релей

- **цель**: напоминание задачи приходит в телеграм ровно один раз, даже если приложение закрыто,
  а задача назначена на нескольких человек; связка «аккаунт slag = телеграм-человек» на релее не
  хранится.
- **трогаем**: `relay/server.py` (схема `notify_jobs`/`notify_invites`, `NotifyStore`, `TelegramBot`,
  `/api/notify/invite`, `/api/notify/arm`, `bot_loop`, `notify_delivery_loop`), `relay/DEPLOYMENT.md`,
  `relay/test_notifications.py`, клиент: `src/lib/notify.ts`, `src/context/hooks/useNotifyArm.ts`,
  `src/lib/sync/account.ts`, `src/types/index.ts`, `src/components/Settings/SyncSettingsTab.tsx`,
  `package.json`.
- **не трогаем**: `src-tauri/` (плагин `tauri-plugin-notification` и `notification:default` уже
  стоят), синк-провод (`transport.ts`, `syncEngine.ts`), grants — кросс-аккаунтного шаринга в
  релее нет, фан-аут строится не на нём.
- **готово когда**: `python -m pytest relay/` зелёный; в приложении задача с будущим `reminder`
  при одном маршруте даёт одно сообщение в телеграм (второй arm с тем же `eventKey` — тишина);
  задача без маршрутов даёт только локальный тост; `chat_id` не встречается в дампе `relay.db`;
  `npm run check` и `npm run build` чистые.
- **уже выяснили**:
  - `vault_grants` — только для устройств **своего** аккаунта (`set_vault_grant` сверяет
    `device.account_id == account_id`, `_authorize_vault` — `owner_account_id`), поэтому «несколько
    человек в одном хранилище» на grants не построить; человек = tg-канал, привязанный через
    `/start <code>`.
  - дедюп живёт в первичном ключе `(route_token, event_key)`, отдельного кода дедупликации нет.
  - `notify_invites` — единственная строка, где встречаются `vault_id` и (через погашение) `chat_id`;
    удаляется через час после истечения.
  - бот и релей — один процесс: отдельный сервис ничего не добавляет против дампа, но добавляет
    второй юнит и сетевой хоп. `notify_routes.db` — отдельный файл именно поэтому.
  - один поллер на токен (`409` иначе); dev-релей гоняем без токена.

---

после работы: заполнить здесь, что оказалось не так и что осталось.

## как вышло на самом деле

- **`arm` пришлось трактовать как полный набор получателей.** первого захода («удаляем джобы с
  другим `event_key`») мало: удалённый в настройках получатель сохранял уже поставленную джобу и
  получал одно сообщение. теперь `DELETE ... AND (event_key != ? OR route_token NOT IN (...))`,
  есть тест `test_removing_a_recipient_drops_the_queued_job`.
- **`notify_routes.db` создавался в корне репозитория на тестах** с `--db :memory:`:
  `dirname(abspath(':memory:'))` — это cwd. лечится спец-кейсом в `NotifyStore` и `__init__`.
- **установка пакета — pnpm, не npm**: в репе `pnpm-lock.yaml`, `npm i` падает на
  `EUNSUPPORTEDPROTOCOL workspace:*`.
- **статус маршрута в настройках ушёл в `description`**: `src/components/AGENTS.md` запрещает
  справа значение и контрол одновременно, а справа кнопка «удалить».
- **`LogScope` — закрытый union**, поэтому `'NOTIFY'` пришлось добавить в тип, стили бейджа и
  фильтр `LogViewer`.
- **webhook на боте не стоял**, `getMe` живой, поллер один — релей на сервере поднялся с первого
  раза (`Telegram bot ready: @SlagNoteBot`).

## что осталось

- живой `chat_id` так и не появился: `/start <code>` не нажали ни за 20 минут двух прогонов
  `relay/notify_smoke.py`, поэтому доставка до реального телеграма не подтверждена глазами.
  остальное (гейт плана, инвайт, линковка из апдейта, дедюп, просрочка) закрыто тестами и пробой.
- токен бота засветился в чате при постановке задачи: его надо отозвать в `@BotFather` и положить
  в `/etc/systemd/system/slag-relay.service.d/zz-telegram-notify.conf` новый.
- вне задачи, но видно: `e2e/assistant_memory*`, `e2e/app_guide_tool`, `e2e/accent_color`,
  `e2e/account_sync` падают и без этих правок (проверено через `git stash`).

