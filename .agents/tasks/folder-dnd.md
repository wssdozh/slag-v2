# Драг-дроп папок в сайдбаре + дерево линиями в @-меню

- **цель**: папку в дереве сайдбара можно перетащить на другую папку (становится подпапкой), между строками (меняет порядок у сиблингов) и на пустое место дерева (в корень). Заметки по-прежнему тащатся на папку. Меню `@` в композере показывает иерархию линиями `├── ╰──` вместо повторённого пути.
- **трогаем**: `src/types/index.ts` (`FolderMeta.order`), `src/lib/vault/folderTree.ts` (новый: дерево, ряды, перестановка), `src/lib/vault/folderOptions.ts` (дерево через общий хелпер), `src/lib/storage/folderSource.ts` + `folderStore.ts` + `vaultFiles.ts` + `index.ts` (порядок в `state.json`, `moveFolder`), `src/context/hooks/useFolderAdmin.ts`, `src/context/*` (проброс), `src/components/Sidebar/FolderTree.tsx`, `src/components/Feed/FolderSuggestionMenu.tsx`, `src/components/Feed/composer/useComposerAutocomplete.ts`, тесты `e2e/`, `scripts/folder-source.test.mjs`.
- **не трогаем**: `src-tauri/` (сборку не гоняем), релей (папки уже ездят одним payload — `order` поедет в нём), мобильный экран папок (порядок приходит из массива).
- **готово когда**: `npm run check` зелёный, `npm run build` проходит, `e2e/folder_tree_dnd.spec.ts` и `e2e/folder_options.spec.ts` зелёные, скриншот дропа и @-меню в `test-results/screenshots/`.
- **уже выяснили**: состав папок = директории на диске (`folderMetaFor`), `state.json` хранит только метаданные → порядок живёт в `order` метаданных и применяется при скане. Синк папки шлёт целиком (`payload: folder`, hash от `JSON.stringify`), поэтому `order` доедет без правок релея. Drop заметок уже есть в `FolderTree` через `text/plain`, папки получат свой MIME, чтобы не конфликтовать.

---

после работы допиши: что оказалось не так, как думали, и что осталось.

## что оказалось не так

- порядок нельзя хранить только в памяти: `folderMetaFor` собирает список из директорий заново, поэтому `order` добавлен в метаданные папки (`state.json`) и читается в `toFolderMeta`. Синк папки едет целым payload, так что поле доехало без правок релея.
- outbox склеивает операции по `(kind, id)`: upsert перемещённой папки выбивал `rename` из очереди, и перенос между родителями не уезжал. Теперь `order` кладётся прямо в payload rename, а `applyFolderOrder` не трогает переехавшую папку; `pushBundle` не пакует upsert для пути, который уже едет rename'ом (иначе на приёмнике две ветки по одному пути).
- зона «в корень» сначала была бутафорией: обработчики висели на контейнере высотой в строки, а пустое место под деревом принадлежало скроллеру. Дерево растянуто (`flex-1` в Sidebar + корень дерева), e2e теперь бросает папку через `elementFromPoint`, а не в сам элемент.
- `[data-folder-item]` мультиматчил ещё до этой задачи (коммит `6c53ff5`); поправлены `.first()` в `folder_composer.spec.ts` и `ui_refactor.spec.ts` (тот монтировал меню напрямую и передавал `folders`, теперь `rows`).
- `npm run check` не видит `e2e/`: контракт `FolderSuggestionMenu` ловится только прогоном playwright.

## что осталось

- известные красные не из этой задачи (проверены на чистом HEAD через `git stash`): `e2e/slag/folder_profile.spec.ts` → «description saves inline and survives a reload», `e2e/hotkeys.spec.ts` → 11 «Quick Composer Island typing and Enter submission».
- в вебе (indexedDB) `persistFolders` — пустышка, поэтому ручной порядок и описания папок живут только в Tauri-хранилище; веб-e2e проверяет порядок в пределах сессии.
- нет двухдевайсного теста «перетащил папку в другую → на втором устройстве одна ветка». `moveFolderTree` юнит-тестом не покрыт: модуль тянет `@tauri-apps/api/core` в рантайме, а `node --test` этого не переварит; чистая часть (`moveFolderPaths`) покрыта `scripts/folder-tree.test.mjs`.
