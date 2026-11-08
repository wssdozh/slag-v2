---
id: module_layout
title: "Раскладка модулей и правила размещения кода"
type: spec
updated: 2026-11-08
tags:
  - architecture
  - modules
  - layout
---

# Раскладка модулей

> Родительский документ: [[00_MOC_Map_of_Content]]
> Связанные: [[02_Data_Model_Obsidian_Vault]], [[03_AI_Engine_Zero_Slop_Gemini]], [[06_E2E_Sync_Architecture]], [[09_Folder_Views_Stream_Kanban_Calendar]]

---

## 1. Дерево

```text
src/
  components/       UI по зонам: Feed, Editor, Views, Mobile, Modals, Workspace, Admin, UI
  context/          AppContext — единственный стейт-хаб
  hooks/
    gestures/       drag, pointer dnd, sheet drag, swipe
    layout/         container width, flip layout, is mobile, visual viewport
  lib/
    ai/             оркестратор, tools, prompt, action parser, адаптеры
    storage/        StorageService, draft store, IndexedDB attachments
    sync/           syncEngine, transport, devices, outbox, crypto
    vault/          модель записи: schema, updates, markdown serializer, filename, demo
    time/           даты, recurrence, Todoist-парсер, раскладка календаря
    media/          attachments enrichment, audio, bytecode, file drop
  mcp/              MCP-сервер, отдельная сборка
  styles/           theme.css — токены
  types/            доменные типы
```

`src/lib/*` остаётся плоским для одиночных модулей: `logger`, `commands`, `motion`, `platform`, `windowControls`, `searchService`, `backupService`, `aiService`, `navigation`, `notifications`, `folderOpener`, `diffUtils`, `formatBytes`, `vaultDisplay`, `taskUtils`, `taskCompletion`.

---

## 2. Куда класть новое

| Что | Куда |
|---|---|
| вызовы модели, инструменты, промпты | `lib/ai/` |
| чтение/запись заметок, черновики, IndexedDB | `lib/storage/` |
| транспорт, бандлы, устройства, ключи | `lib/sync/` |
| сериализация записи, frontmatter, имя файла | `lib/vault/` |
| даты, повторения, разбор срока, сетка календаря | `lib/time/` |
| вложения, аудио, file drop | `lib/media/` |
| жест, drag, свайп | `hooks/gestures/` |
| размеры окна, мобильность, flip | `hooks/layout/` |
| состояние фичи | `hooks/` (плоско, если файл один) |
| визуал фичи | рядом с компонентом, в его зоне |

Правила:

1. Папка появляется на третьем родственном модуле, не на первом. Один файл — плоско.
2. Публичный вход — `index.ts` только у `storage` и `sync`; остальные импортируются по имени файла. Barrel-файлы без нужды не заводим.
3. Новый домен не получает свой `index.ts`, пока у него нет стабильного внешнего API.
4. Компонентный файл экспортирует только компоненты; хуки и константы — рядом отдельными файлами.
5. Файл больше 500 строк не наращиваем: сначала выносим кусок, потом добавляем.

---

## 3. Границы

- `lib/ai` не знает про React. Наружу отдаёт `assistantOrchestrator.runChat()` и `extractActionBlock()`.
- `lib/storage` — единственная точка `localStorage` и `@tauri-apps/plugin-fs` для заметок. Компоненты зовут фасад `storage`, не внутренние модули.
- `lib/sync` не импортирует компоненты и `AppContext`; наружу — `syncEngine`, `accountClient`, типы.
- `lib/vault` — чистые функции над `SlagItem`; без сети и UI.
- `lib/time` — чистые функции; без `storage` и React.
- `hooks/gestures` и `hooks/layout` — DOM/размеры, без доменных вызовов.

---

## 4. Текущие размеры

| Файл | Строк |
|---|---:|
| `lib/ai/orchestrator.ts` | ~1460 |
| `lib/storage/index.ts` | ~1370 |
| `lib/sync/syncEngine.ts` | ~1380 |
| `context/AppContext.tsx` | ~1860 |
| `components/Editor/FullscreenEditor.tsx` | ~960 |
| `components/Feed/Composer.tsx` | ~1260 |
| `components/Views/CalendarView.tsx` | ~550 |
| `components/Admin/AdminPanel.tsx` | ~650 |
| `components/Workspace/WorkspaceShell.tsx` | ~260 |

Цель — держать файл под 1000 строк, кроме `AppContext` и сервисов, где идёт постепенный вынос.
