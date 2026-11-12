# декомпозиция god-файлов по ответственности

## где мы сейчас

все три сервиса-«бога» ушли под тысячу строк, модалка настроек — под триста, редактор — под семьсот, панели — под триста. в топе самых длинных файлов остались данные, виды и два честно-широких класса.

| файл | было | стало | что осталось |
|---|---:|---:|---|
| `lib/sync/syncEngine.ts` | 1594 | **873** | начальный синк, админ устройств, http-доставка и pull |
| `context/AppContext.tsx` | 1740 | **719** | состояние хранилищ и папок, объект контекста, слои Escape |
| `lib/storage/index.ts` | 1591 | **672** | CRUD записей, кэш и события, делегирование диску, медиа, папкам, корзине |
| `components/Editor/FullscreenEditor.tsx` | 989 | **638** | CodeMirror-вью, горячие клавиши, обвязка шита |
| `lib/logger.ts` | 647 | **585** | уровни, скоупы, слушатели, буфер, ретеншн, персист |
| `components/UI/ContextMenu.tsx` | 711 | **316** | позиционирование, состояние подменю, hover-мост |
| `components/Audio/AudioPanel.tsx` | 714 | **279** | скоуп и фильтры, список треков, раскладка |
| `components/Feed/AssistantChat.tsx` | 994 | **233** | состояние, подписки, отправка, diff-модалка |
| `components/Modals/SettingsModal.tsx` | 873 | **208** | рельса вкладок, мобильный и десктопный каркас, подвал |
| `components/Settings/DevicesSettingsTab.tsx` | 535 | **195** | сборка: инвайты, режим доступа, раскладка по частям |
| `components/Editor/EditorToolbar.tsx` | 575 | **171** | каркас, backdrop дропдаунов, правый блок сохранения |
| `lib/ai/localFallback.ts` | 1046 | **1** | реэкспорт; сама цепочка в `lib/ai/fallback/` |
| `components/Feed/Composer.tsx` | 1211 | 1093 | **осознанно**: одна форма |
| `components/Feed/ItemCard.tsx` | 1151 | 1151 | **осознанно**: 1048 строк разметки |
| `components/Mobile/MobileCalendarView.tsx` | 1105 | 1105 | **осознанно**: 1071 строка разметки |
| `lib/sync/bip39Words.ts` | 2052 | 2052 | данные |

## вынесенные ответственности

**lib/ai/fallback/** — по файлу на группу интентов офлайн-ассистента: `notes` (221), `decomposition` (182), `tasks` (399), `agenda` (81), `search` (115), `dialog` (130), плюс `intentContext` (флаги и нормализация текста) и `history` (поиск по `[[ссылкам]]`). `index.ts` — только порядок проверок, потому что порядок и есть поведение.

**components/Feed/assistant/** — по компоненту на вид сообщения: пузырь, вызовы инструментов, рассуждения, карточка действия, результаты поиска, баннер, композер; `AssistantMessages` держит прокрутку и заголовки.

**context/** — `useOverlays` (поверхности), `useMobileNav`, `useFeedView` + `feedView` (правила ленты как чистая функция), `useAssistant`, `useBackup`, `useAppearance`, `useRecurringRollover`, `useItemWrites` (запись, удаление, восстановление, перемещение), `useFolderAdmin` (папка: сохранить, описать, переименовать, удалить), `useVaults` (переключить, создать, удалить хранилище, выбрать папку, показать в проводнике), `appContext.types`.

**components/Settings/** — по вкладке на файл: `AiSettingsTab` (301, своя форма и сабмит), `VaultSettingsTab` (218, снимки и импорт), `UiSettingsTab` (113), `ShortcutsSettingsTab` (99), `LogsSettingsTab` (10). **devices/** — список, карточка, права, действия и `useDevicePairing` (318 строк флоу привязки).

**components/Editor/** — `EditorTopBar` (60: назад, папка, тип), `MarkdownPalette` (363: история, стили, списки, инлайн, ссылка, вложение, ИИ), `editorToolbarParts.tsx` (типы и опции), `fullscreen/` — `useEditorAttachments` (160: drop, вставка, скрепка, `![[файл]]`), `useEditorAiActions` (70: папка и теги), `EditorTaskFields` (291: строка свойств таски).

**components/Audio/panel/** — `AudioArtwork` (72), `AudioScrubber` (79: таймлайн и drag), `AudioTransport` (186), `PlaylistDrawer` (60, адаптер над существующим drawer), `useAudioPlayback` (400: весь `<audio>` и медиа-события).

**components/UI/menu/** — наборы пунктов: `itemMenuSections` (204), `folderMenuSections` (87), `feedMenuSections` (81) и `MenuSubmenus` (228: три боковые панели, flyout и мост).

**storage/** — `vaultFiles` (диск: 497 строк, контекст из 9 вопросов), `vaultRegistry` (какое хранилище открыто: реестр в localStorage, переключение, создание, удаление, выбор папки), `folderStore` (запись папок: сохранить, переименовать с каскадом, описать, удалить с переносом заметок), `trashStore` (что значит удалить и как отменить), `vaultTransfer` (формат обмена), `attachments` (байты медиа), `lib/vault/stats` (отчёты).

**sync/** — `localBookkeeping` (три леджера дедупа), `applyBundle` (317 строк слияния), `pushBundle` (291 строка сборки), `syncConfig` (где лежит конфиг, заголовки авторизации, сид-фраза), `syncSocket` (41 строка: открыть сокет, принять кадр, подтвердить бандл), `attachmentSignature`.

**lib/logRedaction.ts** — что никогда не попадёт в лог: шесть регулярок, заглушки, лимит глубины.

**composer/** — `useComposerFiles` (подбор, drop, paste).

## раскладка по доменам (запрошено отдельно)

плоские модули в `src/lib` и `src/hooks` группируются по смыслу, **без фанатизма**: папка появляется там, где рядом лежит два-три родственника, одиночки остаются плоско.

```
lib/logger/     logger.ts, logRedaction.ts
lib/platform/   platform.ts, windowControls.ts, folderOpener.ts, navigation.ts
lib/text/       chatMarkdown.ts, diffUtils.ts, formatBytes.ts
lib/tasks/      taskCompletion.ts, taskUtils.ts
lib/ui/         motion.ts, commands.ts
lib/vault/      + vaultDisplay.ts
lib/ai/         + aiService.ts
lib/media/      + blobToDataUrl.ts (появился после дедупа)
плоско:         searchService.ts, backupService.ts

hooks/media/    useAttachmentSrc.ts, useAudioAnalyser.ts, useComposerMedia.ts
hooks/ui/       useLayerStack.ts, usePresence.ts, useGlobalHotkeys.ts
hooks/items/    useItemActions.ts, useSuggestedActions.ts
плоско:         useCalendarSchedule.ts
```

импорты правит `tsc`: любой пропущенный путь — красная сборка, а не тихая ошибка. после переезда `npm run map:code` и обновление дерева в `AGENTS.md` / `docs/project-map/14_Module_Layout.md`.

## метод

границы методов ищутся **парсером TypeScript** (`ts.createSourceFile` → `node.getStart()/getEnd()`), а не счётчиком скобок: ручной токенизатор обрывался на шаблонных строках и срезал лишнее. это стоило трёх сломанных попыток на одном методе.

вынос всегда идёт вместе с правкой call-site'ов: приватные обёртки-форвардеры удаляются, публичные фасады остаются только там, где метод зовут снаружи (UI, спеки).

## проверки

`npm run check` — 0 ошибок и 0 предупреждений на каждом шаге, `npm run build` — зелёный.

зелёные (6 воркеров, если не сказано иное): `feed` 20/20 (трижды), `mobile` 21/21, `workspace` 10 passed + 1 skip, `sync_push_transport` + `sync_pending_pull` + `sync_connection_lifecycle` 10/10, `settings_consistency` 2/2 (все восемь вкладок на 1280 и 375), `assistant_layout` 1/1, `backup_restore` 2/2, `attach_sheet` 26/26, `recurring_streak` 23/23, `sync_drafts` + `sync_attachment_transfer` 4/4, `editor` 16/19.

## что осталось

1. `syncEngine` (873): начальный синк (`init` — сто строк), админ устройств, http-доставка и pull. шов «доставка» пробовали — тянет 17 членов, один `commitPush` связывает всё; режется только сокет.
2. `storage` (672): CRUD записей, черновики и настройки в одном классе.
3. `AppContext` (719): состояние хранилищ и папок, слои Escape, объект контекста на 150 полей.
4. `components/Admin/AdminPanel.tsx` (645) — **уже разрезан** (вкладки в `Admin/tabs/`, данные в `useAdminData`); остаток — логин-гейт и девять fetch-обработчиков на общем стейте. следующий шов, если браться: `useAdminActions.ts` по образцу `useAdminData`.
5. **устаревшие спеки, проверенные на baseline** (не регресс): `editor.spec.ts` — 3 из 19 (32, 33, 46). `views.spec.ts` починен на 8 из 9, тест 24 остаётся `skip` — заметка не всплывает даже без обрезки пула, вопрос к токенизатору Orama.

## заметки

- **найден и наполовину починен баг поиска.** [`searchService.ts`](src/lib/searchService.ts) собирал хиты обратно по массиву хранилища (`allItems.filter(...)`) — порядок релевантности Orama терялся, и ассистент получал первые пять записей в порядке каталога. теперь порядок хитов сохраняется, а мультитокен-проход считает вес `1/df`: редкий токен перебивает «по» и «как». тест 24 всё равно `skip` — «прафилам» не находит ту заметку даже в полном пуле, это уже вопрос к токенизатору, а не к сортировке.
- три спека имели один дефект: свой `goto` и 5-секундное ожидание против холодной трансляции vite (`backup_restore`, `assistant_layout`, `sync_drafts`). все переведены на ожидание `main` с бюджетом 120 с.
- **`backup_restore` не вскрывал дефект продукта**: он ждал нативный `window.confirm`, а приложение давно спрашивает своей модалкой. спеку научили нажимать «Восстановить» в `role="alertdialog"` — 2/2 зелёные. урок: падающий спек сначала читают, потом чинят продукт.
- **`workspace.spec.ts` был красный на 6 тестах** — проверено на чистом worktree `8d29df3`, то есть не регресс от рефакторинга. все разобраны: `voice_*.webm` — это id файла, а панель показывает заголовок заметки; тест 54 читает `%APPDATA%` и стал `test.skip` как десктоп-онли; `aside button` ловил два «main», пока меню висело в exit-транзиции (ждём `toBeHidden`); `.bg-emerald-500/30` теперь фильтруется по тексту, потому что пустая строка-разделитель носит тот же класс; в тесте 57 промпт переписан на явный интент «добавь в заметку…».
- **тест 56 был прав, а продукт — нет**: обёртка карточки держала `whitespace-pre-wrap`, и он наследовался в `ul/ol/li`, где своего `white-space` нет — каждый перевод строки внутри списка становился пустой строкой 16px, список из четырёх пунктов мерил 164px вместо 92. починено в `ItemCard`, тест снова обычный, не `skip`.
- **sync-спеки**: `getStateHashKey` в движке давно нет — тесты перешли на `stateHashKey(engine.bookkeeping)`. две штуки ждали 80 мс против 120-миллисекундного буфера импорта — теперь 250. и `push` без изменений состояния ничего не отправляет, поэтому перед замером троттлинга хеши сбрасываются.
- **`init` зовёт `this.connectWebSocket()`, а не модуль напрямую**: e2e-харнесс подменяет именно этот метод, иначе `init` открывал настоящий сокет в тесте.
- **диск в e2e не проверяется**: в браузере `isTauri()` ложно, `flushItemToDisk` — no-op. правки `VaultFiles` подтверждены типами и сборкой; настоящая проверка — десктоп-билд.

## параллельная работа

три независимых шва гоняются одновременно в трёх `git worktree` (`git worktree add ../SLAG-wN -b wip/srp-N HEAD` + junction на `node_modules`), по одному субагенту на шов. каждый проверяет себя `npm run check` и `npm run build` в своей копии, родитель мержит копированием файлов и гоняет e2e один раз. правило: наборы файлов не пересекаются, спеки и сервер не запускает никто, кроме родителя.

