# черновики, чат, память и workspace — в state.json, а не в localStorage

- **цель**: всё, что относится к хранилищу, переживает «очистить данные webview»: черновики
  композера и полноэкранника, история чата ассистента, память ассистента и workspace state лежат
  в `vaults/<id>/state.json` секциями. у workspace остаётся один писатель вместо двух.
- **трогаем**: `src/lib/storage/settingsStore.ts`, `src/lib/backupService.ts`,
  `src/lib/storage/vaultTransfer.ts`, `src/lib/notify/assistant.ts`; новый чистый модуль
  `src/lib/storage/stateSections.ts` (формы секций и слияния), тест
  `scripts/state-sections.test.mjs`, один `await` в `src/main.tsx`.
- **не трогаем**: `src/lib/storage/index.ts`, `src/lib/storage/vaultFiles.ts` (двери
  `readStateSection` / `writeStateSection` / `flushStateToDisk` уже есть), `src/node/**`,
  `package.json`, `docs/CODE_MAP.md`, `scripts/no-localstorage.test.mjs`, `src/lib/storage/prefs.ts`.
- **готово когда**: `npm run check` — `0 warnings and 0 errors`;
  `node --test scripts/state-sections.test.mjs` зелёный; в четырёх файлах нет `localStorage.`;
  трещотка ругается ровно на их устаревшие строки в baseline.
- **уже выяснили**: `state.json` пишется только через `readStateObject` + `queueStateWrite`
  (`readStateSection` / `writeStateSection`), workspace — через `flushStateToDisk`; чтения
  синхронные (в `useState(() => …)`), значит нужен снимок в памяти и гидрирование в boot до
  первого рендера; `SettingsStoreHost` реализуется `StorageService`, а `index.ts` менять нельзя —
  интерфейс описывает то, что там уже есть (`files` и его три метода).

---

## раскладка

| что | секция `state.json` | форма |
|---|---|---|
| черновики композера и полноэкранника | `drafts` | `{ composer: Record<folderPath, ComposerDraft>, fullscreen: Record<itemId, FullscreenDraft> }` |
| история чата ассистента + тред телеграм-бота | `chat` | `{ messages: ChatMessage[], telegram: [{ role, content }] }` |
| память ассистента | `memory` | `{ items: MemoryItem[] }` |
| workspace state | `workspace` | сам `WorkspaceState` (его уже писал `flushStateToDisk`) |
| штампы разовой миграции | `migrations` | `{ legacyAt?: number, telegramAt?: number }` |

секция принадлежит одному хранилищу, поэтому идентификатор хранилища в ней не лежит — адрес это файл.

## дебаунс

очередь одна на всё (`writeQueue`): набор грязных секций, события черновиков, стёртые слоты и
один таймер на `WRITE_WINDOW_MS = 400`. первая запись после окна уходит сразу, следующие
сливаются в окно; `flushDraftWrites` (его зовут композер, редактор, `pagehide`, `blur`,
`visibilitychange`) закрывает окно досрочно. новых таймеров нет — это та же `draftQueue`, только
теперь она пишет не в `localStorage`, а секции, и знает про `chat`/`memory`/`workspace`/`migrations`.

## что оказалось не так

- **«сначала файл, потом удаление ключа» пришлось заменить штампом.** удалить ключ — значит
  записать в `localStorage`, а из этих четырёх файлов запись уходит совсем (условие задачи).
  поэтому после успешной записи секций пишется `migrations.legacyAt`, и со следующего старта
  старые ключи не читаются вовсе. порядок тот же по смыслу: сначала файл (иначе при падении
  посередине текст остался бы только в ключе, который мы больше не читаем), потом отметка «миграция
  сделана». без отметки стёртый после переезда черновик воскресал бы из старого блоба при каждом
  старте. сами ключи дочистит волна 3 (`compactLocalStorage` в `vaultFiles`).
- **полноэкранные черновики лежат по ключу на заметку**, и перечислить их иначе как списком
  ключей профиля нельзя: `Object.keys(localStorage)` — единственное, что осталось от профиля в
  `settingsStore`, и это только чтение. писателей `localStorage` в файлах нет.
- **ключ треда телеграма — это sync id, а не id хранилища** (`ensureVaultSyncId` у
  `default_vault` даёт `vault_<uuid>`). при гидрировании его не узнать, поэтому тред мигрирует
  лениво, на первом чтении, под своим штампом `telegramAt`; `/clear` ставит штамп сразу, чтобы
  старый ключ не вернул переписку.
- **`persistWorkspace()` из плана не появился отдельным методом**: `StorageService` (файл
  другого агента) уже отдаёт `files.flushStateToDisk()`, и интерфейс хоста описывает именно его.
  придумывать рядом второй метод значило бы менять `index.ts` или прятать обёртку.
- **дебаунс стал асинхронным.** `flushDraftWrites` больше не гарантирует, что текст на диске к
  моменту возврата: запись файла — `Promise`. `pagehide`/`blur` остаются лучшим, что есть, но
  последние 400 мс перед закрытием окна могут не доехать; раньше их спасал синхронный `setItem`.
- **гидрирование async, а первый рендер синхронный.** добавлен `await hydrateSettings(storage)` в
  `boot()` — без него первый рендер видел дефолты (и композер открывался пустым, хотя черновик в
  файле). это единственная правка вне четырёх файлов: `src/main.tsx`, три строки.
- **переключение хранилища** идёт через `storage.switchVault()`, который синхронный: `useVaults`
  сразу читает workspace нового хранилища, а гидрирование ещё не вернулось. частичные изменения
  workspace за это время буферизуются (`pendingWorkspace`) и накатываются поверх того, что
  сказал файл, — иначе первый клик затёр бы workspace дефолтами. но сам первый рендер после
  переключения может показать дефолтную папку; правильный фикс — `await` гидрирования в
  `switchVault`/`useVaults`, а это чужие файлы.
- **`vaultTransfer` не может передать `store`**: `VaultImportIo` собирается в `index.ts`, а
  `importVaultPayload` синхронный. поэтому `replaceComposerDrafts` берёт зарегистрированный
  `loadedStore` (его ставит конструктор сервиса) — единственная скрытая зависимость в модуле,
  и она подписана.
- **`npm run build` падает только на node-шаге**: `MISSING_EXPORT "rename" is not exported by
  src/node/stubs/tauriFs.ts` — стаб `plugin-fs` без `rename`, который приносит `prefs` в
  headless-сборку. известный блокер, фикс у ветки `prefs-callers`; tsc, web- и mcp-сборки зелёные.
- восстановление бэкапа теперь заменяет карту черновиков целиком (`replaceDrafts`), а не
  мержится с файлом: старый код перезаписывал ключ, и «восстановить» не должно оставлять чужие
  черновики.
- **в браузерной сборке запись теперь на микрозадачу позже `localStorage`.** писать в профиль
  прямо из этих файлов нельзя (условие задачи), а `setPref` кладёт значение в память сразу и
  доезжает до `localStorage` следующим микротаском. приложение читает через `prefs` и этого не
  замечает, но внешний читатель в том же тике видит старое значение. отсюда ровно два красных
  теста в `e2e/adversarial_memory_edges.spec.ts` (5 и 6 читают `localStorage` сразу после
  `memoryService.remember`) — лечится `expect.poll` в спеке, это не мои файлы. остальные красные
  спеки памяти (`assistant_memory`, `adversarial_memory_time`, `adversarial_memory_contradictions`)
  падают и на базе `91c7e11` — проверено отдельным worktree, к этой задаче отношения не имеют.
  `e2e/attach_sheet.spec.ts` (черновики, переживание перезагрузки) — 7/7 зелёные.

## что осталось

- старые ключи (`slag_drafts_*`, `slag_fullscreen_draft_*`, `slag_assistant_*`, `slag_memory_*`,
  `slag_workspace_state_*`, `slag_tg_history_*`) физически лежат в профиле до волны 3.
- `AppContext` не перечитывает workspace после гидрирования (см. переключение хранилища).
- `scripts/no-localstorage.test.mjs` красит вторую проверку на четырёх строках baseline — список
  сокращает оркестратор.
- `scripts/state-sections.test.mjs` не входит в `test:scripts` (`package.json` не наш).
- два теста в `e2e/adversarial_memory_edges.spec.ts` ждут синхронной записи в профиль — им нужен
  `expect.poll` (см. выше).
