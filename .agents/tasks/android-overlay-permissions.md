# android: разрешения на оверлей, будильники и обновление в один тап

- **цель**: в приложении на android видно и можно включить: показ поверх других приложений,
  будильники поверх экрана (full-screen intent), системные уведомления; кнопка обновления
  называется `обновить`, а если установка из этого источника запрещена — рядом есть
  `разрешить установку`, и после возврата из настроек установка продолжается сама один раз.
- **трогаем**: `AndroidManifest.xml`, `DeviceAccessPlugin.kt`, `src-tauri/src/device_access.rs`,
  `lib.rs`, `updater.rs` (PlatformInfo), `src/lib/platform/{deviceAccess,installResume}.ts`,
  `src/context/hooks/useAppUpdates.ts`, `src/hooks/useDeviceAccess.ts`,
  `src/components/Settings/notifications/{PermissionsGroup,accessCopy}.tsx`,
  `NotificationsSettingsTab.tsx`, `UpdatesSettingsTab.tsx`, `src/types/index.ts`, e2e-спек.
- **не трогаем**: пайплайн проверки подписи apk, windows/linux-ветки обновления, манифест
  подписи, `docs/CODE_MAP.md`, соседние worktree.
- **готово когда**: `npm run check` чистый; `cargo check` для десктопа и для
  `aarch64-linux-android` проходит; на устройстве (его нет) — не проверено.
- **уже выяснили**: три разрешения — не runtime-диалоги, их можно только показать в системных
  настройках; `PackageManager.canRequestPackageInstalls()` живёт только в Kotlin, поэтому
  `update_platform` стал async и спрашивает мост.

---

после работы: устройства в `adb devices` нет, установка и системные экраны проверены только
чтением кода; `SYSTEM_ALERT_WINDOW` на некоторых прошивках открывает список приложений, а не
строку этого приложения — интент с `package:` там игнорируется, это поведение ОС.
`POST_NOTIFICATIONS` запрашивается плагином уведомлений, здесь только манифест и статус.
