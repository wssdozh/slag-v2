# перевести per-machine префы вызывающих на `prefs`

- **цель**: ширины, вид, док, мобильные табы, календарь, канал обновлений, окна, ширина промпта ИИ
  и сами настройки ИИ читаются и пишутся только через `src/lib/storage/prefs.ts`; в этих файлах не
  остаётся ни одного обращения к `localStorage`
- **трогаем**: `useAppearance`, `useMobileNav`, `useAppUpdates`, `useCalendarInteractions`,
  `useDockPanels`, `FeedColumnResizer`, `Composer`, `AiPromptModal`, `updateChannel`,
  `windowControls`, `saveAiSettings` в `AppContext`, `loadAiSettings` в `ai/connections/settings`,
  `aiConnectionIds` в `secretStore`, плюс `src/node/stubs/tauriFs.ts` (no-op `rename` для
  headless-сборки — согласовано с lead, отдельным коммитом)
- **не трогаем**: `package.json`, `docs/CODE_MAP.md`, `scripts/no-localstorage.test.mjs` (файл
  оркестратора), остальной `secretStore` (следующая волна), строки ключей в `STORAGE_KEYS`,
  `stripAiKeys` в `saveAiSettings`
- **готово когда**: `npm run check` — две строки, `0 warnings and 0 errors`;
  `npx playwright test e2e/quick_shots.spec.ts` зелёный; в 13 файлах нет `localStorage.`
- **уже выяснили**: `initPrefs()` ждётся в `boot()` до рендера, поэтому `getPref`/`getPrefJson`
  безопасно звать в `useState(() => ...)`; `getPrefJson` полностью заменяет `readStoredJson`
  (нет значения, битый JSON или `null` → fallback); бэкенд `prefs` принимает дельту, а не снапшот,
  поэтому фикстуры e2e в `localStorage` не перетираются; трещотка в `scripts/no-localstorage.test.mjs`
  покраснеет второй проверкой на вычеркнутых файлах — это ожидаемо до мержа

---

## что оказалось не так

- `prefs.ts` до этой волны не импортировал **никто**, поэтому node-сборка его не тянула. первый же
  импорт (`secretStore` и `ai/connections/settings`) вытащил `prefsBackend.native` в граф
  `config/vite.node.config.ts`, а тамошний стаб `src/node/stubs/tauriFs.ts` не экспортирует
  `rename` → `[MISSING_EXPORT]` и красный `npm run build` на третьем шаге. веб- и mcp-сборки
  зелёные. проверено `git stash` по `src`: baseline node-сборка зелёная, ломает именно волна;
  починила одна no-op строка `export async function rename(...)` в стабе — отдельный коммит
  `fix(node): the headless fs stub learns rename`, после неё полный `npm run build` (четыре шага)
  зелёный. из импортов `prefsBackend.native.ts` в стабе не хватало только `rename`; остальные
  (`BaseDirectory`, `exists`, `readTextFile`, `writeTextFile`) там уже были.
- `getPrefJson` не бросает и не отдаёт `null`, но и не валидирует форму. там, где раньше
  `JSON.parse` отдавал «что попало», понадобился `revive`: `useAppearance` (объект ли это),
  `useMobileNav` (`Array.isArray`, иначе вместо массива табов вернулся бы объект),
  `windowControls` (`Array.isArray` для реестра detached-окон).
- `useDockPanels` остался на `getPref` + `JSON.parse`, а не на `getPrefJson`: у сохранённой
  раскладки глубокая валидация с правкой `minimumWidth/maximumWidth` по каждому панели, и
  `revive` заменил бы только один `try`, оставив остальной разбор как есть.
- `windowControls`: `typeof window === 'undefined'` в трёх функциях реестра окон стоял только
  ради `localStorage`; `prefs` живёт в памяти, поэтому проверки убраны (это и есть «больше одной
  строки» в файле).
- `loadAiSettings`: `applyAiKeys` сам падает обратно на `connection.apiKey`, но ранний возврат
  `cloneDefaults()` при пустом значении оставлен как был — иначе дефолтная Groq-коннекция начала
  бы подтягивать ключ из прогретого кеша там, где раньше этого не делала.
- `secretStore`: `preload()` идёт после `await initPrefs()` в `main.tsx`, так что `aiConnectionIds`
  читает уже заполненную карту. в node-CLI `initPrefs()` не зовётся — там карта пустая и
  `loadAiSettings` отдаёт дефолты, ровно как раньше при `typeof localStorage === 'undefined'`.
- e2e (`quick_shots`, `theme_visual`) перегенерируют отслеживаемые картинки в
  `docs/screenshots/` — после прогона они откачены, в коммит не попали.

## что осталось

- `secretStore.ts` целиком не переехал: `MODE_KEY`, скан `localStorage.length`/`key(i)`,
  миграция ключей и `knownVaultIds` — следующая волна. из baseline он поэтому не вычёркивается.
