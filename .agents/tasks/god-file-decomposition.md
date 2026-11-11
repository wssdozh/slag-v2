# декомпозиция god-файлов по ответственности

- **цель**: каждый файл отвечает за одну причину измениться; в `src/` нет файла >1000 строк, кроме `bip39Words.ts` (данные)
- **трогаем**: `lib/storage`, `lib/sync`, `context`, `components/Feed/Composer`
- **не трогаем**: `ItemCard.tsx` (1048 из 1150 — разметка одного вида), `localFallback.ts`
- **готово когда**: `npm run check` зелёный, зоны e2e не хуже замера, `AppContextType` не изменился

## сделано

| файл | было | стало |
|---|---:|---:|
| `context/AppContext.tsx` | 1740 | **1242** |
| `lib/sync/syncEngine.ts` | 1594 | 1553 |
| `lib/storage/index.ts` | 1591 | 1366 |

вынесено:

| ответственность | модуль | меняется когда |
|---|---|---|
| отчёты по хранилищу | `lib/vault/stats.ts` | меняется таксономия |
| формат обмена (бэкап, obsidian-бандл) | `storage/vaultTransfer.ts` | меняется контракт обмена |
| байты вложений | `storage/attachments.ts` | меняется хранение медиа |
| леджеры дедупа синка | `sync/localBookkeeping.ts` | меняются правила «уже отправлено» |
| поверхности: модалки, лайтбокс, меню, тосты, confirm | `context/hooks/useOverlays.ts` | появляется новая поверхность |
| мобильная навигация | `context/hooks/useMobileNav.ts` | едет мобильный UX |
| правила ленты (чистая функция + хук) | `context/feed/feedView.ts`, `context/hooks/useFeedView.ts` | меняются правила показа |
| бэкап и восстановление | `context/hooks/useBackup.ts` | меняется формат бэкапа |

проверено по ходу: `feed.spec.ts` 20/20 (после каждой стадии), `mobile.spec.ts` 21/21, `sync_attachment_transfer.spec.ts` 1/1.

## осталось

1. `context/AppContext.tsx` (1242): `useAssistant` (чат, `aiSettings`, отправка), `useVault` (CRUD записей и папок), `useAppWiring` (эффекты: персистенс, события `storage`, полночь, хоткеи).
2. `components/Feed/Composer.tsx` (1212): `useComposerFiles`, `useComposerSubmit`, `useComposerEditing` — логика, разметка остаётся.
3. `lib/storage/index.ts` (1366): `vaultFiles.ts` (диск, ~450) и `vaultRegistry.ts` (~190).
4. `lib/sync/syncEngine.ts` (1553): `bundleApplier.ts` с узким `BundleContext` (38 зависимостей → 8–10) и `authConfig.ts`.

## заметки

- **`e2e/backup_restore.spec.ts` ненадёжен**: переведён на общий `setupSlag` и широкий таймаут (был свой `goto` на 60 с, который срезала холодная трансляция vite). после этого тест доходит до восстановления и падает на том, что модалка настроек не закрывается по Escape **после** восстановления. без моих правок он падает раньше, на открытии модалки. похоже на настоящий баг слоёв, а не на рефакторинг — проверить отдельно.
- вынос с обёртками не считается: если после переноса остались приватные форвардеры, файл не стал чище, а call-site'ы надо править.
- первый спек прогона платит ~80 с за холодную трансляцию vite; бюджет поднят до 120/180 с.
