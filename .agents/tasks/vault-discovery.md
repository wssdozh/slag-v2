# доскан хранилищ: список из localStorage добираем с диска

- **цель**: после старта на нативной сборке в списке хранилищ видны все каталоги из `AppData/vaults/`, даже если профиль webview вычистили снаружи и осталась только `default_vault` → `vaults/main`. Правило — union: найденный каталог только добавляет хранилище, пропавший каталог ничего не удаляет.
- **трогаем**:
  - `src/lib/storage/vaultDiscovery.ts` — новый чистый модуль, `mergeDiscoveredVaults(stored, dirs)`, без `@tauri-apps/*`, чтобы гонялся `node --test` по `.ts`;
  - `src/context/hooks/useVaults.ts` — эффект: на `isTauri()` читает `vaults/`, фильтрует каталоги, мержит с реестром, при изменениях `setVaults` + запись в `slag_vaults_v2`; ошибки чтения — warn и живём дальше;
  - `scripts/vault-discovery.test.mjs` — `node:test` на чистую функцию;
  - `.agents/tasks/vault-discovery.md` — этот файл.
- **не трогаем**: `src/lib/storage/vaultRegistry.ts` (пишем тем же ключом, что реестр, но API не расширяем), `package.json` (тест впишет оркестратор), `docs/CODE_MAP.md` (генерится), удаление хранилищ (явный поток `deleteVault`), основную копию репозитория и чужие worktree.
- **готово когда**: `node --test scripts/vault-discovery.test.mjs` зелёный; `npm run check` — две строки, `0 warnings and 0 errors`.
- **уже выяснили**:
  - каталог `default_vault` — это `vaults/main` (`VaultFiles.getVaultDir`), поэтому `main` в `dirs` не новое хранилище;
  - список и текущее хранилище живут только в localStorage (`STORAGE_KEYS.VAULTS` = `slag_vaults_v2`, `STORAGE_KEYS.CURRENT_VAULT`);
  - `storage.getVaults()` при пустом/битом реестре отдаёт `[currentVault]`, так что `default_vault` в списке будет даже после полной зачистки профиля;
  - эффекта `setVaults(storage.getVaults())` в `useVaults.ts` на базе `ad75cdd` нет — он есть только в `refreshData` внутри `AppContext.tsx`; эффект пришлось завести в хуке с нуля.

---

## после работы

- **эффект в хуке, а не готовый.** В задаче он описан как уже существующий, но на `ad75cdd` его в `useVaults.ts` нет. Завёл новый `useEffect` с зависимостью `[setVaults]`: читает `storage.getVaults()` (свежий реестр, не стейт) и `readDir` по `vaults/`, поэтому повторный прогон в StrictMode и во втором окне ничего не ломает — второй проход видит те же id.
- **`readDir` пришлось звать из хука.** Инвариант 1 `AGENTS.md` держит `@tauri-apps/*` в `src/lib/*`, но задача явно назвала точку вызова и I/O, а чистый модуль обязан остаться без tauri ради `node --test`. Чтобы не заводить пятый файл, `isTauri`/`readDir`/`BaseDirectory` импортированы в `useVaults.ts`. Если это режет глаз ревью — правильное место для скана `src/lib/storage/vaultRegistry.ts`, но это уже не минимальный дифф.
- **запись мимо реестра.** Готового «сохранить весь список» в `vaultRegistry` нет (`saveVaultMeta` пишет по одному и переставляет запись в конец), а `saveVaultMeta` в цикле ещё и сорвал бы «порядок существующих записей не меняется». Поэтому список пишется целиком тем же способом, что и в реестре: `localStorage.setItem(STORAGE_KEYS.VAULTS, JSON.stringify(merged))`.
- **изменения считаем по длине.** Union только добавляет, так что `merged.length === stored.length` — «ничего нового», и в localStorage ничего не пишем.
- **осталось**: если каталог хранилища переименовали снаружи, union заведёт второе хранилище и старое останется — по правилу «ничего не удаляем» это ожидаемо; чистит пользователь через удаление хранилища.
