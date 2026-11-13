# headless-нода slag на raspberry pi «pet»

- **цель**: `dist/node/index.js` крутится на пи под systemd, держит хранилище в `~/vaults/slag` и постоянно синкается с релеем; вход — штатный `accountClient.login` с подтверждением устройства в приложении.
- **трогаем**: `src/lib/storage/port.ts` (новый), `src/lib/storage/browserPort.ts` (новый), `src/lib/sync/{pushBundle,applyBundle,syncEngine,syncConfig}.ts` (только `storage.` → `vault().`), `src/node/**` (новый), `vite.node.config.ts` (новый), `package.json` (скрипты `build:node`, `node`).
- **не трогаем**: `src/lib/storage/index.ts` (740 строк, работает), `src/components/**`, протокол синка, `relay/`, `src/mcp`.
- **готово когда**: `npm run check`, `npm run build`, `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/slag/sync_*.spec.ts` зелёные; на пи `systemctl --user status slag-node` active и в логе `Sync WebSocket connected`; заметка с телефона появляется в папке.

## уже выяснили

- синк-граф (`src/lib/sync/*`) не тянет react/tauri, кроме `isPrimaryWindow` в `syncEngine.init()`. `isPrimaryWindow` возвращает `true`, если `!isTauri()` → в node-сборке хватает алиаса `@tauri-apps/api/*` на стаб с `isTauri: () => false`. **правка движка не нужна.**
- браузерный граф трогать не надо: `port.ts` импортирует `browserPort.ts`, а node-сборка заменяет `browserPort.ts` алиасом на стаб. так регистрация порта не зависит от порядка импортов.
- синк дёргает ровно 18 методов стораджа (список в `src/lib/storage/port.ts`), из них 5 — черновики (ноде отдают пустоту).
- `localStorage` — единственная DOM-зависимость ядра: `localBookkeeping`, `syncConfig`, `outbox`, `syncEngine`, `applyBundle`. шим ставится до первого импорта движка.
- `receive-only` уже в протоколе: `pushBundle.ts` L36 не пушит, `applyBundle.ts` L89 игнорирует мутации от таких устройств, права приезжают грантом (`deviceAdmin.ts` L35).
- вход: `accountClient.login(seed, serverUrl, device)` → `pending_device` → подтверждение в приложении → `/api/auth/device-requests/{id}/complete` → токен в `secretStore`. `http://152.53.199.71:8320` уже в белом списке (account.ts L80).

---

(дописывается по ходу)
