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

## что осталось в `syncEngine` (1252) и почему пауза

остались: соединение (ws, интервалы, http), конфиг и авторизация, начальный синк, админ устройств, **`pushLocalChanges` — 271 строка, 22 члена**.

`pushLocalChanges` вынести не удалось дважды: счётчик скобок обрывается раньше времени — внутри тела есть шаблонные строки и вложенные блоки, которые мой ручной токенизатор разбирает неверно. по правилу проекта остановился, дерево зелёное.

**решение на следующий заход**: не считать скобки руками, а взять `typescript` (он уже в зависимостях) и найти границы узла через `ts.createSourceFile` → `node.getEnd()`. это даст точный диапазон метода без эвристик, и приём переиспользуется для любых будущих разрезов.

## проверки

`npm run check` — 0, `npm run build` — зелёный. финальный прогон: `feed` + `mobile` — **41/41**. раннее за сессию: `attach_sheet` 26/26, `recurring_streak` 23/23, `sync_drafts` 3/3, `sync_attachment_transfer`, `assistant_layout`, `backup_restore`.

## заметки

- три спека имели один дефект: свой `goto` и 5-секундное ожидание против холодной трансляции vite. все три переведены на ожидание `main`.
- `backup_restore` вскрыл реальный дефект: модалка настроек не закрывается по Escape после восстановления.
- диск в e2e не проверяется (в браузере `isTauri()` ложно); правки `VaultFiles` подтверждены типами и сборкой, настоящая проверка — десктоп-билд.
- уроки: монолит ищется по размеру, а не по имени; границы метода — только через парсер.
