# BUILD.md — Регламент Сборки и Запуска SLAG v2

> Обязательное руководство для автономных ИИ-агентов и разработчиков.  
> Определяет, какую сборку запускать, когда пересобирать нативный Rust-слой, а когда ограничиться веб-бандлом.

---

## 1. Матрица Режимов Сборки

| Режим | Команда | Назначение | Время | Зависимость от портов |
|---|---|---|---|---|
| **Web Fast Check** | `npm run build`<br>`npm run lint` | Проверка TypeScript-типов, синтаксиса и сборки Vite. | ~2 сек | Нет |
| **E2E Testing** | `npx playwright test` | Прогон Playwright-тестов в headless Chromium (чистый View). | ~15–30 сек | Нет (Vite запускается тестом) |
| **Desktop Live (HMR)** | `npm run dev:desktop`<br>*(запускать через `tauri dev`, не обычный `cargo build`)* | **Основной режим разработки**: живое обновление UI в нативном окне без перезапуска. | ~1 сек | Требует `localhost:5173` |
| **Standalone Release** | `npm run build:desktop`<br>*(или `cargo build --release`)* | **Автономный бинарник**: файлы вшиты внутрь бинарника, работает оффлайн без Node.js. | ~1–3 мин | **Не использует порты** (0 сетевых зависимостей) |

---

## 2. Алгоритм Выбора Сборки для Агента

```text
                  Изменился только React / TS / CSS в src/?
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
                ДА                                НЕТ (изменен src-tauri/)
                 │                                 │
     СНАЧАЛА ПРОВЕРИТЬ РЕЖИМ ОКНА                         │
     1. npm run lint                               │
     2. npm run build                              │
     3. При запущенном dev-сервере                 │
        HMR работает ТОЛЬКО в tauri dev              │
                                                   ▼
                                       Что изменилось в src-tauri?
                                                   │
                 ┌─────────────────────────────────┴─────────────────┐
                 ▼                                                   ▼
       Только логика / права                               Финальный релиз
       (lib.rs, capabilities, tauri.conf)                  или запрос на автономный .exe
                 │                                                   │
                 ▼                                                   ▼
       Быстрый debug-билд:                                Полный релизный билд:
       & "$env:USERPROFILE\.cargo\bin\cargo.exe" build    npm run build:desktop
```

---

## 3. Регламент Запуска Desktop Live (HMR)

Только `npm run dev:desktop` (`tauri dev`) гарантирует загрузку `http://localhost:5173` и HMR. Папка `target/debug` сама по себе этого НЕ гарантирует: в Cargo.toml по умолчанию включён `custom-protocol`, поэтому обычный `cargo build` вшивает `dist/` даже в debug-бинарник.

Для доставки embedded debug на каждую машину: `npm run build`, затем `cargo build --manifest-path src-tauri/Cargo.toml`, затем запуск свежего бинарника. После изменений frontend этот бинарник тоже нужно пересобрать. Наличие работающего Vite и HTTP 200 не доказывает актуальность окна.

### Чек-лист запуска в режиме HMR:
1. **Убедиться, что старый экземпляр SLAG закрыт** (завершить только подтверждённый процесс SLAG, не все Node):
   - **Linux**: `pkill -f 'src-tauri/target/debug/slag-v2'` (проверить командную строку перед завершением)
   - **Windows**: завершить только процесс с `Path` == `...\src-tauri\target\debug\slag-v2.exe`
2. **Запустить через Tauri** (он сам поднимет dev-сервер и подключит окно к нему):
   ```bash
   npm run dev:desktop
   ```
   Не запускать отдельный `pnpm dev`/`npm run dev` перед этим и не запускать debug-бинарник напрямую: при default `custom-protocol` обычный debug-бинарник вшивает `dist/`, поэтому без `tauri dev` HMR не будет.

### Чек-лист запуска автономного (embedded) окна:
1. `npm run build` — собрать свежий frontend.
2. `cargo build --manifest-path src-tauri/Cargo.toml` — вшить `dist/` в debug-бинарник.
3. Завершить только подтверждённый процесс SLAG, затем запустить свежий бинарник.
4. Профиль WebView, localStorage и сессии не удалять. После любых изменений frontend повторить шаги 1–3; наличие работающего Vite и HTTP 200 не доказывает актуальность окна.

---

## 4. Регламент Standalone Release

Релизный бинарник (`src-tauri/target/release/slag-v2` на Linux, `.exe` на Windows) полностью автономен:
- Все статические файлы (`dist/`) компилируются и вшиваются внутрь исполняемого файла.
- Протокол `tauri://localhost` обрабатывается локальным IPC Rust-рантайма.
- **Никаких открытых локальных портов, серверов Node.js или Edge/WebKit-ошибок.**

### Сборка:
```bash
npm run build:desktop
# либо вручную:
npm run build
cargo build --release --manifest-path src-tauri/Cargo.toml
```

---

## 5. Типичные Ошибки и Решения (Troubleshooting)

### Ошибка 1: WebView2 / WebKit «can't reach this page / localhost refused to connect»
- **Первопричина**: Окно в режиме dev URL не видит Vite на `http://localhost:5173`. Сначала выяснить режим сборки: обычный `cargo build` с default `custom-protocol` использует встроенный dist даже в debug.
- **Решение**: Для HMR запускать `npm run dev:desktop`; для автономного окна выполнить `npm run build` + `cargo build --manifest-path src-tauri/Cargo.toml` и запустить свежий debug-бинарник либо собрать release.

### Ошибка 2: «Port 5173 is in use, trying another one...»
- **Первопричина**: Предыдущий фоновый процесс Vite не был убит, и сервер перескочил на порт `5174`. Десктопное окно ищет `5173` и падает.
- **Решение**: В `vite.config.ts` зафиксирован `strictPort: true`. Проверить командную строку владельца порта и завершить только подтверждённый процесс SLAG Vite, затем перезапустить `npm run dev:desktop`. Не завершать все процессы Node: среди них могут быть DSH и MCP.

### Ошибка 3: «cargo: command not found»
- **Первопричина**: В текущей сессии переменная `PATH` может не содержать каталог Rust.
- **Решение**: На Linux установить через `sudo pacman -S --needed rust` (или `rustup`), на Windows использовать прямой путь: `& "$env:USERPROFILE\.cargo\bin\cargo.exe"`.

### Ошибка 4: «forbidden path: .../.trash» на Linux
- **Первопричина**: На Unix системы glob-шаблоны Tauri по умолчанию требуют явного совпадения точки (`requireLiteralLeadingDot: true`).
- **Решение**: В `tauri.conf.json` в секции `plugins.fs` настроено `"requireLiteralLeadingDot": false`.

---

## 6. Кроссплатформенная Адаптация и Системные Хоткеи

SLAG v2 автоматически определяет платформу при запуске и установке:

1. **Linux (Wayland + GNOME)**:
   - Из-за ограничений безопасности Wayland глобальные шорткаты регистрируются через системный демон GNOME Media Keys (`org.gnome.settings-daemon.plugins.media-keys`).
   - При первом запуске автоматически прописывается биндинг `Ctrl+Shift+Space` -> `<path_to_binary> --quick`.
   - Только release-сборка регистрирует `~/.local/share/applications/com.slag.notes.desktop` и иконку. Debug-сборки не меняют системный ярлык и хоткей.
   - На Linux повторное открытие основного окна вызывает GTK `present()` на главном потоке вместо Tauri `set_focus()`; ярлык объявляет `StartupNotify=true`.
   - Linux-сборка по умолчанию выставляет `WEBKIT_DISABLE_DMABUF_RENDERER=1` до старта GTK: DMA-BUF путь WebKitGTK перерисовывает угол окна устаревшим буфером (мерцание). Переменную окружения можно переопределить снаружи.
2. **Linux (Wayland non-GNOME / Hyprland / Sway)**:
   - В настройках («Горячие клавиши») отображается готовая строка биндинга для конфигурационного файла тайлингового менеджера (`bind = CTRL SHIFT, SPACE, exec, <path> --quick`).
3. **Windows / macOS / Linux X11**:
   - Автоматически используется нативный глобальный хук `tauri-plugin-global-shortcut`.

### Сервисные CLI-флаги бинарника:
- `./slag-v2 --quick`: мгновенно открывает окно быстрой мысли через IPC одиночного инстанса.
- `./slag-v2 --install-system`: генерирует `.desktop`-файл и привязывает хоткей в GNOME без запуска окна GUI (идеально для инсталляторов и пакетов).
- `./slag-v2 --uninstall-system`: отвязывает шорткат из GNOME.

---

## 7. Сборка и Отладка на Android (Tauri v2 Mobile)

### Переменные окружения (настроены в `~/.bashrc`):
```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/26.1.10909125"
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk"
export PATH="$HOME/.cargo/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

### Команды для агента и разработчика:
| Команда | Описание |
|---|---|
| `npm run build:android` | Собрать `app-universal-debug.apk` (Vite frontend + Rust aarch64 cdylib + Gradle APK). |
| `npm run android:install` | Установить собранный APK на подключенное по USB / Wi-Fi Android-устройство через `adb`. |
| `npm run android:run` | Запустить установленное приложение `com.slag.notes` на устройстве. |
| `npm run android:log` | Читать консольные логи в реальном времени (`RustStdoutStderr`, `SLAG`, `chromium`). |
| `adb exec-out screencap -p > <path>.png` | Снять скриншот экрана мобильного устройства для визуальной инспекции. |

### Иконки android
`python scripts/build-android-icons.py --scale 0.56` пересобирает `src-tauri/icons/android/**` из `src-tauri/icons/icon.png`. `--scale` — доля adaptive-канвы (108dp) под шар. Лончеры читают канву по-разному: одни показывают все 108dp плиткой, другие режут до центральных 72dp и шар выглядит в 1.5 раза крупнее. Honor UniHome показывает всю канву (проверено по фото собственной иконки), поэтому масштаб равен доле плитки у референса — 0.56. `--preview <path> [--before <старая foreground.png>]` отрисует, как это выглядит под скруглением и кругом.

`src-tauri/gen/**` в gitignore, и tauri кладёт туда mipmap только при инициализации проекта, а не на каждой сборке. Скрипт сам копирует результат в `gen/android/app/src/main/res/`, если проект уже сгенерирован; без этого правка иконок остаётся только в git.
