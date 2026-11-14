# обновление клиента прямо из клиента (windows + android, linux — вручную)

- **цель**: кнопка в приложении сама проверяет новую версию на github-релизах, качает и ставит её: на windows подменяет exe (в т.ч. установленный через nsis) и перезапускает приложение, на android открывает системный установщик apk. linux показывает «доступна 0.2.0» и ссылку на страницу релиза.
- **трогаем**: новый `src-tauri/src/updater.rs`, правки `src-tauri/src/lib.rs` / `main.rs` / `Cargo.toml`, новый `src-tauri/updater.pubkey`, новый `src-tauri/gen/android/app/src/main/java/com/slag/notes/ApkInstallerPlugin.kt`, `AndroidManifest.xml`; `src/types/index.ts`, новый `src/lib/platform/appUpdate.ts`, новый `src/context/hooks/useAppUpdates.ts`, `src/context/AppContext.tsx`, `src/context/appContext.types.ts`, `src/config/settingsTabs.ts`, новый `src/components/Settings/UpdatesSettingsTab.tsx`, `src/components/Modals/SettingsModal.tsx`, `src/components/Sidebar/Sidebar.tsx`, `src/components/Mobile/MobileSettingsView.tsx`; `scripts/publish-release.ps1`, `BUILD.md`, `docs/RELEASING.md`, `e2e/`.
- **не трогаем**: релей и его деплой (обновления живут в github), синк, `tauri-plugin-updater` (не подключаем: он десктопный и ставит установщик), схему `versionCode`, `bundle.targets`, существующие вкладки настроек.
- **готово когда**: на windows-копии 0.1.0 кнопка ставит 0.2.0 и приложение само перезапускается; на android apk ставится поверх с сохранением данных; подмена sha256/подписи отменяет установку; `npm run check`, `npm run build`, `npx playwright test e2e/settings_consistency.spec.ts e2e/app_update.spec.ts` зелёные.
- **уже выяснили**: `tauri-plugin-updater` — только desktop; mobile-ota в tauri нет (обсуждение tauri-apps#8467); репо `wssdozh/slag-v2` приватный, `gh` авторизован под `wssdozh`; в `gen/android` уже закоммичены свои kotlin-плагины (`DeepLinkPlugin.kt`, `MediaGalleryPlugin.kt`), FileProvider уже в манифесте; `versionCode` 1000 = 0.1.0, формула `major*1e6+minor*1e3+patch`; релизный apk подписывается `~/.android/debug.keystore`, поэтому `install -r` поверх работает; nsis по умолчанию ставит в `%LOCALAPPDATA%\SLAG` (currentUser) — подмена exe там возможна, а в `Program Files` нужен fallback на установщик; `self_replace` крейт заменяет файл, но не перезапускает приложение, поэтому helper-режим у нас свой.

---

после работы допиши: что оказалось не так, как думали, и что осталось.

## что оказалось не так

- `.sig` от `tauri signer sign` — это **base64** от armored minisign-подписи, а не сам armored текст. `Signature::decode` его не читает (`Invalid encoding in minisign data`). Публичный ключ тоже base64 → `PublicKey::decode`. Поймал на `--update-check`; после base64-развёртки `status=ready`, `verified=true` на реальном 20-мегабайтном exe.
- `self-replace`-подход не понадобился: хелпер — это тот же бинарь с `--apply-update <target> <pid>`. Он копирует себя в `<target>.new`, переименовывает target в `.old-<ts>`, ставит новый, ждёт удаляемости `.old` (на windows это и есть «старый процесс вышел»), запускает новый. Проверено вживую: 20.3 МБ release заменён на 30.4 МБ debug, `.old` и `.new` не остались.
- Перезапуск после подмены на windows проверить мешал `tauri-plugin-single-instance`: пока запущен другой экземпляр, поднятый процесс сразу выходит. Файл при этом подменяется корректно; чистый сценарий проверяется при закрытом приложении.
- Windows PowerShell 5.1 читает `.ps1` без BOM как ANSI: кириллица в скрипте рвёт парсер. `scripts/publish-release.ps1` обязан быть UTF-8 **с BOM**. Плюс `$ErrorActionPreference='Stop'` превращает любой stderr от native-команды (`npx`, `gh`) в терминальную ошибку — на время вызова внешней команды его надо ослаблять до `Continue`, а exit code читать вручную.
- `Invoke-WebRequest` в PS 5.1 отдаёт JSON-тело как `byte[]` → `ConvertFrom-Json` получает мусор. Декодировать в UTF-8 явно (иначе скрипт публикации «не видит» уже опубликованный latest.json).
- Android на windows: сборка падает только на симлинке, `libslag_lib.so` при этом уже собран; обход штатный (BUILD.md §7). Release apk получается **unsigned**, подпись — `apksigner` с `~/.android/debug.keystore`; `versionCode` пришлось ставить руками (2000 для 0.2.0, 2001 для 0.2.1), `tauri android build` до этого не доходит.
- `adb exec-out screencap -p > file` в PowerShell 5.1 портит PNG (2-байтовые переводы строк) — снимать через `adb shell screencap -p /sdcard/x.png` + `adb pull`. И устройство часто в Dozing: перед запуском `input keyevent KEYCODE_WAKEUP`.
- e2e: первый прогон после правки графа модулей ждёт холодную сборку Tailwind (~40–60 с), поэтому тест с `--timeout=60000` падает на `goto`; дефолтные 180 с из `playwright.config.ts` проходят. `PLAYWRIGHT_WORKERS=1` для пары табов — ок.
- `--update-check` (CLI) оказался главным способом проверить всю цепочку «манифест → скачивание → sha256 → подпись» без клика в окне: GUI-сборка на windows не имеет консоли, но `Start-Process -RedirectStandardOutput` ловит stdout и у `windows_subsystem=windows`.
- На телефоне вообще не было видно, что происходит: `eprintln!` уходит в logcat, а не в интерфейс. Добавлено событие `slag://update-log`, фронт пишет его в общий лог со scope `UPDATE`, и на вкладке появилась строка «канал» с фактическим адресом манифеста. Теперь любой шаг виден в «Логи & Диагностика».
- Статусы-сообщения не должны жить строками в карточке: ошибка проверки/установки — тост с русским текстом (`updateErrorText`), а «разрешить установку из неизвестного источника» — вопрос через существующий `confirmAction`, потому что это решение, а не сообщение. Постоянная строка «новых версий нет» и inline-ошибки удалены.
- На устройстве был установлен apk **0.2.0**, собранный до фикса base64-подписи: он уже скачивал 64%, но падал на `signature_invalid`. Это подтвердило, что проверка подписи реально работает и что старые сборки нужно обновлять вручную один раз.

## что осталось

- Проверка полного пути на windows: нажать «скачать и установить» в живом окне и убедиться, что приложение само поднялось в новой версии (файловая подмена и запуск проверены по отдельности).
- Проверка обновления на телефоне с релиза 0.2.1 (вкладка «обновления» → скачать apk → системный установщик → версия 0.2.1).
- `-SkipBuild`-путь публикации проверен, полный (`npm run check/build/desktop` внутри скрипта) — нет.

