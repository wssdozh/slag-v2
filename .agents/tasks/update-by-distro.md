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

- **думали** «AppImage-ветка мертва из-за `can_apply`». так и есть: код замены файла был целый,
  флаг `cfg!(windows || android)` отрубал его на всех linux. теперь `can_apply_here()` сравнивает
  `linux_form()` с `AppImage`, и кнопка «обновить» появляется ровно у AppImage.
- **e2e на новый поток не написать честно**: в браузере `isTauri()` ложно, нативная сторона не
  отвечает, и вкладка остаётся в режиме «работает только в приложении». существующая
  `e2e/app_update.spec.ts` зелёная (3 теста), но кнопку «скачать пакет arch» она не увидит —
  её проверяют типы, `cargo check` и юнит-тест `os_release_names_the_package_this_machine_installs`.
- **на ноуте поток всё равно не покажется**: сборка из репы имеет версию `0.2.5`, а канал раздаёт
  `0.2.5-dev.N` — semver считает пре-релиз старше, и `offer_from` отвечает «up to date». чтобы
  увидеть кнопку, нужен пакет или AppImage (у них версия `0.2.5-dev.N`).
- **живой AppImage на ноуте (dev.27) показывает `canApply: true`, `form: appimage`** — значит замена
  файла разрешена; проба платформы логируется строкой `platform probe`.
- **незакрытое**: тихий чек после старта в AppImage так и не пишет ни `check`, ни `silent check
  failed`, хотя `platform` есть и `primary: true`. в реп-сборке тот же код чекается. следующий шаг —
  логировать сам вход в таймер (`setTimeout` → runCheck) и посмотреть, не пересоздаётся ли
  `runCheck` на каждом рендере, очищая таймер (в deps `[addToast, channel]`).
- **осталось**:
  - rpm, msi и flatpak в манифест не попадают: CI их не собирает, поэтому «прочий дистр» получает
    AppImage и `chmod +x`. когда появится rpm-сборка, хватит слота в `release-assets.mjs` и ветки
    в `select_package_asset`;
  - слоты deb/archpkg появляются в манифесте только со следующего релиза; до него клиент видит
    `kind: manual` и показывает ссылку на страницу релиза — это штатный фолбэк, а не поломка;
  - на ноуте нет `gst-plugins-*`: `autoaudiosink not found`, плеер в правой панели не заиграет
    (`sudo pacman -S --needed gst-plugins-base gst-plugins-good gst-libav`).
