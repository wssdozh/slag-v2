# проход по чистоте кода: легаси, дубли, горячие пути

- **цель**: убрать доказанный мёртвый код и дубли, снять два доказанных тормоза рендера, привести раскладку к правилам `src/AGENTS.md` — без массовых переносов и без правок «на глаз».
- **трогаем**: `src/lib/storage/*` (readJson, indexedDb, attachments), `src/lib/sync/*` (apiBase, localBookkeeping, outbox), `src/lib/platform/*`, `src/lib/ai/*`, `src/context/AppContext.tsx`, `src/components/Feed/*`, `src/components/Views/kanban/*`, `src/components/Workspace/WorkspaceShell.tsx`, `src/components/Settings/StorageUsageSection.tsx`.
- **не трогаем**: `src/mcp/**` (контракт), host-интерфейсы и `port.ts`/`browserPort.ts` (шов для node-сборки), миграции старого формата (решение владельца), `@tauri-apps` вне `src/lib`, `dist`, `src-tauri`.
- **готово когда**: `npm run check` чист, `npm run build` зелёный, целевые e2e (`storage_usage`, `feed_thumbs`) зелёные, мапка переgenerated.
- **уже выяснили**: см. ниже.

---

## что сделано

- `openDb` держит одно соединение на сессию вместо `indexedDB.open` на каждый резолв; IDB-ветка `getUrl` пополняет `urlCache` (раньше кэшировалась только дисковая).
- `scrollToItem` читает `items`/`currentFolder` из ref — идентичность стабильна, `memo` на markdown живой.
- `KanbanCard`/`KanbanColumn` под `React.memo`.
- сводка «Занятое место» пересчитывается по кнопке и при смене хранилища, а не на каждый сейв.
- один источник подписей приоритета (`taskUtils.PRIORITY_LABELS`); локальная копия в `useItemActions` врала на ступень в тосте.
- переносы по зонам: `Feed/chat/ChatTaskBlock` → `Feed/assistant/`, хуки композера → `Feed/composer/`.
- `WorkspaceShell` больше не импортирует `@tauri-apps` — через `startDraggingWindow`.
- 10 блоков `JSON.parse(localStorage)` → `readStoredJson` с `revive`.
- удалены мёртвые обёртки `StorageService`, мёртвые экспорты, фасад `aiClient`.
- `cleanUrl` × 8 → `apiBase()`; остальные 7 вхождений `replace(/\/+$/)` несли `.trim()`/ws-логику — не дубли.

## что оказалось не так

- окно вложений (резолв по `windowedItems`) пришлось откатить: лайтбокс папки строит деку из всех заметок и ждёт готовые url — вне окна картинка открывалась пустой. Перф-выигрыш не стоит сломанной навигации; лечится ленивым резолвом внутри лайтбокса.
- `useLayoutEffect` без deps в `FeedList` трогать нельзя: он ловит рост контента (загрузка фото), а не только смену зависимостей.
- `readMemory` остался со своим `try/catch`: на битом JSON там пишется `fsLog.warn`, а хелпер о таком молчит.
- `PRIORITY_LABELS`: аудит назвал это «не дублем», но у копии в `useItemActions` лестница была сдвинута (`low='Средний'`), и тост показывал не ту ступень. Свёл к `taskUtils`.
- артефакт прошлого шага: PowerShell `Set-Content` с кириллицей перекодировал файл в мусор. Кириллица — только `edit`/`write`.

## что осталось

- распил `AppContext` (80+ зависимостей в `useMemo`) — memo на контексте не спасает, нужен срез;
- `FeedList` (554) и `Composer` (699) — кандидаты на разрез, но с e2e-риском;
- `useSyncStatus` вместо семи копий подписки на `syncEngine` — следующий очевидный дубль;
- UTC/local расхождение в вычислении «сегодня» (25+ мест) — отдельная задача, не чистка.
