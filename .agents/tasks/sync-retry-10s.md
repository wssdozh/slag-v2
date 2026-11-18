# синхронизация: ретрай раз в 10 секунд и кнопка, которая снимает ошибку

- **цель**: упавший проход синка повторяется сам через 10 секунд, без нажатий. панель больше не висит с «Fetch is aborted» после того, как сервер уже ответил на `/health`.
- **трогаем**: `src/lib/sync/syncEngine.ts`, `src/lib/sync/errorText.ts` (новый), `src/config/sync.ts`, `src/components/Settings/SyncSettingsTab.tsx`, `e2e/sync_retry.spec.ts` (новый).
- **не трогаем**: `transport.ts` (у сокета свой бэкофф, он и так ≤15 с), `applyBundle.ts`, релеевое API — менять нечего, это клиентская политика повторов.
- **готово когда**: `npm run check` — `0 warnings and 0 errors`; `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/sync_retry.spec.ts` зелёный; полный `e2e/sync_*` + `initial_sync*` + `settings_consistency` без новых падений; скриншот `test-results/screenshots/sync-retry-status.png`.
- **уже выяснили**:
  - «Fetch is aborted» — это не сеть, а `AbortSignal.timeout`: в WebKit так выглядит любой таймаут `fetch`. такие ошибки приходят из pull (`pullTimeoutMs`, 30 с) и из push (`AbortSignal.timeout(30_000)`);
  - после падения init/pull/push никто не перезапускал проход: `autoSyncInterval` (15 с) тянет только когда сокет закрыт, а живой сокет с упавшим pull оставлял `status.error` навсегда;
  - кнопка «Обновить» звала `pushLocalChanges()`, а тот при `initialSync.state === 'error'` или «ничего не изменилось» выходит раньше, не трогая `status.error` — отсюда «сервер проверен», а красная строка на месте;
  - `initialSync.state === 'error'` блокирует пуш: выйти из него можно было только кнопкой на экране первичной загрузки (`retryInitialSync`).

---

после работы допиши: что оказалось не так, как думали, и что осталось.

---

оказалось не так:
- `retrySync` в тестах падал на `encrypt`: спеки подсовывают `activeVaultKey = {}`, а повтор заканчивается настоящим пушем. в спеке теперь генерится настоящий AES-GCM ключ.
- `e2e/sync_attachment_transfer.spec.ts` (`echoedBack`) и `e2e/sync_vault_isolation.spec.ts` (первый тест) падают и на чистом `main` — проверил через `git stash`. к этой правке отношения не имеют.

осталось:
- у `transport.ts` свой бэкофф реконнекта (5→15 с), он живёт отдельно от нового таймера. специально не сводил: сокет и HTTP-проход чинятся разными путями;
- ретрай фиксированный, без экспоненты — по просьбе «хотя бы раз в десять секунд». если релей лежит часами, это один запрос в 10 с, что для мобильного радио не бесплатно; при желании — выключать в эко-режиме.
