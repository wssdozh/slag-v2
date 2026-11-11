# декомпозиция god-файлов по ответственности

## итог

| файл | было | стало | вердикт |
|---|---:|---:|---|
| `context/AppContext.tsx` | 1740 | **995** | 8 модулей |
| `lib/storage/index.ts` | 1591 | **966** | 4 слоя, включая диск |
| `components/Feed/Composer.tsx` | 1211 | 1093 | файлы вынесены, дальше одна ответственность |
| `lib/sync/syncEngine.ts` | 1594 | 1554 | леджеры вынесены; бандл — см. ниже |
| `components/Feed/ItemCard.tsx` | 1151 | 1151 | не трогаем: 1048 из 1151 — разметка |

## вынесено

`context/`: `useOverlays`, `useMobileNav`, `feedView` + `useFeedView`, `useAssistant`, `useBackup`, `useAppearance`, `useRecurringRollover`, `appContext.types`.

`storage/`: `vaultFiles` (диск, 497 строк, контекст из 9 вопросов), `vaultTransfer`, `attachments`, `lib/vault/stats`.

`sync/`: `localBookkeeping`. `composer/`: `useComposerFiles`.

## открытый вопрос: `syncEngine` (1554)

настоящий монолит — не `applyIncomingBundle` (11 строк, очередь), а **`persistIncomingBundle`: 297 строк и 17 обращений к `this`**. он и есть «что значит пришедший бандл»: надгробия, поэтапный импорт, проход по вложениям, ack.

почему не вынесен сейчас: три попытки механического переноса срезали тело не там — границы метода по отступу ненадёжны, внутри тела есть строки, похожие на объявления. нужен счётчик фигурных скобок с учётом строк и шаблонов, а не поиск «следующего члена». по правилу проекта (три красных подряд — стоп) остановился, дерево зелёное.

следующая попытка: вынести `persistIncomingBundle` в `sync/applyBundle.ts` как функцию от `engine`, открыв 17 членов, — тот же приём, что сработал с `VaultFiles`, но с честным парсером границ.

## проверки

`npm run check` — 0, `npm run build` — зелёный; e2e: `feed` 20/20 (шесть раз), `mobile` 21/21, `attach_sheet` 26/26, `recurring_streak` 23/23, `sync_attachment_transfer` 21/21 с feed, `assistant_layout`.

## заметки

- **`e2e/backup_restore.spec.ts`**: починен `goto`, вскрылся дефект — модалка настроек не закрывается по Escape после восстановления. похоже на реальный баг слоёв.
- **диск в e2e не проверяется**: в браузере `isTauri()` ложно, `flushItemToDisk` — no-op. правки в `VaultFiles` подтверждены только типами; для настоящей проверки нужен десктоп-билд.
- вынос с обёртками не считается.
