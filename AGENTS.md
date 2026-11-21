# AGENTS.md — Кодекс SLAG v2

Стек: **React 19, TypeScript, Tailwind CSS v4, Tauri v2 (Desktop & Android), Orama BM25, Playwright, Vite**.

Источник правды — этот файл и два файла в `src/`. Их dsh подгрузит сам, когда агент впервые тронет файл в папке. `.agents/rules/` — архив для людей, по умолчанию не читается.

## 1. Инварианты

1. `@tauri-apps/*` живёт в `src/lib/*`. В `src/components/` и UI-хуках его нет: UI рендерит и зовёт экшены `AppContext`, системные вызовы — в `src/lib/storage/`.
2. Заметки — `.md` с YAML frontmatter. Медиа в `.attachments/`, удаление в `.trash/`. Доменные типы — `src/types/index.ts`.
3. `?.` на кривых данных, пустой `catch` и `setTimeout(…, 100)` симптом не убирают, а прячут. Чинится источник данных, а не место, где всплыло.
4. Цвета, границы и шрифты — из `src/styles/theme.css`. Выдуманный hex в компоненте = баг верстки.
5. Логи через `logger.scope(...)`, не `console.log`.
6. ИИ не здоровается и не подводит итоги. Теги сверяются с существующими, факты — через `search_notes` / `read_note`, создание заметки — карточкой подтверждения (`action: create_note`).
7. Сделанное закрывается статусом, а не строкой в тексте: задача → `done`, пункт чеклиста → `subtasks`. Это касается и UI, и MCP.

## 2. Сдача

- Всегда: `npm run check` (tsc + 0 warnings линтера, две строки вывода). Перед сдачей — `npm run build`.
- Трогал `src/components/**` или `src/*.css`: `npx playwright test`, скриншот в `test-results/screenshots/`, показать в ответе `![Результат](<test-results/screenshots/…>)`.
- Синк- и аудио-спеки (`sync_*.spec.ts`, `*audio*.spec.ts`) чувствительны к нагрузке: в первых 120-мс буфер импорта и замеры «сколько пушей успело», во вторых — реальное воспроизведение и позиция плейхеда. На шести воркерах флакуют, на одном зелёные. Гоняй их `PLAYWRIGHT_WORKERS=1`; остальную пачку можно параллельно.
- Трогал `src-tauri/`: сборку **не** гоняй. exe, установщик и apk собирает GitHub Actions (`npm run release:dev` / тег), локальный `build:desktop` и `build:android` — впустую сожжённые минуты и артефакт без подписи. Есть устройство в `adb devices` и нужен нативный вид — поставить последнюю сборку из канала и снять `adb exec-out screencap -p`. Подробности — `BUILD.md` §0.
- Коммит — Conventional Commits на английском, по одной задаче.

## 3. По зонам

Первая правка в зоне — сначала её файл.

| Зона | Файл |
|---|---|
| `src/**` | `src/AGENTS.md` — приезжает сам |
| `src/components/**`, `src/*.css` | `src/components/AGENTS.md` — приезжает сам |
| `e2e/**`, `playwright.config.ts` | `.agents/rules/playwright-visual-testing.md` |
| заметки и задачи хранилища | `.agents/rules/mcp-vault-usage.md` |

## 4. Карта

Где что лежит — `docs/CODE_MAP.md`: на каждый модуль строка с числом строк, числом импортёров, экспортами и одной фразой «что это». Генерится `npm run map:code`, руками не правится. Читаю его **до** того, как грепать: половина вопросов закрывается одной картой.

```text
src/
  components/   UI по зонам: Feed, Editor, Views, Mobile, Modals, Workspace, Admin, UI
                (+ подпапки зон: Feed/assistant, Feed/item, Feed/composer,
                 Editor/fullscreen, Settings/devices, Mobile/calendar,
                 Audio/panel, UI/menu, Admin/tabs)
  context/      AppContext — единственный стейт-хаб; hooks/ — записи, папки, хранилища, лента
  hooks/        gestures/ (drag, swipe), layout/ (размеры), media/ (вложения, аудио, композер),
                ui/ (оверлеи, presence, хоткеи), остальное плоско
  lib/          ai/ (LLM + fallback/ по интентам), logger/ (логи и редактирование секретов),
                platform/ (tauri, окна, проводник), text/ (markdown, дифф, размеры),
                tasks/ (чекбоксы, завершение), storage/ (диск, реестр, папки, корзина),
                sync/ (relay: движок, конфиг, сокет), vault/ (модель; integrity/ — манифест, сканеры, ремонт), time/ (даты),
                media/ (вложения и аудио), notify/ (prefs — настройки канала, quiet — тихие
                часы, plan — напоминания, assistant — ответ из telegram), остальное плоско
  types/        доменные типы
  mcp/          MCP-сервер, собирается отдельным конфигом
  styles/       theme.css — токены
src-tauri/      Rust: десктоп и Android
e2e/            Playwright: slag/ по зонам + support/
config/         Vite, tsconfig и oxlint
scripts/        инструменты репозитория: gen-code-map.mjs (карта и `where`), иконки Android, bench/,
                vault-doctor.mjs (проверка хранилища без приложения)
docs/project-map/  база знаний проекта, 15 документов
```

Сервер синхронизации и telegram-бот (включая AI-шлюз) живут отдельно:
`https://github.com/wssdozh/slag-relay`. В этом репозитории остаётся клиент: `src/lib/sync/`,
`src/lib/notify/`, `src/lib/ai/`. Тесты релея гоняются в его репозитории.

Задача → файлы, чтобы не искать с нуля:

| задача | начинать с |
|---|---|
| синхронизация: соединение, очередь, конфликты | `src/lib/sync/syncEngine.ts`, `transport.ts`, `applyBundle.ts`, `pushBundle.ts` |
| эталон заметок: операции, квитанции, слияние и восстановление | `src/lib/sync/notes/`: `session.ts` — режим комнаты, `replica.ts` — доставка, `journal.ts` — намерения, `merge.ts` — нормализация и сравнение, `bootstrap.ts` — подготовка миграции |
| загрузка бэклога: бюджет страницы, дедлайн, курсор | `src/lib/sync/pullPage.ts`, `SyncEngine.fetchPendingBundlesHttp()`, `docs/sync-architecture.md` |
| сверка корней между устройствами, манифест комнаты | `src/lib/sync/manifest/`: `sync.ts` — диагностическая сверка legacy и чтение сохранённых бандлов, `channel.ts` — формат и сравнение, `peers.ts` — чтение чужих корней, `publish.ts` — свой POST, `schedule.ts` — тайминги. Хэши заметок — `src/lib/vault/integrity/manifest.ts` |
| конфиг синка, авторизация, сид-фраза | `src/lib/sync/syncConfig.ts` |
| экран синка, аккаунт, устройства | `src/components/Settings/`, `src/lib/sync/account.ts` |
| уведомления и напоминания | `src/lib/notify/`, `src/context/hooks/useNotifyArm.ts` |
| telegram-бот: канал, приглашение, доставка | `wssdozh/slag-relay` (`bot.py`, `delivery.py`, `DEPLOYMENT.md`), `src/lib/notify/prefs.ts` |
| вопрос из бота: режимы и ответ | `src/lib/notify/assistant.ts`, `src/lib/ai/orchestrator.ts`, `wssdozh/slag-relay` (`server.py`) |
| ссылки `slag://`: страница-переходник на релее, схема в ОС | `wssdozh/slag-relay` (`tg.py`, `render_answer_links`), `src/lib/platform/deepLink.ts`, `src-tauri/src/deeplink.rs` |
| лента и карточка записи | `src/components/Feed/FeedList.tsx`, `ItemCard.tsx` |
| композер, создание и сохранение записи | `src/components/Feed/Composer.tsx`, `src/lib/vault/markdownSerializer.ts` |
| запись: создать, изменить, удалить, восстановить, переместить | `src/context/hooks/useItemWrites.ts` |
| папка: создать, переименовать, описать, удалить | `src/context/hooks/useFolderAdmin.ts`, `src/lib/storage/folderStore.ts` |
| хранилище: переключить, создать, удалить | `src/context/hooks/useVaults.ts`, `src/lib/storage/vaultRegistry.ts` |
| корзина | `src/lib/storage/trashStore.ts` |
| проверка и чистка хранилища: манифест, находки, ремонт | `src/lib/vault/integrity/`, `src/lib/storage/integrityService.ts`, `scripts/vault-doctor.mjs`, `src/components/Settings/vault/integrity/` |
| полноэкранный редактор и черновики | `src/components/Editor/FullscreenEditor.tsx`, `useFullscreenDraft.ts` |
| канбан, календарь, поток | `src/components/Views/`, `src/lib/time/` |
| мобильные экраны и жесты | `src/components/Mobile/`, `src/hooks/layout/useIsMobile.ts` |
| ИИ-ассистент, инструменты, действия | `src/lib/ai/orchestrator.ts`, `tools.ts`, `actionParser.ts` |
| память ассистента: факты, типы, темы, скоринг | `src/lib/memory.ts`, `src/lib/ai/prompt.ts`, `src/lib/sync/applyBundle.ts` |
| поиск | `src/lib/searchService.ts` |
| состояние приложения | `src/context/AppContext.tsx` + `src/context/hooks/` |
| вложения, аудио, вставка файлов | `src/lib/media/`, `src/lib/storage/index.ts` |
| настройки, тема, типографика | `src/components/Modals/SettingsModal.tsx`, `src/components/Settings/`, `src/styles/theme.css` |
| MCP-сервер | `src/mcp/`, `config/vite.mcp.config.ts` |
| e2e | `e2e/slag/` |

Детали не пересказываю, читаю по вопросу:

| Вопрос | Документ |
|---|---|
| раскладка модулей и куда класть новое | `docs/project-map/14_Module_Layout.md` |
| UX, ЛКМ/ПКМ, горячие клавиши | `docs/project-map/01_UI_UX_Interactions_Matrix.md` |
| модель данных и frontmatter | `docs/project-map/02_Data_Model_Obsidian_Vault.md` |
| ИИ, теги, триаж | `docs/project-map/03_AI_Engine_Zero_Slop_Gemini.md`, раздел 6 — память ассистента |
| поиск Orama | `docs/project-map/05_Search_Orama_Local_First.md` |
| синхронизация | `docs/sync-architecture.md` |
| сборки | `BUILD.md` |
| MCP | `docs/mcp-guide.md` |

## 5. Порядок работы

- Сначала `docs/CODE_MAP.md` и таблица «задача → файлы» выше, потом `npm run where <symbol>` для конкретного имени, и только затем `glob` / `grep`. О том, что уже есть в кодовой базе, не спрашивать.
- Правка больше трёх файлов — сначала `.agents/tasks/<slug>.md` по шаблону `_template.md`: цель, что трогаем, чего не трогаем, критерий готовности. После работы допиши, что оказалось не так, как думали. Сессия кончится, файл останется.
- Неуверенность — один вопрос через `ask_user_question` с 2–4 вариантами, рекомендуемый первым.
- Одна ошибка сборки или тестов три раза подряд — стоп, лог и вопрос, а не четвёртая попытка.
- Сборки: `BUILD.md`. MCP: `docs/mcp-guide.md`.
