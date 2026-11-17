# обновление по дистриву: ubuntu → deb, arch → pkg, остальные → AppImage

- **цель**: `Обновления` предлагает то, чем эта машина реально обновится. ubuntu/debian — `.deb`,
  arch — `pkg.tar.zst`, любой другой дистр — AppImage. AppImage обновляется сам, пакет — командой,
  которую приложение кладёт в буфер (root из gui не берём)
- **трогаем**: `scripts/release-assets.mjs` (слоты deb/archpkg в манифесте), `src-tauri/src/updater.rs`
  (определение дистрива, выбор ассета, `can_apply` только для appimage, новая команда
  `update_download_package`), `src-tauri/src/lib.rs` (регистрация команды),
  `src/lib/platform/appUpdate.ts`, `src/context/hooks/useAppUpdates.ts`,
  `src/components/Settings/UpdatesSettingsTab.tsx`, `src/types/index.ts`, `docs/RELEASING.md`
- **не трогаем**: протокол релея, окно обновления windows/android, самообновление AppImage —
  оно уже написано и работает, ему только мешал `can_apply`
- **готово когда**: `npm run check`, `npm run build`, `cargo check` на ноуте, playwright на вкладке
  обновлений; в манифесте релиза появились `linux-x86_64.deb` и `linux-x86_64.archpkg`
- **уже выяснили**:
  - `can_apply: cfg!(windows || android)` — поэтому на linux кнопка «обновить» не показывается даже
    для AppImage, хотя ветка замены файла в Rust есть (`updater.rs`, linux → appimage);
  - `offer_from` сравнивает версии как semver, поэтому сборка из репы (базовая `0.2.5`) всегда
    «новее» дев-канала `0.2.5-dev.N`; на ноуте апдейтов не увидит ни при каком коде, пока база не уедет;
  - деб и zst уже лежат в релизе, но манифест про них не знает: `slotOf` возвращает null.

---

после работы: что оказалось не так, как думали, и что осталось.
