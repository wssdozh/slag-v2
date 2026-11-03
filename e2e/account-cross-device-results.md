# изолированная проверка аккаунта windows ↔ linux

- дата: 2026-11-02; production: http://152.53.199.71:8320; `/health.authRequired=true`.
- запуск: `node e2e/account_cross_device.mjs`; windows chromium и linux chromium через ssh stdin/stdout rpc.
- существующие Vite `127.0.0.1:5173` на обеих машинах вернули 200; новые серверы не запускались.
- перед тестом перенесены только изменённые/новые implementation sources + package manifests, без git reset; исходно laptop clean ahead13. `pnpm install --frozen-lockfile` успешен.
- реальные vaults/main, seed и пользовательские файлы не читались и не менялись. использованы исключительно ephemeral `browser.newContext()` и новые синтетические vaults. даже default/main в тестовых контекстах не создавался.
- новый account seed находился только в памяти и шифрованном ssh stdin; stdout не содержит seed/token. разрешённый пользователем dev http включён через init-script localStorage flag.

## последний успешный прогон

```json
{
  "runId": "1793649086745-e6bea16e",
  "accountId": "acc_04e9563a64b1a7e061dc7717",
  "vaultId": "account-shared-1793649086745-e6bea16e",
  "ownerDevice": "host-1793649086745-e6bea16e",
  "guestDevice": "guest-1793649086745-e6bea16e",
  "pendingApproved": true,
  "encryptedGrant": true,
  "wrongDeviceRejected": true,
  "installed": "created",
  "sameIdMerge": "merged",
  "hostCount": 2,
  "guestCount": 2,
  "noteIds": ["guest-note-1793649086745-e6bea16e", "host-note-1793649086745-e6bea16e"],
  "isolatedOtherCounts": [0, 0],
  "defaultVaultCreated": false,
  "revoke": {
    "httpStatus": 403,
    "pushHttpStatus": 403,
    "localCount": 2,
    "localCountAfter": 2,
    "state": "idle",
    "error": "Хранилище хранится только на этом устройстве"
  },
  "success": true
}
```

- регистрация → login pending → approve → login authenticated подтверждены на реальном relay.
- encrypted vault key принимается гостем, другой device не может расшифровать envelope.
- windows note с кириллицей/emoji дошла до linux; linux изменил её и добавил вторую; на windows обе записи подтверждены.
- повторная установка того же sync id вернула `merged`, число vaults не изменилось.
- после revoke запрещены и GET bundles, и POST bundle (403); обе локальные записи сохранены, engine idle.
- финальный прогон завершил обе сессии через accountClient.logout; браузеры и ssh worker закрыты. созданные тестовые аккаунты/метаданные relay не удалялись.
- финальный syncEngine sha256 совпал на обеих машинах: `456f564d6f74314cedd809ae2dd227876dbee93c22304c966607a8a5ebf936b8`.

## диагностика разработки теста

первые два прогона дошли до install, но delivery timeout: Vite после HMR отдавал timestamped account module внутри syncEngine, тогда как harness импортировал bare module и создавал второй singleton. тест исправлен: используется точный transformed import graph vaultSharing → syncEngine → account → accountCrypto. implementation modules в рамках этой работы не изменялись. owner refresh после guest accept обновляет trusted allowedVaults, как это делает application polling.

фоновые jobs `pwsh-62c45653fb2c47ed` и `pwsh-c644be8273c344f6` собраны, оба завершены. финальные три успешных прогона завершились синхронно. после последнего переноса vaultSharing и двух UI source files их sha256 совпали на обеих машинах, полный тест повторно успешен. коммитов нет.

![подтверждение изолированного account cross-device теста](<../test-results/screenshots/account-cross-device.png>)
