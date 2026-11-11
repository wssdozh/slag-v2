# декомпозиция god-файлов по ответственности

- **цель**: каждый файл отвечает за одну причину измениться; в `src/` нет файла >1000 строк, кроме `bip39Words.ts` (данные)
- **трогаем**: `lib/storage`, `lib/sync`, `context`, `components/Feed/Composer`
- **не трогаем**: `ItemCard.tsx` (1048 из 1150 — разметка одного вида), `localFallback.ts`
- **готово когда**: `npm run check` зелёный, зоны e2e не хуже замера, `AppContextType` не изменился

## сделано

| что | куда | было → стало |
|---|---|---|
| `getVaultStats`, `getAllExistingTags` | `lib/vault/stats.ts` | отчёты отделены от персистенса |
| `exportVaultAsJson`, `importVaultData`, `importVaultFromJson`, `exportObsidianBundle` | `storage/vaultTransfer.ts` | формат обмена отделён от записи на диск |
| байты вложений: 4 кеша, 8 методов, disk-фоллбеки | `storage/attachments.ts` | `AttachmentStore` |
| три леджера дедупа: `sentHashes`, `syncedIds`, `tombstones` | `sync/localBookkeeping.ts` | 9 методов → модуль |
| обёртки-делегаты после выноса | удалены | файл зовёт модуль, а не свой приватный форвардер |

`storage/index.ts` 1591 → 1365, `syncEngine.ts` 1594 → 1553.
проверено: `npm run check` 0, `feed.spec.ts` + `sync_attachment_transfer.spec.ts` 21/21.

## осталось, по порядку

1. `storage/index.ts` (1365): `vaultFiles.ts` — раскладка на диске, filename claiming, tauri-fs, скан, flush/remove (~450 строк, самая рискованная часть, трогает запись заметок); `vaultRegistry.ts` — создание/переключение/удаление хранилищ (~190). CRUD записей и индексный кеш остаются вместе: `saveItem` = файл + кеш + событие.
2. `sync/syncEngine.ts` (1553): `bundleApplier.ts` + `BundleContext` на 8–10 членов (`applyIncomingBundle` трогает 38 членов класса — вот где настоящая работа), `authConfig.ts`.
3. `components/Feed/Composer.tsx` (1211): `useComposerFiles` (drag&drop, вставка), `useComposerSubmit` (guard от дубля, вложения, авто-отправка), `useComposerEditing` (ввод, слэш-команды).
4. `context/AppContext.tsx` (1739): `useOverlays` → `useMobileNav` → `useAssistant` → `useFeedView` → `useVault` → `useAppWiring`.

## выученное по ходу

- **вынос с обёртками ничего не даёт**: первый заход в `syncEngine` добавил модуль и оставил 9 приватных форвардеров — файл стал короче на 10 строк. после удаления обёрток и правки call-site'ов стало −42. выносить надо вместе с вызовами.
- `applyIncomingBundle` (592 строки) не «метод не там лежит», а «класс держит 38 зависимостей»: сначала надо сузить интерфейс, потом переносить.
- первый спек прогона платит ~80 с за холодную трансляцию vite; бюджет поднят, тесты зелёные.
