# AGENTS.md — Кодекс SLAG v2

Стек: **React 19, TypeScript, Tailwind CSS v4, Tauri v2 (Desktop & Android), Orama BM25, Playwright, Vite**.

Источник правды — этот файл и два файла в `src/`. Их dsh подгрузит сам, когда агент впервые тронет файл в папке. `.agents/rules/` — архив для людей, по умолчанию не читается.

## 1. Инварианты

1. `@tauri-apps/*` живёт в `src/lib/*`. В `src/components/` и UI-хуках его нет: UI рендерит и зовёт экшены `AppContext`, системные вызовы — в `src/lib/storage.ts`.
2. Заметки — `.md` с YAML frontmatter. Медиа в `.attachments/`, удаление в `.trash/`. Доменные типы — `src/types/index.ts`.
3. `?.` на кривых данных, пустой `catch` и `setTimeout(…, 100)` симптом не убирают, а прячут. Чинится источник данных, а не место, где всплыло.
4. Цвета, границы и шрифты — из `src/styles/theme.css`. Выдуманный hex в компоненте = баг верстки.
5. Логи через `logger.scope(...)`, не `console.log`.
6. ИИ не здоровается и не подводит итоги. Теги сверяются с существующими, факты — через `search_notes` / `read_note`, создание заметки — карточкой подтверждения (`action: create_note`).

## 2. Сдача

- Всегда: `npm run lint` (0 warnings) и `npm run build`.
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

## 4. Порядок работы

- Сначала `glob` / `grep` по затронутым файлам. О том, что уже есть в кодовой базе, не спрашивать.
- Неуверенность — один вопрос через `ask_user_question` с 2–4 вариантами, рекомендуемый первым.
- Одна ошибка сборки или тестов три раза подряд — стоп, лог и вопрос, а не четвёртая попытка.
- Сборки: `BUILD.md`. MCP: `docs/mcp-guide.md`.
