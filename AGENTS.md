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

## 2. Сдача

- Всегда: `npm run check` (tsc + 0 warnings линтера, две строки вывода). Перед сдачей — `npm run build`.
- Трогал `src/components/**` или `src/*.css`: `npx playwright test`, скриншот в `test-results/screenshots/`, показать в ответе `![Результат](<test-results/screenshots/…>)`.
- Трогал `src-tauri/`: `npm run build:android`. Есть устройство в `adb devices` — поставить, запустить, снять `adb exec-out screencap -p`, проверить `read_image`.
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
  context/      AppContext — единственный стейт-хаб
  hooks/        gestures/ (drag, swipe), layout/ (размеры, мобильность), остальное плоско
  lib/          ai/ (LLM), storage/ (диск и черновики), sync/ (relay), vault/ (модель),
                time/ (даты и календарь), media/ (вложения и аудио), плоские утилиты
  types/        доменные типы
  mcp/          MCP-сервер, собирается отдельным конфигом
  styles/       theme.css — токены
src-tauri/      Rust: десктоп и Android
e2e/            Playwright: slag/ по зонам + support/
relay/          сервер синхронизации
docs/project-map/  база знаний проекта, 15 документов
```

Задача → файлы, чтобы не искать с нуля:

| задача | начинать с |
|---|---|
| синхронизация: очередь, транспорт, конфликты | `src/lib/sync/syncEngine.ts`, `transport.ts`, `crypto.ts` |
| экран синка, аккаунт, устройства | `src/components/Settings/`, `src/lib/sync/account.ts` |
| лента и карточка записи | `src/components/Feed/FeedList.tsx`, `ItemCard.tsx` |
| композер, создание и сохранение записи | `src/components/Feed/Composer.tsx`, `src/lib/vault/markdownSerializer.ts` |
| полноэкранный редактор и черновики | `src/components/Editor/FullscreenEditor.tsx`, `useFullscreenDraft.ts` |
| канбан, календарь, поток | `src/components/Views/`, `src/lib/time/` |
| мобильные экраны и жесты | `src/components/Mobile/`, `src/hooks/layout/useIsMobile.ts` |
| ИИ-ассистент, инструменты, действия | `src/lib/ai/orchestrator.ts`, `tools.ts`, `actionParser.ts` |
| поиск | `src/lib/searchService.ts` |
| состояние приложения | `src/context/AppContext.tsx` |
| вложения, аудио, вставка файлов | `src/lib/media/`, `src/lib/storage/index.ts` |
| настройки, тема, типографика | `src/components/Modals/SettingsModal.tsx`, `src/styles/theme.css` |
| MCP-сервер | `src/mcp/`, `vite.mcp.config.ts` |
| e2e | `e2e/slag/` |

Детали не пересказываю, читаю по вопросу:

| Вопрос | Документ |
|---|---|
| раскладка модулей и куда класть новое | `docs/project-map/14_Module_Layout.md` |
| UX, ЛКМ/ПКМ, горячие клавиши | `docs/project-map/01_UI_UX_Interactions_Matrix.md` |
| модель данных и frontmatter | `docs/project-map/02_Data_Model_Obsidian_Vault.md` |
| ИИ, теги, триаж | `docs/project-map/03_AI_Engine_Zero_Slop_Gemini.md` |
| поиск Orama | `docs/project-map/05_Search_Orama_Local_First.md` |
| синхронизация | `docs/sync-architecture.md` |
| сборки | `BUILD.md` |
| MCP | `docs/mcp-guide.md` |

## 5. Порядок работы

- Сначала `docs/CODE_MAP.md` и таблица «задача → файлы» выше, потом `npm run where <symbol>` для конкретного имени, и только затем `glob` / `grep`. О том, что уже есть в кодовой базе, не спрашивать.
- Неуверенность — один вопрос через `ask_user_question` с 2–4 вариантами, рекомендуемый первым.
- Одна ошибка сборки или тестов три раза подряд — стоп, лог и вопрос, а не четвёртая попытка.
- Сборки: `BUILD.md`. MCP: `docs/mcp-guide.md`.
