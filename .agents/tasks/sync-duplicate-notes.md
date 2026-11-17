# дубли заметок при синке + гигиена репозитория

- **цель**: в ленте одна заметка — одна карточка; на диске один id — один файл; поиск не умирает от дубля id; в логах строки не двоятся.
- **трогаем**: `src/lib/sync/syncEngine.ts` (сериализация импортов), `src/lib/searchService.ts` (дедуп индекса), `src/context/AppContext.tsx` + `useNotifyArm` / `useRecurringRollover` / `useAppUpdates` (системный boot только в главном окне), `config/vite.config.ts` (watcher не смотрит в `.agents`).
- **не трогаем**: Rust (`src-tauri/**`) — локально не собирается, правки без сборки не проверить; `ComposerEngine` textarea (снимится ценой ~300 локаторов); `useSheetDrag`/`SheetPanel` (жест, нужен живой прогон).
- **готово когда**: `npm run check` чистый, `npm run build` зелёный, `sync_durability` / `sync_init_race` / `sync_persist_race` зелёные, в `vaults/main/notes` нет двух файлов с одним `id`.
- **уже выяснили**: 17.11 07:54 один бёрст отложенных бандлов с телефона дал `item_1794860902957` двумя файлами — он лежал и в `Входящие` (done, 11:19), и в `Проекты/SLAG` (todo, 23:28). Дубль id в списке заметок ронял `insertMultiple` Orama («A document with id … already exists», 200+ раз в логе) — это и был мёртвый поиск.

## что оказалось не так, как думали

1. **Главная причина е2е-флаки не в коде.** `npx playwright test` падал на `sidebar-settings-btn` / `main` не из-за правок: vite обходил 21 воркtree в `.agents/worktrees` с junction'ами на общий `node_modules`, watcher сыпал `UNKNOWN` и подвешивал `[optimizer] scanning dependencies...` на минуты. После `server.watch.ignored: ['**/.agents/**']` первый же прогон дал 23/23 и 7/7. Без этого любая проверка здесь — гадание.
2. **Второе окно.** `App.tsx` возвращает `QuickComposerWindow` **внутри** `AppContent`, то есть `AppProvider` уже смонтирован: быстрое окно поднимало скан диска, arm напоминаний, опрос telegram и свой `SyncEngine` с подпиской на изменения. Отсюда двойные строки в логе, двойные «arming a reminder failed», двойная запись кэша заметок. `syncEngine.init()` уже был прикрыт `isPrimaryWindow()` — остальное нет. Теперь прикрыто, а главное окно дренит общий outbox по `slag://data-changed`, иначе заметка из быстрого окна не уехала бы на релей.
3. **`flushStagedImport` не был сериализован**: второй флаш читал `previous` до записи первого и не знал старый путь перемещённой заметки. Два файла на один id — ровно из этого.
4. **Аудит дал меньше, чем обещал.** `Button variant="danger"` и `size="lg"` из головы списка при ближайшем рассмотрении используются (через `IconButton` и др.) — не тронул. `MemoryUsage`/`SnapshotUsage` — два вызова на два типа, выгода ноль.
5. **Воркtrees**: 25 из 29 были чистыми и с уже влитыми ветками — снёс. Остались `consolidate-main` (ветка не влита) и `hero-nopanel` (в нём два неотслеживаемых каталога `video-out-*`).

## что осталось

- Rust-часть аудита (`open_in_folder` через `tauri-plugin-opener`, дубль `DwmSetWindowAttribute`, мёртвый параметр `binding` в `setup_system_hotkey`) — нужна сборка на CI, чтобы не гадать.
- `ComposerEngine` textarea, `useSheetDrag`, дедуп `LazyOverlay` в `App.tsx` — поведенческие, нужен живой прогон и миграция локаторов.
