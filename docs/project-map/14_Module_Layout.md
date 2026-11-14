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
    Feed/assistant/   по компоненту на вид сообщения
    Feed/item/        слоты карточки: картинки, файлы, аудио, видео, подзадачи, баннер, действия
    Feed/composer/    стрип вложений, тип, ИИ, запись, отправка, резолвер полей
    Editor/fullscreen/ вложения, инлайн-ИИ, строка свойств таски
    Settings/devices/  список, карточка, права, действия, pairing
    Settings/notifications/ контент, тихие часы, система; канал и ассистент в telegram — во вкладке «Интеграции»
    Mobile/calendar/   строка задачи, шапка, стрип недели, группы дней, трёхдневка, лист месяца
    Audio/panel/       обложка, скраббер, транспорт, плейлист, playback
    UI/menu/           наборы пунктов контекстного меню и подменю
    Admin/tabs/        разделы админки
  context/          AppContext — единственный стейт-хаб; hooks/ — записи, папки, хранилища, поверхности, лента
  hooks/
    gestures/       drag, pointer dnd, sheet drag, swipe
    layout/         container width, flip layout, is mobile, visual viewport
    media/          useAttachmentSrc, useAudioAnalyser, useComposerMedia
    ui/             useLayerStack, usePresence, useGlobalHotkeys
  lib/
    ai/             оркестратор, tools, prompt, action parser, адаптеры, aiService; fallback/ — по файлу на группу интентов
    logger/         logger (уровни, скоупы, буфер, ретеншн) и logRedaction (что не попадёт в лог)
    platform/       platform, windowControls, folderOpener — всё, что говорит с ОС и Tauri
    text/           chatMarkdown, diffUtils, formatBytes
    tasks/          taskUtils (чекбоксы в markdown), taskCompletion (переходы статусов)
    storage/        StorageService, vaultRegistry, folderStore, trashStore, draft store, IndexedDB attachments
    sync/           syncEngine, syncConfig, syncSocket, transport, devices, outbox, crypto
    vault/          модель записи: schema, updates, markdown serializer, filename, vaultDisplay, demo
    time/           даты, recurrence, Todoist-парсер, раскладка календаря
    media/          attachments enrichment, audio, bytecode, file drop, blobToDataUrl
    notify/         prefs, quiet, plan, assistant: канал и настройки, тихие часы, напоминания, ответ из бота
  mcp/              MCP-сервер, отдельная сборка
  styles/           theme.css — токены
  types/            доменные типы
scripts/            инструменты репозитория: gen-code-map.mjs (карта и `where`), build-android-icons.py
```

`src/lib/*` остаётся плоским для одиночек без родственников: `searchService`, `backupService`, `navigation`, `motion`, `commands`. В `src/hooks/` так же плоско лежат `useItemActions`, `useSuggestedActions`, `useCalendarSchedule`.

---

## 2. Куда класть новое

| Что | Куда |
|---|---|
| вызовы модели, инструменты, промпты | `lib/ai/` |
| чтение/запись заметок, черновики, IndexedDB | `lib/storage/` |
| транспорт, бандлы, устройства, ключи | `lib/sync/` |
| сериализация записи, frontmatter, имя файла | `lib/vault/` |
| даты, повторения, разбор срока, сетка календаря | `lib/time/` |
| уведомления, напоминания, тихие часы, ответ из telegram | `lib/notify/` |
| вложения, аудио, file drop | `lib/media/` |
| логи и редактирование секретов | `lib/logger/` |
| окна, Tauri, проводник, платформа | `lib/platform/` |
| markdown-текст, дифф, размеры | `lib/text/` |
| чекбоксы и статусы задач | `lib/tasks/` |
| жест, drag, свайп | `hooks/gestures/` |
| размеры окна, мобильность, flip | `hooks/layout/` |
| вложения, аудио, медиа композера | `hooks/media/` |
| оверлеи, presence, хоткеи | `hooks/ui/` |
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

Не держу здесь цифры второй раз: они гнили. Актуальная таблица «файл, строк, сколько импортят, что это» — в `docs/CODE_MAP.md`, генерится `npm run map:code` из самого дерева.

Цель — держать файл под 1000 строк, кроме `AppContext` и сервисов, где идёт постепенный вынос.
