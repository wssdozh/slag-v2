# чистка мёртвого кода и легаси без изменения поведения

- **цель**: из `src/` убрано то, что никто не зовёт: мёртвые экспорты, осиротевший модуль, реэкспорт ради одной строки. `npm run check` и `npm run build` зелёные, поведение прежнее.
- **трогаем**: `src/config/*`, `src/lib/ai/*`, `src/lib/media/*`, `src/lib/storage/index.ts`, `src/lib/sync/*`, `src/lib/windowControls.ts`, `src/styles/theme.ts`, `src/lib/ai/localFallback.ts`.
- **не трогаем**: `docs/`, `e2e/`, `scripts/`, `src-tauri/`, `package.json`; всё, что зовут из `e2e/` (спеки вне `tsc`, компилятор их не прикрывает); `src/mcp/index.ts`, `src/main.tsx`, `src/App.tsx`, `demo.tsx` (вход через `demo.html`).
- **готово когда**: `npm run check` — tsc молчит, oxlint `Found 0 warnings and 0 errors.`; `npm run build` — зелёный; `git status --short` — только файлы этой задачи.
- **уже выяснили**:
  - `npm run where` сканирует только `src/` и `e2e/`; правду про `scripts/`, `*.config.ts`, `demo.html` даёт греп по всему репо.
  - `demo.tsx` — 0 импортёров по карте, но живой: `demo.html` грузит его как второй entry.
  - `twoFactorAuth.ts` целиком не мёртв: его зовёт `e2e/two_factor_auth.spec.ts`, поэтому файл остаётся, выпиливаются только пасскеи.
  - `PRIORITY_LABELS` объявлен дважды (`hooks/useItemActions.ts`, `lib/taskUtils.ts`) с разными словарями: в первом «Срочный/Высокий/Средний», во втором «Высокий/Средний/Низкий». Оба живые, словари не совпадают — не трогаем, это смена подписей, а не мёртвый код.

---

после работы: что оказалось не так, как думали, и что осталось — дописать сюда же.

## что сделано

18 файлов, −347/+3 строки, два файла удалены. Каждый кандидат проверен `npm run where` + грепом по всему репо (включая `e2e/`, `scripts/`, `*.config.ts`, `demo.html`).

- **мёртвые экспорты** (0 импортов, 0 упоминаний в репо, 0 использований в своём файле): `SPECIAL_DIRS`, `VISUAL_PRIORITIES`, `ExecutedToolCall`, `isDeviceGalleryAvailable`, `getDevicePublicKey`, `sendPairingPayload`, `registerPasskey`, `verifyPasskey`, `updateDetachedWindowBounds`, `restoreDetachedWindows`, `setSubscriptionPlan`, `setDeviceAiLease`, `setDeviceAiLeaseInConfig`, `setCallbacks`, `isAny2FaEnabled`, `DEFAULT_ITEMS`.
- **недостижимые методы сервисов** (0 call sites во всём репо; `tsc` их не видит, потому что это члены экспортируемых классов): `StorageService.saveVaultMeta`, `emptyTrash`, `getVaultTrashPath`, `exportObsidianBundle` → вместе с ними ушли `purgeTrash` в `trashStore` и `exportObsidianBundle` в `vaultTransfer` (единственный потребитель — тот самый мёртвый форвардер). Фичи «очистить корзину» в UI нет вообще: ни одна спека и ни один компонент не зовут `emptyTrash`; `purgeTrash` не звал никто никогда.
- **осиротевший модуль**: `src/styles/theme.ts` (43 строки, 0 импортёров, только `THEME_COLORS`/`ThemeColorKey`; CSS-токены живут в `theme.css` и на месте).
- **реэкспорт ради одной строки**: `src/lib/ai/localFallback.ts` (`export { … } from './fallback'`), его единственный потребитель `orchestrator.ts` переведён на `./fallback` — без файла-прослойки.
- **дубль типа**: `FolderMediaTabId` был объявлен дважды одинаковым union'ом — в `types/index.ts` и в `FolderMediaTabs.tsx`; локальная копия заменена импортом доменного типа.

## что оказалось не так, как думали

- «Пассивные» мёртвые методы не ловятся ни `tsc`, ни oxlint: `saveVaultMeta`/`emptyTrash`/`exportObsidianBundle` — публичные члены экспортируемого класса, поэтому пришлось вычитывать call sites (`\.method(`) по всему репо. `setDeviceAiLease` тянул за собой `setDeviceAiLeaseInConfig` — цепочка из двух файлов.
- `getVaultTrashPath` у `VaultFiles` живой (его зовут четыре места внутри), а такой же форвардер у `StorageService` — мёртвый. Одинаковое имя в двух классах даёт ложные «живые» попадания при грепе по `.имя` — проверять по каждому классу отдельно.
- `PRIORITY_LABELS` — не дубль-ошибка, а два разных словаря (см. выше). Оставлено.
- `docs/CODE_MAP.md` теперь врёт про удалённые символы, но `docs/` трогать нельзя; пересоздаётся `npm run map:code`.

## что осталось (сознательно не трогал)

1. **`AppContextType` — 6 полей без потребителей**: `sidebarWidth`, `rightPanelWidth`, `setSortBy`, `setSortOrder`, `setIsFolderViewModalOpen`, `refreshBackupSnapshots`. Последние четыре — чистая поверхность (снаружи не зовут, внутри хуков живут своей жизнью). Ширины панелей — мёртвая фича целиком: их пишут (`UiSettingsTab` → «Сбросить размеры») и хранят в localStorage, но ни один компонент не читает; удаление меняет видимый UI, поэтому это не чистка мёртвого кода, а решение по продукту. `AppContext.tsx` — общий файл, его параллельно трогает другой шов.
2. **`emptyTrash`/`trashStore`**: тип `StorageChangeEvent` всё ещё знает `action: 'purge'`, хотя эмитить его больше некому. Чистить — значит лезть в контракт синка (`SyncOperation`), это уже не мёртвый код, а модель.
3. **Дубли «по полям»** (не тронуты, домены разные, слияние только свяжет компоненты): `AudioRecorderProps` == `VideoRecorderProps`, `DropPreviewRect` == `EditorPaneRect`, `SparklineProps` == `BarChartProps`.
4. **`export` у символов, которые используются только в своём файле** (~150 штук, почти все `*Props`): символ живой, мёртвая только его внешняя видимость. Массовое снятие `export` — шум на полтораста файлов, а `Fast Refresh` от этого не чинится. Оставлено.

