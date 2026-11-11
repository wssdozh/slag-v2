# декомпозиция god-файлов по ответственности

- **цель**: каждый файл отвечает за одну причину измениться; в `src/` нет файла >1000 строк, кроме `bip39Words.ts` (данные)
- **трогаем**: `lib/storage`, `lib/sync`, `context`, `components/Feed/Composer`
- **не трогаем**: `ItemCard.tsx` (1048 из 1150 — разметка одного вида), `localFallback.ts`
- **готово когда**: `npm run check` зелёный, зоны e2e не хуже замера, `AppContextType` не изменился
- **уже выяснили**:
  - `ItemCard` = 103 строки логики + 1048 разметки → одна ответственность, не трогаем
  - `Composer` = 1140 логики → режем логику на хуки, разметку оставляем
  - `applyIncomingBundle` трогает 38 членов `syncEngine` → нужен узкий `BundleContext`, а не перенос строк
  - первый спек в прогоне платит ~80 с за холодную трансляцию vite (не баг кода)

## сделано

- `lib/storage/index.ts`: `getVaultStats`, `getAllExistingTags` → `lib/vault/stats.ts`
- `lib/storage/index.ts`: `exportVaultAsJson`, `importVaultData`, `importVaultFromJson`, `exportObsidianBundle` → `storage/vaultTransfer.ts`
- `playwright.config.ts`, `e2e/support/slagSetup.ts`: бюджет на холодный первый прогон (20/20 зелёные)

## осталось, по порядку

1. `storage/index.ts` (1523): `vaultRegistry.ts` — создание, переключение, удаление, мета; `vaultFiles.ts` — раскладка на диске, filename claiming, tauri-fs, вложения. CRUD записей и индексный кеш остаются вместе: `saveItem` = файл + кеш + событие, одна инвариантная операция.
2. `sync/syncEngine.ts` (1594): `localBookkeeping.ts` (ключи, `sentHashes`, `syncedIds`, `tombstones`), `authConfig.ts`, `bundleApplier.ts` + `BundleContext` на 8–10 членов.
3. `components/Feed/Composer.tsx` (1211): `useComposerEditing`, `useComposerFiles`, `useComposerSubmit`.
4. `context/AppContext.tsx` (1739): `useOverlays` → `useMobileNav` → `useAssistant` → `useFeedView` → `useVault` → `useAppWiring`. Первые два ни от чего не зависят, с них и начинать.

остановились на пункте 1: два разреза из четырёх в `storage`, дальше — по списку.
