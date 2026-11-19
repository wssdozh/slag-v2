# манифест хранилища в синке, метла вложений, быстрый старт

- **цель**: после старта приложение само сверяет свой корень с тем, что лежит в комнате, и при расхождении один раз переотправляет состояние; панель «состояние» показывает строку «сервер: сходится / расходится». висячие вложения убираются в архив чистки штатным ремонтом. старт не читает корзину последовательно.
- **трогаем**: `src/lib/sync/manifestChannel.ts`, `src/lib/sync/manifestSync.ts` (новый), `src/lib/sync/syncEngine.ts`, `src/lib/sync/pushBundle.ts`, `src/lib/sync/types.ts`, `src/hooks/ui/useIntegrity.ts`, `src/components/Settings/vault/integrity/IntegrityPanel.tsx`, `src/components/Settings/vault/integrity/IntegritySection.tsx`, `src/lib/vault/integrity/types.ts`, `src/lib/vault/integrity/repair.ts`, `src/lib/vault/integrity/scanners.ts`, `src/lib/storage/integrityService.ts`, `src/lib/storage/vaultFiles.ts`, `scripts/vault-doctor.mjs`, `scripts/integrity-manifest-wire.test.mjs`, `scripts/integrity-repair.test.mjs`, `scripts/integrity-scanners.test.mjs`, `e2e/slag/vault_integrity.spec.ts`, `docs/sync-architecture.md`.
- **не трогаем**: релей (`wssdozh/slag-relay`) — маршрут `/manifest` уже в проде и держит только `root` + `folders`; шифрование бандлов; `applyBundle` (LWW не меняется); `attachmentData.ts`; раскладку модулей.
- **готово когда**: на пк и ноуте в логе `манифест v1: …` с одинаковым `root`; `vault-doctor` на пк не находит висячих вложений; `npm run check`, `npm run build`, `node --test`, плейрайт зелёные; dev-релиз собран и обе машины на нём.
- **уже выяснили**:
  - комната одна (`room_1a8643ca…`), но курсоры 3928 / 3933 и `stateHash` `7009bd7a…` / `970b7ddc…` — машины разъезжаются молча.
  - релей отбрасывает `leaves` при записи (`routes_manifest.py`), `GET` отдаёт `root` + `folders` + `syncId`, `204` на `since >= sync_id`. `diffWire` уже переживает отсутствие листьев.
  - `forceFullPush` читается после гейта «ничего не изменилось» — на спокойном хранилище полный ресэнд не случается никогда.
  - 67 висячих вложений (36 МБ из 49.9 МБ), но 11 из них названы в заметках ноута, которых пк не знает: метла обязана идти после схождения.
  - корзина: 270 файлов; чистый `fs` — 206 мс подряд против 59 мс по 8. в приложении 1.5 с — это 270 последовательных IPC, а не диск.
  - ноут: 31 запись папок при 24 каталогах; лишние 10 — три пустых каталога (`Архив`, `Личное/Контент`, `Проекты/медиа/Идеи`) и 7 призраков без каталогов.

---

## после работы

(заполняется по факту)
