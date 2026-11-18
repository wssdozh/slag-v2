# ветка A аудита: мёртвый код

- **цель**: выпилить из `src/` то, что пишется, но не читается, и не менять при этом поведение: те же
  файлы на диске, те же события, те же id (кроме формата — см. ниже), те же настройки.
- **трогаем**: `src/lib/storage/{vaultFiles,port,browserPort,prefs,index,vaultTransfer}.ts`,
  `src/lib/sync/{localBookkeeping,tombstones,entities/registry,pushBundle}.ts`,
  `src/lib/platform/secretStore.ts`, `src/node/{secrets,stubs/browserPort}.ts`,
  `src/types/index.ts`, `src/config/storage.ts`, `src/mcp/vault.ts`, `src/lib/backupService.ts`,
  `src/components/FolderProfile/FolderProfileHeader.tsx`, `config/vite.node.config.ts`,
  `scripts/sync-tombstones.test.mjs` и 12 мест с `Date.now() + Math.random()`.
- **не трогаем**: `package.json`, `docs/CODE_MAP.md`, `src-tauri/`, релей, и всё из раздела
  «отдельным проходом» аудита (секции `state.json`, легаси-мерж, очереди записи).
- **готово когда**: `npm run check` (0/0), `npm run build` (все четыре шага), `npm run test:scripts`,
  `PLAYWRIGHT_WORKERS=1 npx playwright test e2e/quick_shots.spec.ts e2e/sync_delete.spec.ts
  e2e/slag/storage_usage.spec.ts` — зелёные.
- **уже выяснили**:
  - `state.updatedAt` пишут три места в `vaultFiles.ts`, читает ноль: `state` — это
    `Record<string, unknown>`, ключ нигде не разбирается.
  - `StorageService` действительно удовлетворяет `VaultPort` (19 методов, `subscribeChanges`,
    `saveMemory → boolean`), кроме имени `hasBytes` → `hasAttachmentBytes`. Значит адаптер
    `browserPort.ts` не нужен, а `vault()` может вернуть сам сервис. Node-сборка подменяет
    `./index` из `port.ts` стабом — иначе в бандл приедет весь StorageService.
  - `BroadcastChannel` шлёт черновики и в браузере (`afterBrowserDraft`), и на нативе
    (`flushQueue`), поэтому слушатель `storage`-события по ключу черновиков дублирует его.
  - по id с таймстампом (`log_`, `att_`, `op_`, `item_`) таймстамп нигде не парсится. Но
    `backupService` вытаскивает id вложения из имени файла регуляркой `att_[0-9a-z_]+` — с
    uuid-хвостом (дефисы) она перестанет совпадать, поэтому класс символов расширяется на `-`.
  - `src/lib/storage/index.ts:133` — не копия `Date.now() + random`, а fallback самого
    `crypto.randomUUID()`; трогать нечего.

---

после работы допиши: что оказалось не так, как думали, и что осталось.
