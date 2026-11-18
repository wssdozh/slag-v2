# API-ключи провайдеров ИИ уезжают из localStorage в secret store

- **цель**: в `slag_ai_settings_v2` больше нет `apiKey`; ключ соединения живёт в secret store под именем `ai-key:<connection.id>`, а `loadAiSettings()` по-прежнему синхронно отдаёт настройки с ключами в памяти, чтобы `isConnectionReady` / `isConnectionReadyFor` работали как раньше. Старые плейнтекст-ключи переносятся одноразовой миграцией при старте.
- **трогаем**:
  - `src/lib/ai/connections/secrets.ts` (новый, чистые функции: `stripAiKeys`, `takeAiKeys`, `applyAiKeys`, `splitAiKeys`, `aiKeySecretName`)
  - `src/lib/ai/connections/settings.ts` — `loadAiSettings()` читает localStorage, ключи выкидывает, подставляет из `getCachedSecret`
  - `src/lib/platform/secretStore.ts` — `SECRET_KEYS.aiKey`, preload по id соединений, миграция плейнтекста, мягкое падение `os → local`
  - `src/context/AppContext.tsx` — только тело `saveAiSettings`
  - `scripts/ai-keys-secret.test.mjs` (новый)
- **не трогаем**: `package.json` (скрипт теста вписывает оркестратор), `docs/CODE_MAP.md`, интерфейс `AiConnection`/`AiSettings` в `src/types/index.ts`, остальной `AppContext.tsx`, формат legacy-плоских настроек (`groqApiKey` и т.п.) — он чистится первым же сохранением настроек.
- **готово когда**: `node --test scripts/ai-keys-secret.test.mjs` зелёный; `npm run check` — две строки, `0 warnings and 0 errors`; ключ не появляется в том, что уходит в localStorage; соединение без секрета читается как `apiKey: ''`.
- **уже выяснили**:
  - `main.tsx` ждёт `initSecretStore()` до рендера, значит на первом `loadAiSettings()` кеш тёплый.
  - Тест импортирует `.ts` напрямую, а node не умеет расширения-без-пути: чистые функции обязаны жить в модуле, где есть только `import type` (как `folderSource.ts`). Поэтому отдельный `secrets.ts`, а не всё в `settings.ts`.
  - `settings.ts` уже тянет `../../../config` без расширения — под plain node он не грузится, так что `loadAiSettings` остаётся там, а тест берёт только `secrets.ts`.
  - `@tauri-apps/api/core` в чистом модуле недопустим: `secretStore.ts` нельзя импортировать из тестируемого файла.

---

## что оказалось не так, как думали

- **Ключ из настроек не всегда можно стирать.** Если secret store отказывает в записи (браузер без рабочего IndexedDB), наивная схема «пишем без ключа + `void setSecret`» тихо теряет ключ. Поэтому `applyAiKeys` подставляет `lookup(...) ?? connection.apiKey` — плейнтекст в настройках остаётся запасным вариантом, — а `saveAiSettings` в `.catch()` неудачной записи возвращает настройки с ключами. Первый же удачный запуск миграции это самолечит.
- **`preload` падал на недоступном сторе и ронял весь бут.** `main.tsx` показывает панель «не удалось открыть защищённое хранилище» и приложение не рисуется — то есть до `saveAiSettings` дело не доходит. Миграция AI-ключей поэтому не бросает (`SecretMigrationError` остался только за синк-ключами): при отказе пишем warn и оставляем плейнтекст на месте.
- **`storedMode === 'os' && !os` действительно упирался в throw** — после сноса keychain или копирования каталога на другую машину синк блокировался целиком. Теперь это тот же путь, что у андроида: warn, `MODE_KEY` снимается, бэкенд — `local`.
- **Legacy-плоский JSON (`groqApiKey`, `kieApiKey`, `geminiApiKey`)** миграция не трогает: удалить из него ключи, не разобравшись в `provider`, значит потерять соединение вместе с `baseUrl`. Такие ключи живут до первого сохранения настроек, которое пишет уже новый формат без ключей; `normalizeAiSettings` в памяти их по-прежнему видит, и `applyAiKeys` их не затирает.
- **Отдельный `isSecretStoreAvailable()` не понадобился.** После успешного `initSecretStore` бэкенд есть всегда; единственный реальный отказ — асинхронная запись, её и ловим.
