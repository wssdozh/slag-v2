# уход с localStorage целиком

## цель

на релизе нативная сборка не трогает `localStorage` вообще: всё, что переживает перезапуск,
лежит файлами на диске. `localStorage` остаётся внутренним бэкендом браузерной сборки (`npm run
dev`, Playwright e2e) за одним файлом `src/lib/storage/prefsBackend.browser.ts`.

почему: на нативе `localStorage` — это leveldb в профиле webview (`%LOCALAPPDATA%\<id>\EBWebView\
Default\Local Storage` на винде, `app_webview` на андроиде). его можно вычистить снаружи
(обновление WebView, «очистить данные», вытеснение под давлением на диск), он не бэкапится и
привязан к origin. то, что там лежало, — не кэш: реестр хранилищ, ключи, надгробия, черновики.

## правила раскладки (не менять по ходу)

- зависит от хранилища → `vaults/<id>/state.json`, секция.
- зависит от машины/пользователя, но не от хранилища → `AppData/settings.json` через `prefs`.
- строго секрет → secret store (keychain на пк, AES-GCM на вебе/андроиде).
- можно пересобрать сканом диска → **только память**, не писать никуда.
- одна дверь на файл: `state.json` пишется только через `readStateObject` + `queueStateWrite`
  (`readStateSection` / `writeStateSection`), `settings.json` — только через `prefs`.

## волны

1. **сделано** (в `main`): реестр хранилищ досканирует `vaults/` (union, ничего не удаляет);
   ключи провайдеров ИИ из `slag_ai_settings_v2` в secret store + фоллбэк `os → local`;
   надгробия синка из localStorage в `state.json.sync`; фундамент `prefs` + тест-трещотка.
2. **осталось**: префы вызывающих (`useAppearance`, ширины, док, мобильные табы, календарь,
   канал обновлений, окна) → `prefs`; `settingsStore` (черновики композера и полноэкранника,
   история чата, память ассистента, workspace state) → `state.json`; конфиг синка
   (`deviceId`, `serverUrl`, комнаты), курсор, отправленные хеши, очередь → `state.json.sync`;
   индекс заметок и метаданные вложений → память.
3. **остатки**: `readJson` (заменяется `getPrefJson`), `compactLocalStorage` в `vaultFiles`,
   панель «использование localStorage» в логах и кольцо в настройках (считать диск),
   `MODE_KEY` в secret store (режим определяется пробой, а не маркером), baseline трещотки в ноль.

## гейт: источники правды не должны спорить

проверяется **до** валидации, списком. на каждый пункт — один владелец, один писатель, один
читатель-путь.

| что | сейчас | после ухода | правило |
|---|---|---|---|
| содержимое заметок | `.md` на диске | без изменений | единственный источник |
| существование папки | каталог + `slag_folders_` + `state.json.folders` | каталог решает, `state.json` одевает | третьего мнения нет |
| индекс заметок | `slag_items_` (localStorage) | память | пересобирается сканом |
| workspace state | `slag_workspace_state_` **и** `state.json.workspace` | `state.json.workspace` | сейчас два писателя дают разный ответ после вайпа — главный дубль |
| реестр хранилищ | `slag_vaults_v2` | `settings.json` + скан `vaults/` | скан только добавляет, удаление — явный поток |
| конфиг синка | `slag_sync_<id>` | `state.json.sync.config` | сид-фраза — только в secret store, поле `seedPhrase` не возвращается |
| надгробия | localStorage | `state.json.sync.tombstones` | сделано |
| ключи ИИ | `slag_ai_settings_v2` plaintext | secret store | в настройках только `id`/`label`/`baseUrl` |
| черновики | localStorage | `state.json.drafts` | не кэш, а несохранённый текст |
| память ассистента и чат | localStorage | `state.json.chat` / `state.json.memory` | одна секция на вещь |
| корзина | `.trash/` | без изменений | localStorage там нет, мёртвый `TRASH_PREFIX` удалить |
| настройки бэкапа | `slag_backup_settings_v2` | `settings.json` | — |
| сессия админки, хлебные крошки | `sessionStorage` | без изменений | сессионное состояние, не источник правды |

проверка на практике: у каждого файла-хранилища — один писатель (grep по `writeStateSection`,
`setPref`, `setSecret`), и никакой читатель не берёт те же данные из второго места.

## валидация на двух машинах

### пк (windows)

1. `npm run check`, `npm run test:scripts`, `npm run build`.
2. `PLAYWRIGHT_WORKERS=1 npx playwright test` — синк-спеки первыми, они чувствительны к нагрузке.
3. `npm run build:desktop:fast` (закрыть запущенный `slag-v2.exe`), затем живьём:
   - в `vaults/` лежит каталог, которого нет в реестре → появляется в переключателе без перезапуска;
   - AI-ключ переживает перезапуск, в `slag_ai_settings_v2` его нет;
   - `state.json` после работы — валидный JSON, `folders`/`workspace` на месте, `sync.tombstones` на месте;
   - `settings.json` появляется в AppData и в нём префы.
4. **доказательство «ноль localStorage»**: засечь mtime файлов
   `%LOCALAPPDATA%\com.slag.notes\EBWebView\Default\Local Storage\leveldb\*`, поработать
   (открыть заметку, подвигать панель, сохранить настройки), закрыть — mtime не должен измениться.

### ноут (linux, `ssh laptop`)

зачем: windows регистронезависим и переваривает `\` в путях, linux — нет. заодно второй webview
(webkitgtk) и другой путь профиля, то есть независимая проверка, что native не пишет localStorage.

1. `git clone` (или `git fetch` в `~/dsh-work/slag-v2`) с origin, `npm ci`.
2. `npm run check`, `npm run test:scripts`, `npm run build` — здесь ловятся импорты с неверным
   регистром и виндовые разделители.
3. `PLAYWRIGHT_WORKERS=1 npx playwright test` — браузеры там стоят.
4. если есть `pkg-config --exists webkit2gtk-4.1` — `npm run build:desktop:fast` и живая проверка
   пункта «пк/3»; если нет — сказать вслух, что нативный смоук на линуксе не сделан, и почему.
5. каталог профиля webkitgtk найти по `find ~/.local/share ~/.cache -name '*Local Storage*' -o -name 'localstorage'`
   и так же сверить mtime.

### метрики «стало ли лучше»

| что | до | после |
|---|---|---|
| обращений `localStorage.` в `src/` | 202 в 40 файлах | 1 файл-бэкенд |
| файлов в baseline трещотки | 32 | 0 |
| запись в leveldb за сессию на native | есть | нет (mtime) |
| префы после «очистить данные webview» | теряются | на месте |
| черновик композера после вайпа | теряется | на месте |

## после очистки: ponytail-audit и ponytail-review

только после волны 3, не раньше — иначе режем то, что само уедет. порядок: `ponytail-audit` по
репозиторию (что удалить/заменить stdlib/native), затем `ponytail-review` по диффу волн
(дубляж, легаси, обёртки с одним потребителем). находки — списком, применяются отдельным проходом.

## что оказалось не так

- `useVaults` не имел эффекта, который читает реестр: скан пришлось заводить с нуля, а сам
  `readDir` переносить в `vaultRegistry` — UI-хук не имеет права на `@tauri-apps/*`.
- надгробия писались не в `sendAck`, а в `commitPush`; второй такой же `setItem` был в
  `applyBundle` — без него удаления с других устройств не доезжали до файла.
- `prefs`-бэкенд принимает дельту, а не снапшот: браузерный бэкенд иначе перетирал бы чужие
  ключи `localStorage`, включая фикстуры e2e.
- `localStorage.length` и `localStorage.key(i)` (logger, secretStore, usage) регекс трещотки
  не ловит — это отдельные волны, а не «уже чисто».
