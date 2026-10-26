# AGENTS.md — Кодекс Автономного Агента SLAG v2

> Свод архитектурных стандартов, инженерных правил и регламентов тестирования для автономных ИИ-агентов в проекте **SLAG v2**.  
> Стек: **React 19, TypeScript, Tailwind CSS v4, Tauri v2, Orama BM25, Gemini 2.0 Flash, Playwright E2E, Vite**.

---

## 1. Базовые Инженерные Стандарты

- **Поиск первопричины (No Crutches Policy)**  
  Запрещено маскировать баги слепыми операторами `?.`, пустыми блоками `try/catch` или искусственными задержками `setTimeout(..., 100)`. Проблема исследуется по стеку вызовов и устраняется в первоисточнике данных (`storage.ts` или `AppContext.tsx`).
- **Лестница простоты Ponytail**  
  Оценка решений строго снизу вверх: `YAGNI` ➔ готовые утилиты `src/lib/` ➔ нативный JS/TS/Web API ➔ установленный пакет (`@orama/orama`, `lucide-react`) ➔ однострочное решение ➔ минимальный код. Без пустых абстракций и лишних файлов.
- **Контракт верстки 95% (Linear & Vercel Minimal Dark)**  
  Глубокий монохром (`#08090a`, `#141417`), отсутствие радужных градиентов, антиматрёшечный принцип (запрет «блока в блоке», двойных рамок и внутренних подвалов), запрет «чипсов на чипсе», запрет изогнутых бордеров со скруглениями, отсутствие рамок фокуса (`ring-0`, `outline-none`).
- **Obsidian Local-First стандарт**  
  Данные хранятся в виде чистых `.md` файлов с валидным YAML Frontmatter. Медиафайлы изолированы в `.attachments/`, удаленные заметки переносятся в скрытую корзину `.trash/`.
- **Изоляция Tauri и паттерн MVP (чистый View)**  
  Запрещено вызывать `@tauri-apps/*` в UI-компонентах и хуках отображения. Интерфейс выступает как чистый View: рендерит данные и прокидывает действия в `AppContext` (Presenter). Все системные вызовы Tauri и файловые операции изолированы в `src/lib/storage.ts` (Model). Это гарантирует запуск в обычном браузере и прогон Playwright E2E без сборки Rust-бинарника.
- **Тихий Zero-Slop ИИ**  
  Никаких приветствий, предисловий и вежливых подводок. Ответы строго в `application/json` или Tool Calling. Перед генерацией тегов передается словарь существующих тегов пользователя для исключения дубликатов.
- **Сквозная визуальная верификация (Playwright + read_image)**  
  Любые изменения в интерфейсе проверяются прогоном Playwright и визуальным анализом созданных скриншотов через инструмент `read_image` на отсутствие сползания верстки, наложений и дефектов.
- **Структурированная диагностика (Zero-Slop Logging & Privacy)**  
  Запрещены неструктурированные `console.log`. Все события маршрутизируются через `logger.scope(...)` с автоматическим маскированием API-ключей, замером `durationMs` и кольцевым буфером в памяти.

---

## 1.1. Краткая Норма Автономного Агента (Agent Codex)

Каждый агент, взаимодействующий с кодовой базой и заметками, строго соблюдает восемь канонических правил:
1. **ZERO-SLOP**: Никаких приветствий, преамбул и вежливых концовок. Либо чистый JSON, либо вызов инструмента, либо прямой фактологический ответ.
2. **TAXONOMY FIRST**: Всегда проверять существующие теги хранилища перед предложением новых. Дубликаты и синонимы запрещены.
3. **SCOPE DISCIPLINE**: В папке контекст строго ограничен папкой. Во «Входящих» — доступ ко всей базе.
4. **GROUNDING VIA TOOLS**: Не выдумывать содержание заметок. При любых вопросах о фактах вызывать `search_notes` / `read_note`. Ссылки оформлять как `[[Заметка]]`.
5. **READ-ONLY SAFETY**: Модель не изменяет файлы напрямую. Создание заметки оформляется через блок `action: create_note` и карточку подтверждения в UI.
6. **REASONING ISOLATION**: Мысли и цепочки рассуждений выводятся в отдельный блок reasoning и скрываются под аккордеон `[ 🧠 Рассуждения (XXs) ]`.
7. **ANTI-MATRYOSHKA**: Запрет вложенных рамок и контейнеров («карточка в карточке»). Контент живет на плоскости первого уровня, иерархия задается типографикой и отступами, а не «коробочками внутри коробочек».
8. **TAURI-FREE VIEW (MVP)**: Запрещено импортировать `@tauri-apps/*` в компоненты интерфейса. View только рендерит данные и вызывает экшены Presenter (`AppContext`), нативный слой изолирован в Model (`storage.ts`).

---

## 2. Четырехэтапный Пайплайн Обработки Запросов

Каждый входящий запрос пользователя обрабатывается строго по 4 этапам:

```
┌────────────────────────┐      ┌────────────────────────┐
│ 1. ИЗУЧЕНИЕ ЗАДАЧИ     │ ───► │ 2. ПЛАНИРОВКА          │
│ - Автономный grep/glob │      │ - Readiness Gate ≥ 90% │
│ - Карта зависимостей   │      │ - ask_user_question    │
└────────────────────────┘      └───────────┬────────────┘
                                            │
                                            ▼
┌────────────────────────┐      ┌────────────────────────┐
│ 4. ТЕСТИРОВАНИЕ        │ ◄─── │ 3. РЕАЛИЗАЦИЯ          │
│ - oxlint (0 warnings)  │      │ - Лестница Ponytail    │
│ - tsc -b && vite build │      │ - Root-Cause fix       │
│ - Playwright + Скрины  │      │ - 95% UI-контракт      │
└────────────────────────┘      └────────────────────────┘
```

### Этап 1: Изучение задачи (Task Reconnaissance)
1. Найти затронутые файлы через `glob` и `grep`.
2. Проверить типы в `src/types/index.ts` и методы в `src/lib/storage.ts`.
3. Запрещено спрашивать пользователя о фактах, которые уже есть в репозитории. Исследовать кодовую базу самостоятельно.

### Этап 2: Планировка (Specification & Readiness Gate)
1. Сформировать карточку готовности: Цель, Границы, Контракты данных, Критерии приемки, Уверенность.
2. **Кодить при уверенности ниже 90% запрещено**.
3. При неопределенности в поведении вызвать `ask_user_question`:
   - Ровно один вопрос за шаг.
   - 2–4 структурированных варианта с инженерными компромиссами.
   - Рекомендуемый вариант первым с пометкой `(Рекомендуется)`.

### Этап 3: Реализация (The Ponytail Ladder & No Crutches)
1. Реализовать минимально достаточный diff без лишних абстракций.
2. Исключить костыли и обходные пути.
3. Проверить соблюдение запретов верстки (нет рамок фокуса, нет чипсов на чипсе, нет изогнутых бордеров со скруглениями).
4. Работать автономно до полного завершения без пауз на «продолжать ли мне?».

### Этап 4: Тестирование (E2E & Скриншот-Аудит)
1. **Линтер**: `npm run lint` (`oxlint`) — **0 warnings, 0 errors**.
2. **Сборка**: `npm run build` (`tsc -b && vite build`) — успешная компиляция.
3. **E2E-тесты**: `npx playwright test` — 100% тестов пройдены.
4. **Скриншот-аудит верстки на сползание и дефекты**:
   - В тесте снять скриншот: `await page.screenshot({ path: 'test-results/screenshots/<name>.png', fullPage: true })`.
   - Просмотреть полученное изображение через инструмент `read_image`.
   - Проверить верстку по чек-листу: отсутствие горизонтального скролла, сохранение базовых линий, отсутствие наложения блоков, аккуратность отступов.

---

## 3. Справочник Модулей Правил (`.agents/rules/`)

| Модуль | Область | Описание |
|---|---|---|
| [`request-pipeline.md`](.agents/rules/request-pipeline.md) | **Workflow** | Регламент 4 этапов, Feature Gate ($\ge 90\%$), протокол вопросов, DoD, Handoff. |
| [`playwright-visual-testing.md`](.agents/rules/playwright-visual-testing.md) | **Testing** | Запуск Playwright, снятие скриншотов, аудит через `read_image`, чек-лист сползания верстки. |
| [`ui-ux-contract.md`](.agents/rules/ui-ux-contract.md) | **UI/UX** | Контракт 95%, монохромная палитра, запрет чипсов на чипсе, запрет изогнутых бордеров, LIFO-стек. |
| [`anti-deadlock.md`](.agents/rules/anti-deadlock.md) | **Engineering** | Лестница Ponytail, Root-Cause починка, запрет костылей, правило 3 попыток. |
| [`code-style-ts-react.md`](.agents/rules/code-style-ts-react.md) | **Engineering** | React 19, чистые эффекты, типизация TypeScript, Fast Refresh, правила oxlint. |
| [`triz-contradiction-resolution.md`](.agents/rules/triz-contradiction-resolution.md) | **Architecture/UX** | Разрешение технических и физических противоречий по ТРИЗ, 4 оператора разделения, ИКР. |
| [`logging-diagnostics-standard.md`](.agents/rules/logging-diagnostics-standard.md) | **Diagnostics** | Регламент логгера, скоупы `AI/FS/SEARCH/UI/APP/SYNC`, замер длительности, маскирование ключей. |
| [`BUILD.md`](BUILD.md) | **Build & Run** | Матрица сборок: Web Check, Desktop Live HMR, Standalone Release (.exe). |

---

## 4. Карта Структуры Проекта

```text
SLAG v2/
├── .agents/
│   └── rules/                          # Модули правил агента
│       ├── request-pipeline.md
│       ├── playwright-visual-testing.md
│       ├── ui-ux-contract.md
│       ├── anti-deadlock.md
│       ├── code-style-ts-react.md
│       ├── triz-contradiction-resolution.md
│       └── logging-diagnostics-standard.md
├── docs/
│   └── project-map/                    # База знаний в формате Obsidian
│       ├── 00_MOC_Map_of_Content.md
│       ├── 01_UI_UX_Interactions_Matrix.md
│       ├── 02_Data_Model_Obsidian_Vault.md
│       ├── 03_AI_Engine_Zero_Slop_Gemini.md
│       ├── 04_Multimedia_Engine.md
│       ├── 05_Search_Orama_Local_First.md
│       ├── 06_E2E_Sync_Architecture.md
│       ├── 07_Roadmap_Implementation.md
│       └── 12_Logging_Diagnostics_Engine.md
├── e2e/                                # Playwright E2E тесты
│   └── slag.spec.ts
├── src/
│   ├── components/
│   │   ├── Editor/FullscreenEditor.tsx # Полноэкранный фокус-редактор
│   │   ├── Feed/                       # Стрим-лента: Composer, FeedList, FeedHeader, ItemCard
│   │   ├── Logs/                       # In-App Dev HUD: LogViewer.tsx, LogModal.tsx
│   │   ├── Modals/                     # FolderModal, SettingsModal, TriageModal
│   │   ├── RightPanel/FolderInfoPanel  # Правая инфо-панель папки и медиа
│   │   ├── Search/SearchModal.tsx      # Поиск Orama (⌘K)
│   │   ├── Sidebar/                    # FolderTree, folderIcons, Sidebar
│   │   └── UI/                         # Lightbox, Toast, Audio/Video рекордеры и плееры
│   ├── context/AppContext.tsx          # Главное состояние и менеджер слоев
│   ├── lib/                            # logger.ts, storage.ts, aiService.ts, searchService.ts
│   └── types/index.ts                  # Модели данных: SlagItem, FolderMeta, VaultMeta, LogEntry
├── AGENTS.md                           # Главный кодекс агента (этот файл)
├── BUILD.md                            # Регламент сборок (Web, HMR Desktop, Standalone .exe)
├── SPECIFICATION.md                    # Полная техническая спецификация продукта
└── playwright.config.ts                # Конфигурация Playwright
```

---

## 5. Критерии Приемки (Definition of Done)

Задача закрывается только при выполнении всех условий:
1. Код решает задачу без внедрения невостребованных абстракций.
2. `npm run lint` — 0 warnings, 0 errors.
3. `npm run build` — чистая компиляция.
4. `npx playwright test` — 100% тестов пройдены.
5. Скриншот измененного интерфейса просмотрен через `read_image`, дефекты и сползание верстки отсутствуют.
6. Изменения зафиксированы атомарным коммитом с сообщением по стандарту Conventional Commits на английском языке.
