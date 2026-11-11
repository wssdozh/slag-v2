# декомпозиция god-файлов по ответственности

## итог

| файл | было | стало | вердикт |
|---|---:|---:|---|
| `context/AppContext.tsx` | 1740 | **995** | 8 модулей |
| `lib/storage/index.ts` | 1591 | **966** | 4 слоя, включая диск |
| `lib/sync/syncEngine.ts` | 1594 | **1252** | леджеры + слияние бандла |
| `components/Feed/Composer.tsx` | 1211 | 1094 | файлы вынесены, дальше одна форма |
| `components/Feed/ItemCard.tsx` | 1151 | 1151 | вид: 1048 из 1151 — разметка |
| `components/Mobile/MobileCalendarView.tsx` | 1105 | 1105 | вид: 1071 из 1105 — разметка |

## вынесено

`context/`: `useOverlays`, `useMobileNav`, `feedView` + `useFeedView`, `useAssistant`, `useBackup`, `useAppearance`, `useRecurringRollover`, `appContext.types`.

`storage/`: `vaultFiles` (диск, 497 строк, контекст из 9 вопросов), `vaultTransfer`, `attachments`, `lib/vault/stats`.

`sync/`: `localBookkeeping`, `applyBundle` (296 строк слияния), `attachmentSignature`.

`composer/`: `useComposerFiles`.

## почему три файла остаются большими

- `bip39Words` — словарь данных, читать его никто не должен.
- `ItemCard` и `MobileCalendarView` — 1048 и 1071 строк разметки на один вид. у каждого одна причина измениться — как он выглядит.
- `Composer` — «напечатал → разобрал → отправил» одна операция с общим состоянием; граница проведена там, где кончается платформа (файлы).

## что осталось в `syncEngine` (1252)

соединение (ws, интервалы, http), конфиг и авторизация, начальный синк, админ устройств, исходящая очередь. каждый кусок выносится тем же приёмом — контекст-объект, как в `VaultFiles` и `applyBundle`. следующий по очереди — конфиг и авторизация (~90 строк).

## проверки

`npm run check` — 0, `npm run build` — зелёный. e2e за проход: `feed` 20/20 (шесть раз), `mobile` 21/21, `attach_sheet` 26/26, `recurring_streak` 23/23, `sync_attachment_transfer`, `sync_drafts` 3/3, `assistant_layout`, `backup_restore`.

## заметки

- **три спека имели один и тот же дефект**: свой `goto` и 5-секундное ожидание против холодной трансляции vite (`backup_restore`, `assistant_layout`, `sync_drafts`). все переведены на ожидание `main` с широким бюджетом.
- **`backup_restore` вскрыл реальный дефект**: модалка настроек не закрывается по Escape после восстановления. не починено, записано.
- **диск в e2e не проверяется**: в браузере `isTauri()` ложно. правки `VaultFiles` подтверждены типами и сборкой; настоящая проверка — десктоп-билд.
- **урок про границы**: `applyIncomingBundle` оказался 11-строчной очередью, а монолит — `persistIncomingBundle`. искать монолит по имени «главного» метода нельзя, только по размеру. границы метода — по счётчику скобок, не по отступу.
