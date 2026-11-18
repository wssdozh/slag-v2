# один код вместо двух копий: ветка B аудита, дубляж

- **цель**: каждая из перечисленных ниже пар/троек — одна реализация; поведение, имена и формы
  данных остаются прежними, тесты `syncSection`/`tombstones` и `stateSections` зелёные.
- **трогаем**: `src/lib/storage/settingsStore.ts`, `src/lib/storage/legacyProfile.ts`,
  `src/lib/storage/stateSections.ts`, `src/lib/storage/legacyJson.ts` (новый),
  `src/lib/storage/prefsBackend.native.ts`, `src/lib/platform/secretFileBackend.ts`,
  `src/lib/platform/encryptedLocalStore.ts`, `src/lib/platform/writeJsonAtomic.ts` (новый),
  `src/lib/platform/secretEnvelope.ts` (новый), `src/lib/sync/syncSection.ts`,
  `scripts/sync-state.test.mjs`.
- **не трогаем**: `src/lib/sync/localBookkeeping.ts`, `src/lib/logger/logger.ts`,
  `src/lib/storage/prefs.ts`, `src/lib/storage/index.ts`, `src/lib/platform/secretStore.ts` —
  их правит другая ветка. `package.json`, `docs/CODE_MAP.md`.
- **готово когда**: `npm run check` = «0 warnings and 0 errors», `npm run build` четыре шага,
  `npm run test:scripts` зелёный, `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/quick_shots.spec.ts
  e2e/sync_delete.spec.ts` зелёный.
- **уже выяснили**:
  - `writeJsonAtomic` нужен и `storage/prefsBackend.native.ts`, и `platform/secretFileBackend.ts`;
    оба и так тянут `@tauri-apps/plugin-fs`, так что общий хелпер в `src/lib/platform/` ничего
    нового в бандл не приносит. Обратное (хелпер в `storage/`) заставило бы `platform` тянуть
    `storage` — направления импортов в репо уже есть оба, но файловая примитива — это platform.
  - AES-конверт в двух файлах сверен: допустимые поля идентичны (`v === 1`, `iv: string`,
    `data: string`, лишние поля игнорируются, возвращается нормализованный `{v, iv, data}`),
    так что разбор сводится; отличается только то, что браузерная копия сначала делает
    `JSON.parse` и логирует — это остаётся тонкой обёрткой над общим `readEnvelope`.
  - `mergeIds`/`mergeOutbox`: текущая семантика — первый по порядку выигрывает (и
    `sanitizeIds`/`sanitizeOutbox` внутри каждой стороны уже снимают дубли). Через `Set`/`Map`
    выходит короче и порядок тот же; «последний перезаписывает» — не прежнее поведение, поэтому
    не делаем.

---

## что оказалось не так

- `parseLegacyJson` не был тремя идентичными копиями: в `legacyProfile.ts` он логировал
  нечитаемое значение, в `settingsStore.ts` и `localBookkeeping.ts` молчал. Общая функция
  поэтому принимает необязательный `onInvalid`, и `legacyProfile` отдаёт туда свой `fsWarn` —
  иначе ветка потеряла бы строку в логе.
- третью копию в `localBookkeeping.ts` и `writeVerified` не свёл: `localBookkeeping` правит
  другая ветка, а `writeVerified` без её файла остаётся с одним потребителем — вынос был бы
  обёрткой. `structuredClone` из `logger.ts` по той же причине не трогал.
- AES-конверты сверены: допустимые поля одинаковые (`v === 1`, `iv`/`data` — строки, лишние
  поля игнорируются, на выходе нормализованный `{v, iv, data}`). Разница только в том, что
  браузерная копия сначала делает `JSON.parse` и пишет варнинг. Поэтому общий
  `readEnvelope(value: unknown)`, а `JSON.parse` с логом остался обёрткой в
  `encryptedLocalStore.ts`.
- место для `readEnvelope` пришлось сделать отдельным модулем: `secretFileBackend.ts` тянет
  `@tauri-apps/plugin-fs` на верхнем уровне, а `encryptedLocalStore.ts` импортировал оттуда
  только типы — именно чтобы не втащить плагин в web-бандл. `platform/secretEnvelope.ts`
  Tauri-free, обратная зависимость была бы регрессом сборки.
- «дубли по `opId` перезаписываются последним» из задачи не совпало с текущим кодом:
  `sanitizeOutbox` внутри каждой стороны оставляет первое вхождение, и слияние тоже первое.
  Оставил first-wins (это и есть прежнее поведение) и добавил тест на порядок и на то, что
  копия из файла выигрывает: `mergeOutbox` тестом не покрывался вообще.
- шапка `stateSections.ts` утверждала, что имён секций тут нет; после `STATE_SECTIONS` это
  неправда — шапку поправил.
- `docs/CODE_MAP.md` не перегенерён (по условию): три новых модуля появятся в карте на
  следующем `npm run map:code`.

## проверки

- `npm run check` — `0 warnings and 0 errors`.
- `npm run build` — tsc app + tsc node + vite web + mcp + node, exit 0.
- `npm run test:scripts` — 109 pass, 0 fail, 1 skipped (было 108/0/1: +1 мой тест на outbox).
- `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/quick_shots.spec.ts e2e/sync_delete.spec.ts` —
  5 passed.
