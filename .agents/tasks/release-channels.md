# релизные каналы и ci/cd на github

## цель

собирать и публиковать релизы из github actions по тегам и пушу в `master`, а не руками
через `publish-release.ps1`; в клиенте дать выбор канала `release` / `beta` / `dev`, и описать
правила версионности так, чтобы по ним можно было жить без устных договорённостей.

## что трогаем

- `.github/workflows/release.yml` — переезд на `push: tags v*`, `push: branches master` (dev) и
  ручной запуск; метаданные релиза считает `scripts/release-meta.mjs`.
- `.github/workflows/ci.yml` — мелкая унификация установки pnpm, поведение то же.
- `scripts/release-meta.mjs` — единственное место, где живёт правило «ref → версия, канал, тег,
  prerelease». его же гоняет ручной запуск воркфлоу, он же покрыт `node --test`.
- `scripts/release.mjs` — подпись артефактов, `latest.json`, публикация через `gh release`.
  заменяет `scripts/publish-release.ps1`.
- `src-tauri/src/updater.rs` — `Channel`, адрес манифеста на канал, команды принимают канал.
- `src/lib/platform/appUpdate.ts`, `src/context/hooks/useAppUpdates.ts`,
  `src/components/Settings/UpdatesSettingsTab.tsx`, `src/types/index.ts`, `src/config` — выбор
  канала, хранение в `localStorage['slag:update-channel']`, строка в настройках.
- `docs/RELEASING.md` — правила версий, каналов, versionCode и откатов.

## чего не трогаем

- `tauri-plugin-updater` не подключаем: своя механика (sha256 + minisign) остаётся.
- linux себя не обновляет — как и было, канал влияет только на показ версии.
- формат `latest.json` не меняется: старый клиент продолжает читать `latest`.

## критерий готовности

- `npm run check` — 0 warnings / 0 errors, `cargo check` в `src-tauri` — чисто.
- `node --test scripts/release-meta.test.mjs` — зелёный (правила каналов).
- в настройках видна строка канала, переключение меняет адрес манифеста, e2e на это зелёный.
- тег `v1.2.3` даёт обычный релиз, `v1.2.3-beta.1` и пуш в master — prerelease в свой канал.

## как оказалось на самом деле

(дописывается после работы)
